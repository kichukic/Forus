// Plays a film or an episode from MovieBox. The file is asked for by name
// first, because the link itself expires and has to be fetched again when it
// has gone stale.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { directStream, playableRows } from '../api/moviebox';
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
  const [linkError, setLinkError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // How many times a stale link has been fetched again.
  const attempts = useRef(0);

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

  const failure = linkError ?? (status === 'error' ? error?.message ?? 'This file could not be played.' : null);

  return (
    <View style={styles.screen}>
      <VideoView
        player={player}
        style={portraitPhone ? styles.videoPortrait : styles.video}
        // In the corner window a tap opens the player instead.
        nativeControls={!mini}
        contentFit="contain"
        fullscreenOptions={{ enable: !isTV }}
      />

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
          <Text style={styles.errorTitle}>{'Couldn\'t play this episode'}</Text>
          <Text style={styles.overlayText}>{failure}</Text>
          <Pressable onPress={resolve} style={styles.retry}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
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
