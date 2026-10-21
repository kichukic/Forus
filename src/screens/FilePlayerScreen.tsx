import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { getApiKey, getStreamUrl } from '../api/torbox';
import type { ShellControls } from '../components/PlayerShell';
import { Loader } from '../components/Loader';
import { RelatedPanel } from '../components/RelatedPanel';
import { VideoOverlay } from '../components/VideoOverlay';
import { useRemoteSeek } from '../hooks/useRemoteSeek';
import { colors, isTV, sz } from '../theme';
import type { FilePlayable, Playable } from '../types';

type Props = {
  item: FilePlayable;
  onClose: () => void;
  // Plays something from the related list under the video.
  onPlay: (item: Playable) => void;
  // Set when the player sits in the mini-player shell (which also pads the top).
  shell?: ShellControls;
};

// Plays a file from the user's TorBox cloud in the app's own video player.
export function FilePlayerScreen({ item, onClose, onPlay, shell }: Props) {
  const { width, height } = useWindowDimensions();
  const mini = shell?.mini ?? false;
  // A phone held upright shows the video at the top with its title below.
  const portraitPhone = !isTV && height > width;
  const player = useVideoPlayer(null, (p) => {
    p.staysActiveInBackground = false;
  });
  const { status, error } = useEvent(player, 'statusChange', { status: player.status });
  const { currentTime } = useEvent(player, 'timeUpdate', { currentTime: 0, currentLiveTimestamp: 0, currentOffsetFromLive: 0, bufferedPosition: 0 });
  const [showOverlay, setShowOverlay] = useState(true);
  useRemoteSeek(player, () => setShowOverlay(true));
  useEffect(() => {
    if (!showOverlay) return;
    const timer = setTimeout(() => setShowOverlay(false), 4000);
    return () => clearTimeout(timer);
  }, [showOverlay, currentTime]);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const key = await getApiKey();
      if (!key) throw new Error('TorBox is not connected.');
      const url = await getStreamUrl(key, item);
      if (cancelled) return;
      await player.replaceAsync({ uri: url });
      player.play();
    })().catch((e) => !cancelled && setLinkError(String(e.message ?? e)));
    return () => {
      cancelled = true;
    };
  }, [item, player]);

  const failure = linkError ?? (status === 'error' ? error?.message ?? 'This file could not be played.' : null);

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

      {!failure && status !== 'readyToPlay' && (
        <View style={styles.overlay} pointerEvents="none">
          <Loader size="large" />
          <Text style={styles.overlayText} numberOfLines={2}>
            {item.title}
          </Text>
        </View>
      )}

      {failure && (
        <View style={styles.overlay}>
          <Text style={styles.errorTitle}>Couldn't play this file</Text>
          <Text style={styles.overlayText}>{failure}</Text>
          <Text style={styles.hint}>
            Some MKV files use audio (like DTS) that phones and TVs can't decode.
          </Text>
        </View>
      )}

      {portraitPhone && !mini && (
        // Dragging the title block down shrinks the player into the corner.
        <RelatedPanel item={item} onPlay={onPlay} dragHandlers={shell?.dragHandlers}>
          <Text style={styles.infoTitle}>{item.title}</Text>
          <Text style={styles.infoNote}>From your TorBox</Text>
        </RelatedPanel>
      )}

      {isTV && !mini && (
        <VideoOverlay
          player={player}
          paused={!player.playing}
          time={{ t: currentTime ?? 0, d: player.duration ?? 0 }}
          buffering={status !== 'readyToPlay'}
          show={showOverlay}
          onToggle={() => (player.playing ? player.pause() : player.play())}
          onSeekBy={(seconds) => player.seekBy(seconds)}
        />
      )}

      {!isTV && !mini && (
        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={[styles.close, { top: (portraitPhone ? (width * 9) / 16 : 0) + 8 }]}
        >
          <Ionicons name="close" size={20} color="#fff" />
        </Pressable>
      )}

      {!isTV && !mini && shell && (
        <Pressable onPress={shell.minimize} hitSlop={12} style={styles.minimize}>
          <Ionicons name="chevron-down" size={22} color="#fff" />
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
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  overlayText: { color: colors.text, fontSize: sz(16, 20), marginTop: 16, textAlign: 'center' },
  errorTitle: { color: colors.text, fontSize: sz(20, 26), fontWeight: '800' },
  hint: { color: colors.muted, fontSize: sz(13, 16), marginTop: 12, textAlign: 'center' },
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
});
