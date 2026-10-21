// Plays a film or an episode from MovieBox. The file is asked for by name
// first, because the link itself expires and has to be fetched again when it
// has gone stale.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { captions, directStream, playableRows, type MovieboxCaption } from '../api/moviebox';
import { cueAt, parseSrt, type SubtitleCue } from '../api/subtitles';
import { RelatedPanel } from '../components/RelatedPanel';
import { VideoOverlay } from '../components/VideoOverlay';
import { useRemoteSeek } from '../hooks/useRemoteSeek';
import type { ShellControls } from '../components/PlayerShell';
import { colors, isTV, sz } from '../theme';
import type { MovieboxPlayable, Playable } from '../types';

type Props = {
  item: MovieboxPlayable;
  onClose: () => void;
  // Plays something else from the list under the video.
  onPlay: (item: Playable) => void;
  // Set when the player sits in the mini-player shell (which also pads the top).
  shell?: ShellControls;
};

// How many times a stale link is fetched again before giving up.
const MAX_ATTEMPTS = 3;

export function MovieboxPlayerScreen({ item, onClose, onPlay, shell }: Props) {
  const { width, height } = useWindowDimensions();
  const mini = shell?.mini ?? false;
  // A phone held upright shows the video at the top with its title below.
  const portraitPhone = !isTV && height > width;
  const player = useVideoPlayer(null, (p) => {
    p.staysActiveInBackground = false;
  });
  const { status, error } = useEvent(player, 'statusChange', { status: player.status });
  const { currentTime } = useEvent(player, 'timeUpdate', {
    currentTime: 0,
    currentLiveTimestamp: 0,
    currentOffsetFromLive: 0,
    bufferedPosition: 0,
  });
  const [linkError, setLinkError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // How many times a stale link has been fetched again.
  const attempts = useRef(0);
  // The subtitles the file has, and the one being shown.
  const [captionOptions, setCaptionOptions] = useState<MovieboxCaption[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  // The words of the subtitle being shown, kept with the language they are
  // for, so the right ones are shown while a new one is on its way.
  const [loaded, setLoaded] = useState<{ id: string; list: SubtitleCue[] } | null>(null);

  // On a TV the remote's seek and play/pause keys drive the player, and the
  // native controls are switched off (they eat the D-pad). The overlay below
  // gives the same buttons for anyone who prefers the remote to focus them.
  const [showOverlay, setShowOverlay] = useState(true);
  useRemoteSeek(player, () => setShowOverlay(true));
  useEffect(() => {
    if (!showOverlay) return;
    const timer = setTimeout(() => setShowOverlay(false), 4000);
    return () => clearTimeout(timer);
  }, [showOverlay, currentTime]);

  // A fresh link, fetched from the file's own name.
  const resolve = useCallback(async () => {
    setLoading(true);
    setLinkError(null);
    try {
      const rows = await playableRows(item.subjectId, item.season, item.episode);
      if (rows.length === 0) throw new Error('There is no file for this episode.');
      // The best quality the service has for it.
      const best = rows.reduce((pick, row) => (row.resolution > pick.resolution ? row : pick));
      const stream = await directStream(item.subjectId, best);
      await player.replaceAsync({ uri: stream.url });
      player.play();
      // The subtitles belong to the file, so they are asked for now.
      captions(item.subjectId, best.resourceId)
        .then((list) => {
          setCaptionOptions(list);
          // The first one is shown straight away, if there is one.
          if (list.length > 0) setChosen(list[0].id);
          else setChosen(null);
        })
        .catch(() => setCaptionOptions([]));
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : "This episode can't be played.");
    } finally {
      setLoading(false);
    }
  }, [item.episode, item.season, item.subjectId, player]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await resolve();
    })();
    return () => {
      cancelled = true;
    };
  }, [resolve]);

  // A link that has gone stale shows up as a player error, so a new one is
  // fetched and the video is tried again.
  useEffect(() => {
    if (status !== 'error' || attempts.current >= MAX_ATTEMPTS) return;
    attempts.current += 1;
    resolve();
  }, [status, resolve]);

  // Choosing a language brings down its subtitle file.
  useEffect(() => {
    const caption = captionOptions.find((option) => option.id === chosen);
    if (!caption) return;
    let cancelled = false;
    fetch(caption.url)
      .then((res) => res.text())
      .then((text) => !cancelled && setLoaded({ id: caption.id, list: parseSrt(text) }))
      .catch(() => !cancelled && setLoaded({ id: caption.id, list: [] }));
    return () => {
      cancelled = true;
    };
  }, [chosen, captionOptions]);

  const failure = linkError ?? (status === 'error' ? error?.message ?? 'This file could not be played.' : null);
  const spoken =
    loaded && loaded.id === chosen && loaded.list.length > 0
      ? cueAt(loaded.list, currentTime ?? 0)
      : null;

  return (
    <View style={styles.screen}>
      <VideoView
        player={player}
        style={portraitPhone ? styles.videoPortrait : styles.video}
        // In the corner window a tap opens the player instead.
        nativeControls={!mini && !isTV}
        contentFit="contain"
        fullscreenOptions={{ enable: !isTV }}
      />

      {isTV && !mini && (
        <VideoOverlay
          player={player}
          paused={!player.playing}
          time={{ t: currentTime ?? 0, d: player.duration ?? 0 }}
          buffering={loading || status !== 'readyToPlay'}
          show={showOverlay}
          onToggle={() => (player.playing ? player.pause() : player.play())}
          onSeekBy={(seconds) => player.seekBy(seconds)}
        />
      )}

      {/* The words being said, over the video. */}
      {spoken ? (
        <View style={[styles.cue, { bottom: portraitPhone ? (width * 9) / 16 - 44 : 28 }]} pointerEvents="none">
          <Text style={styles.cueText}>{spoken}</Text>
        </View>
      ) : null}

      {!failure && (loading || status !== 'readyToPlay') && (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.overlayText} numberOfLines={2}>
            {item.title}
          </Text>
        </View>
      )}

      {failure && (
        <View style={styles.overlay}>
          <Text style={styles.errorTitle}>{"Couldn't play this episode"}</Text>
          <Text style={styles.overlayText}>{failure}</Text>
          <Pressable onPress={resolve} style={styles.retry}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      )}

      {portraitPhone && !mini && (
        // Below the video: the title, the subtitles to choose from, and the
        // films to watch next. Dragging the title block down shrinks the
        // player into the corner.
        <RelatedPanel item={item} onPlay={onPlay} dragHandlers={shell?.dragHandlers}>
          <Text style={styles.infoTitle}>{item.title}</Text>
          <Text style={styles.infoNote}>From MovieBox by Kishor</Text>
          {captionOptions.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.captionRow}
            >
              {captionOptions.map((option) => (
                <Pressable
                  key={option.id}
                  onPress={() => setChosen(option.id === chosen ? '' : option.id)}
                  style={({ pressed }) => [
                    styles.caption,
                    chosen === option.id && styles.captionOn,
                    pressed && styles.captionPressed,
                  ]}
                >
                  <Text style={[styles.captionText, chosen === option.id && styles.captionTextOn]}>
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </RelatedPanel>
      )}

      {!isTV && !mini && (
        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={[styles.close, { top: (portraitPhone ? (width * 9) / 16 : 0) + 8 }]}
        >
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      )}

      {!isTV && !mini && shell && (
        <Pressable onPress={shell.minimize} hitSlop={12} style={styles.minimize}>
          <Text style={styles.minimizeText}>⌄</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  video: { flex: 1 },
  videoPortrait: { width: '100%', aspectRatio: 16 / 9 },
  infoTitle: { color: colors.text, fontSize: 17, fontWeight: '700', lineHeight: 24 },
  infoNote: { color: colors.muted, fontSize: 13, marginTop: 6 },
  captionRow: { gap: 8, paddingTop: 12, paddingRight: 40 },
  caption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  captionOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  captionPressed: { opacity: 0.7 },
  captionText: { color: colors.muted, fontSize: 12.5, fontWeight: '700' },
  captionTextOn: { color: '#fff' },
  cue: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  cueText: {
    color: '#fff',
    fontSize: sz(14, 18),
    lineHeight: sz(20, 25),
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  overlayText: { color: colors.text, fontSize: sz(16, 20), marginTop: 16, textAlign: 'center' },
  errorTitle: { color: colors.text, fontSize: sz(20, 26), fontWeight: '800' },
  retry: {
    marginTop: 18,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: colors.accent,
  },
  retryText: { color: '#fff', fontSize: sz(14, 16), fontWeight: '800' },
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
  minimizeText: { color: '#fff', fontSize: 22, fontWeight: '800', lineHeight: 22 },
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
});
