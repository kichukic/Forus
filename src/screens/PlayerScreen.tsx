import { useCallback, useEffect, useRef, useState } from 'react';
import {
  findNodeHandle,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  useTVEventHandler,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { HWEvent } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { PlayerControls, ProgressLine, type PlaybackTime } from '../components/PlayerControls';
import type { ShellControls } from '../components/PlayerShell';
import { RelatedPanel } from '../components/RelatedPanel';
import { SourcePicker } from '../components/SourcePicker';
import {
  BRIDGE_JS,
  ORIGIN,
  getDirectSources,
  getFrontendSources,
  getPrimarySources,
  type Source,
} from '../api/sources';
import { markBlocked, markFailed, markWorked } from '../api/sourceHealth';
import { colors, isTV, sz } from '../theme';
import type { Playable, YouTubePlayable } from '../types';

// 101/150: the owner disabled embedding. 152/153: embed configuration rejected.
const EMBED_BLOCKED = [101, 150, 152, 153];

const SKIP_SECONDS = 10;
// How long after the last skip press the player actually jumps.
const SEEK_SETTLE_MS = 550;
// A repeat of the same remote key sooner than this is the same press.
const KEY_REPEAT_MS = 120;
// Still loading this long after a jump counts as stuck…
const STALL_MS = 8000;
// …as long as the jump was recent.
const STALL_WINDOW_MS = 20000;

// A source that never reports back is treated as broken.
const READY_TIMEOUT_MS = 14000;

// Only the TV build of React Native has this hook; Expo Go on a phone doesn't.
const useRemote: typeof useTVEventHandler = useTVEventHandler ?? (() => {});

function youtubeAppUrl(item: YouTubePlayable): string {
  return item.kind === 'live'
    ? `https://www.youtube.com/channel/${item.channelId}/live`
    : `https://www.youtube.com/watch?v=${item.videoId}`;
}

type Props = {
  item: YouTubePlayable;
  onClose: () => void;
  // Plays something from the related list under the video.
  onPlay: (item: Playable) => void;
  // Set when the player sits in the mini-player shell (which also pads the top).
  shell?: ShellControls;
};

export function PlayerScreen({ item, onClose, onPlay, shell }: Props) {
  const webview = useRef<WebView>(null);
  const sources = useRef<Source[]>([]);
  const index = useRef(0);
  const { width, height } = useWindowDimensions();
  // In the corner window only the video is shown.
  const mini = shell?.mini ?? false;

  const [list, setList] = useState<Source[]>([]);
  const [current, setCurrent] = useState<Source | null>(null);
  const [failed, setFailed] = useState(false);
  // TV: the focusable surface over the video, and its native tag so remote
  // Left/Right/Down can be pointed back at it.
  const surface = useRef<View>(null);
  const [surfaceTag, setSurfaceTag] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (!isTV) return;
    const tag = findNodeHandle(surface.current);
    if (tag) setSurfaceTag(tag);
  }, [failed]);
  const failedRef = useRef(false);
  // The source that last reported 'ready'; the ready timeout leaves it alone.
  const readyId = useRef<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [time, setTime] = useState<PlaybackTime>({ t: 0, d: 0 });
  const timeRef = useRef(time);
  timeRef.current = time;
  // Skips are gathered: each press moves the target, and the player jumps once
  // the presses stop. A burst of separate jumps (or a held key) can leave the
  // TV's player stuck loading.
  const pendingSeek = useRef<{ target: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const lastSeek = useRef<{ at: number; target: number } | null>(null);
  const [seekTarget, setSeekTarget] = useState<number | null>(null);
  const lastKey = useRef<{ type: string; at: number } | null>(null);
  const [external, setExternal] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [trying, setTrying] = useState<string | null>(null);

  const blockedKey =
    item.kind === 'video' ? `embed:${item.videoId}` : `embed:${item.channelId}`;

  const send = (name: string, arg = 0) =>
    webview.current?.injectJavaScript(
      `if (window.cmd) { window.cmd(${JSON.stringify(name)}, ${arg}); } true;`,
    );

  const seekBy = (seconds: number) => {
    const { t, d } = timeRef.current;
    const from = pendingSeek.current?.target ?? t;
    // Recorded videos can't go past their end; live streams keep growing.
    const target = Math.max(0, item.kind === 'live' || d <= 0 ? from + seconds : Math.min(d - 1, from + seconds));
    if (pendingSeek.current) clearTimeout(pendingSeek.current.timer);
    const timer = setTimeout(() => {
      send('seekTo', target);
      pendingSeek.current = null;
      lastSeek.current = { at: Date.now(), target };
      setSeekTarget(null);
    }, SEEK_SETTLE_MS);
    pendingSeek.current = { target, timer };
    setSeekTarget(target);
  };

  // If the player is still loading a while after a jump, nudge it: jump to the
  // same spot again and press play.
  useEffect(() => {
    const seek = lastSeek.current;
    if (!buffering || !seek || Date.now() - seek.at > STALL_WINDOW_MS) return;
    const timer = setTimeout(() => {
      send('seekTo', seek.target);
      send('play');
      lastSeek.current = null;
    }, STALL_MS);
    return () => clearTimeout(timer);
  }, [buffering]);

  useEffect(() => () => {
    if (pendingSeek.current) clearTimeout(pendingSeek.current.timer);
  }, []);

  // A new source starts its own clock.
  useEffect(() => {
    setTime({ t: 0, d: 0 });
    setBuffering(false);
  }, [current?.id]);

  const pick = useCallback((source: Source) => {
    const at = sources.current.findIndex((s) => s.id === source.id);
    index.current = at >= 0 ? at : 0;
    setCurrent(sources.current[index.current]);
    failedRef.current = false;
    setFailed(false);
    setPaused(false);
    setPickerOpen(false);
    setTrying(source.label);
  }, []);

  const advance = useCallback((from: number) => {
    const next = sources.current[from + 1];
    if (!next) {
      failedRef.current = true;
      setFailed(true);
      setTrying(null);
      return;
    }
    index.current = from + 1;
    setCurrent(next);
    setTrying(next.label);
  }, []);

  useEffect(() => {
    let alive = true;
    // The official sources start right away; the third-party ones are slower
    // and only matter when the first ones fail.
    getPrimarySources(item).then((primary) => {
      if (!alive) return;
      sources.current = primary;
      setList(primary);
      if (primary.length > 0) {
        index.current = 0;
        setCurrent(primary[0]);
      }

      // Direct streams are tried before the embed frontends: they are the
      // ones that still work when a channel refuses embeds.
      Promise.all([getDirectSources(item), getFrontendSources(item)]).then(
        ([direct, frontends]) => {
          if (!alive) return;
          const rest = [...direct, ...frontends];
          if (rest.length === 0) return;
          sources.current = [...primary, ...rest];
          setList(sources.current);
          // Sources that took a while to arrive may still be worth a try.
          if (failedRef.current && index.current + 1 < sources.current.length) {
            advance(index.current);
          }
        },
      );
    });
    return () => {
      alive = false;
    };
  }, [item, advance]);

  // The hint fades, but comes back on every remote press.
  useEffect(() => {
    if (!showHint) return;
    const timer = setTimeout(() => setShowHint(false), 5000);
    return () => clearTimeout(timer);
  }, [showHint]);

  // A source that never becomes ready is no good either.
  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(() => {
      // A source that already started playing is fine, however long ago that was.
      if (readyId.current === current.id) return;
      if (index.current === sources.current.indexOf(current)) {
        markFailed(current.provider);
        advance(index.current);
      }
    }, READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [current, advance]);

  const onMessage = (event: WebViewMessageEvent) => {
    let msg: { type: string; data?: unknown };
    try {
      msg = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'ready') {
      readyId.current = current?.id ?? null;
      markWorked(current?.provider ?? 'unknown');
      failedRef.current = false;
      setTrying(null);
      setFailed(false);
      // A player on another site plays, but the remote cannot steer it.
      setExternal(msg.data === 'external');
    } else if (msg.type === 'time') {
      const data = msg.data as PlaybackTime;
      if (data && typeof data.t === 'number') setTime({ t: data.t, d: data.d || 0 });
    } else if (msg.type === 'state') {
      // YouTube's states: 1 playing, 2 paused, 3 buffering.
      setPaused(msg.data === 2);
      setBuffering(msg.data === 3);
    } else if (msg.type === 'error') {
      const code = Number(msg.data);
      if (EMBED_BLOCKED.includes(code)) {
        // This channel refuses embeds; go straight to the next source.
        markBlocked(blockedKey);
      } else if (current) {
        markFailed(current.provider);
      }
      advance(index.current);
    }
  };

  const onRemote = useCallback(
    (evt: HWEvent) => {
      // Android reports key-down (0) and key-up (1); act once per press. Some
      // TVs send a press twice with no up/down at all, so a repeat of the same
      // key within a moment is dropped too.
      if (String(evt.eventKeyAction) === '0' || pickerOpen) return;
      const now = Date.now();
      if (lastKey.current?.type === evt.eventType && now - lastKey.current.at < KEY_REPEAT_MS) return;
      lastKey.current = { type: evt.eventType, at: now };
      switch (evt.eventType) {
        // OK is handled by the focused surface over the video (see below), so
        // only the remote's own play/pause button is caught here.
        case 'playPause':
          send('toggle');
          break;
        case 'left':
        case 'rewind':
          seekBy(-SKIP_SECONDS);
          break;
        case 'right':
        case 'fastForward':
          seekBy(SKIP_SECONDS);
          break;
        default:
          return;
      }
      setShowHint(true);
    },
    [pickerOpen],
  );
  useRemote(onRemote);

  // A phone held upright shows the video at the top with its title below.
  const portraitPhone = !isTV && height > width;

  return (
    <View style={styles.screen}>
      {current && !failed && (
        <View style={portraitPhone ? styles.videoPortrait : styles.video}>
          <WebView
            key={current.id}
            ref={webview}
            source={
              current.html
                ? { html: current.html, baseUrl: ORIGIN }
                : { uri: current.url ?? '' }
            }
            style={styles.webview}
            // The app's own controls (or, on TV, the remote) drive playback, so
            // the page never gets touches or focus and YouTube's menus stay shut.
            // Only a third-party site's own player is left touchable.
            focusable={!isTV && external}
            pointerEvents={isTV || !external ? 'none' : 'auto'}
            javaScriptEnabled
            domStorageEnabled
            allowsFullscreenVideo
            mediaPlaybackRequiresUserAction={false}
            allowsInlineMediaPlayback
            onLoad={() => {
              if (current.transport === 'dom') {
                webview.current?.injectJavaScript(`${BRIDGE_JS} true;`);
              }
            }}
            onMessage={onMessage}
          />
          {!isTV && !external && !mini && (
            <PlayerControls
              paused={paused}
              buffering={buffering}
              time={time}
              live={item.kind === 'live'}
              onToggle={() => send(paused ? 'play' : 'pause')}
              onSeekBy={seekBy}
              onSeekTo={(sec) => send('seekTo', sec)}
            />
          )}
        </View>
      )}

      {failed && (
        <View style={styles.blocked}>
          <Text style={styles.blockedTitle}>
            {item.kind === 'live'
              ? 'This channel is not streaming right now.'
              : 'No source could play this video.'}
          </Text>
          <Text style={styles.blockedNote}>Try another source, or open it in YouTube.</Text>
          <Pressable
            hasTVPreferredFocus
            onPress={() => setPickerOpen(true)}
            style={({ focused }) => [styles.button, focused && styles.buttonFocused]}
          >
            <Text style={styles.buttonText}>Sources</Text>
          </Pressable>
          <Pressable
            onPress={() => Linking.openURL(youtubeAppUrl(item))}
            style={({ focused }) => [styles.button, focused && styles.buttonFocused]}
          >
            <Text style={styles.buttonText}>Open in YouTube</Text>
          </Pressable>
        </View>
      )}

      {portraitPhone && !failed && !mini && (
        // Dragging the title block down shrinks the player into the corner.
        <RelatedPanel item={item} onPlay={onPlay} dragHandlers={shell?.dragHandlers}>
          <Text style={styles.infoTitle}>
            {item.kind === 'live' ? '● LIVE  ' : ''}
            {item.title}
          </Text>
          <Pressable onPress={() => setPickerOpen(true)} style={styles.link}>
            <Text style={styles.linkText}>
              {trying ? `Trying ${trying}…` : `Source: ${current?.label ?? '…'}`}
            </Text>
          </Pressable>
        </RelatedPanel>
      )}

      {!isTV && !mini && (
        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={[styles.close, { top: (portraitPhone && !failed ? width * (9 / 16) : 0) + 8 }]}
        >
          <Ionicons name="close" size={20} color="#fff" />
        </Pressable>
      )}

      {!isTV && !mini && shell && (
        <Pressable onPress={shell.minimize} hitSlop={12} style={styles.minimize}>
          <Ionicons name="chevron-down" size={22} color="#fff" />
        </Pressable>
      )}

      {isTV && !failed && (
        <>
          {/* The remote starts on the video itself: OK plays and pauses, and
              Up reaches the Sources button. */}
          <Pressable
            ref={surface}
            hasTVPreferredFocus
            // Left and Right skip (see the remote handler), so they mustn't
            // also move focus off the video; only Up leaves it.
            nextFocusLeft={surfaceTag}
            nextFocusRight={surfaceTag}
            nextFocusDown={surfaceTag}
            onPress={() => {
              send(paused ? 'play' : 'pause');
              setShowHint(true);
            }}
            style={StyleSheet.absoluteFill}
          >
            {paused && (
              <View style={styles.pausedBadge}>
                <Ionicons name="pause" size={46} color="#fff" />
              </View>
            )}
          </Pressable>
          <Pressable
            onPress={() => setPickerOpen(true)}
            style={({ focused }) => [styles.sourcesButton, focused && styles.sourcesButtonFocused]}
          >
            <Text style={styles.sourcesButtonText}>Sources</Text>
          </Pressable>
        </>
      )}

      {isTV && !failed && (showHint || paused) && (
        <View style={styles.hint}>
          <Text style={styles.hintTitle} numberOfLines={1}>
            {item.kind === 'live' ? '● LIVE  ' : ''}
            {item.title}
          </Text>
          <Text style={styles.hintKeys}>
            {trying
              ? `Trying ${trying}…`
              : external
                ? 'Playing in the site’s own player    Back: home'
                : item.kind === 'live'
                  ? 'OK: pause / play    Back: home'
                  : 'OK: pause / play    ◀ ▶: 10 seconds    Back: home'}
          </Text>
          {!external && <ProgressLine time={time} live={item.kind === 'live'} target={seekTarget} />}
        </View>
      )}

      {pickerOpen && !mini && (
        <SourcePicker
          sources={list}
          currentId={current?.id ?? ''}
          onPick={pick}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  video: { flex: 1, backgroundColor: '#000' },
  videoPortrait: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
  webview: { flex: 1, backgroundColor: '#000' },
  infoTitle: { color: colors.text, fontSize: 17, fontWeight: '700', lineHeight: 24 },
  link: { marginTop: 8 },
  linkText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  close: {
    position: 'absolute',
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  minimize: {
    position: 'absolute',
    top: 8,
    left: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sourcesButton: {
    position: 'absolute',
    top: sz(12, 24),
    right: sz(12, 32),
    paddingHorizontal: sz(14, 22),
    paddingVertical: sz(7, 10),
    borderRadius: 8,
    borderWidth: 3,
    borderColor: 'transparent',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  pausedBadge: {
    position: 'absolute',
    alignSelf: 'center',
    top: '42%',
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(155,92,255,0.85)',
  },
  sourcesButtonFocused: { borderColor: colors.accent },
  sourcesButtonText: { color: colors.text, fontSize: sz(15, 18), fontWeight: '700' },
  hint: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 48,
    paddingVertical: 24,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  hintTitle: { color: colors.text, fontSize: 22, fontWeight: '700' },
  hintKeys: { color: colors.muted, fontSize: 16, marginTop: 6 },
  blocked: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 48 },
  blockedTitle: { color: colors.text, fontSize: 22, marginBottom: 8, textAlign: 'center' },
  blockedNote: { color: colors.muted, fontSize: 16, marginBottom: 24, textAlign: 'center' },
  button: {
    backgroundColor: colors.surface,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: 'transparent',
    marginBottom: 12,
  },
  buttonFocused: { borderColor: colors.accent },
  buttonText: { color: colors.text, fontSize: 20, fontWeight: '700' },
});
