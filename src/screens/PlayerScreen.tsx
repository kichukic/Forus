import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  useTVEventHandler,
  useWindowDimensions,
  View,
} from 'react-native';
import type { HWEvent } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SourcePicker } from '../components/SourcePicker';
import {
  BRIDGE_JS,
  ORIGIN,
  getExtraSources,
  getPrimarySources,
  type Source,
} from '../api/sources';
import { markBlocked, markFailed, markWorked } from '../api/sourceHealth';
import { colors, isTV } from '../theme';
import type { YouTubePlayable } from '../types';

// 101/150: the owner disabled embedding. 152/153: embed configuration rejected.
const EMBED_BLOCKED = [101, 150, 152, 153];

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
};

export function PlayerScreen({ item, onClose }: Props) {
  const webview = useRef<WebView>(null);
  const sources = useRef<Source[]>([]);
  const index = useRef(0);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [list, setList] = useState<Source[]>([]);
  const [current, setCurrent] = useState<Source | null>(null);
  const [failed, setFailed] = useState(false);
  const failedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [trying, setTrying] = useState<string | null>(null);

  const blockedKey =
    item.kind === 'video' ? `embed:${item.videoId}` : `embed:${item.channelId}`;

  const send = (name: string, arg = 0) =>
    webview.current?.injectJavaScript(
      `if (window.cmd) { window.cmd(${JSON.stringify(name)}, ${arg}); } true;`,
    );

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
    // The official sources start right away; the third-party extractors are
    // slower and only matter when the first ones fail.
    getPrimarySources(item).then((primary) => {
      if (!alive) return;
      sources.current = primary;
      setList(primary);
      if (primary.length > 0) {
        index.current = 0;
        setCurrent(primary[0]);
      }
      getExtraSources(item).then((extra) => {
        if (!alive || extra.length === 0) return;
        sources.current = [...primary, ...extra];
        setList(sources.current);
        // Sources that took a while to arrive may still be worth a try.
        if (failedRef.current && index.current + 1 < sources.current.length) {
          advance(index.current);
        }
      });
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
      markWorked(current?.provider ?? 'unknown');
      failedRef.current = false;
      setTrying(null);
      setFailed(false);
    } else if (msg.type === 'state') {
      setPaused(msg.data === 2);
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
      // Android reports key-down (0) and key-up (1); act once per press.
      if (String(evt.eventKeyAction) === '0' || pickerOpen) return;
      switch (evt.eventType) {
        case 'select':
        case 'playPause':
          send('toggle');
          break;
        case 'left':
        case 'rewind':
          send('seek', -10);
          break;
        case 'right':
        case 'fastForward':
          send('seek', 10);
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
    <View style={[styles.screen, !isTV && { paddingTop: insets.top }]}>
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
            // On TV the remote drives playback through useTVEventHandler, so the
            // WebView must not take focus and swallow the D-pad keys. On a phone
            // you tap YouTube's own controls.
            focusable={!isTV}
            pointerEvents={isTV ? 'none' : 'auto'}
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

      {portraitPhone && !failed && (
        <View style={styles.info}>
          <Text style={styles.infoTitle}>
            {item.kind === 'live' ? '● LIVE  ' : ''}
            {item.title}
          </Text>
          <Pressable onPress={() => setPickerOpen(true)} style={styles.link}>
            <Text style={styles.linkText}>
              {trying ? `Trying ${trying}…` : `Source: ${current?.label ?? '…'}`}
            </Text>
          </Pressable>
        </View>
      )}

      {!isTV && (
        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={[styles.close, { top: insets.top + (portraitPhone && !failed ? width * (9 / 16) : 0) + 8 }]}
        >
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      )}

      {isTV && !failed && (
        <Pressable
          hasTVPreferredFocus
          onPress={() => setPickerOpen(true)}
          style={({ focused }) => [styles.sourcesButton, focused && styles.sourcesButtonFocused]}
        >
          <Text style={styles.sourcesButtonText}>Sources</Text>
        </Pressable>
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
              : item.kind === 'live'
                ? 'OK: pause / play    Back: home'
                : 'OK: pause / play    ◀ ▶: 10 seconds    Back: home'}
          </Text>
        </View>
      )}

      {pickerOpen && (
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
  info: { flex: 1, padding: 16, paddingRight: 56, backgroundColor: colors.background },
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
  closeText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  sourcesButton: {
    position: 'absolute',
    top: isTV ? 24 : 12,
    right: isTV ? 32 : 12,
    paddingHorizontal: isTV ? 22 : 14,
    paddingVertical: isTV ? 10 : 7,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: 'transparent',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sourcesButtonFocused: { borderColor: colors.accent },
  sourcesButtonText: { color: colors.text, fontSize: isTV ? 18 : 15, fontWeight: '700' },
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
