import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getApiKey, getStreamUrl } from '../api/torbox';
import { colors, isTV } from '../theme';
import type { FilePlayable } from '../types';

type Props = {
  item: FilePlayable;
  onClose: () => void;
};

// Plays a file from the user's TorBox cloud in the app's own video player.
export function FilePlayerScreen({ item, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const player = useVideoPlayer(null, (p) => {
    p.staysActiveInBackground = false;
  });
  const { status, error } = useEvent(player, 'statusChange', { status: player.status });
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
        style={styles.video}
        nativeControls
        contentFit="contain"
        fullscreenOptions={{ enable: !isTV }}
      />

      {!failure && status !== 'readyToPlay' && (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.accent} />
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

      {!isTV && (
        <Pressable onPress={onClose} hitSlop={12} style={[styles.close, { top: insets.top + 8 }]}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  video: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  overlayText: { color: colors.text, fontSize: isTV ? 20 : 16, marginTop: 16, textAlign: 'center' },
  errorTitle: { color: colors.text, fontSize: isTV ? 26 : 20, fontWeight: '800' },
  hint: { color: colors.muted, fontSize: isTV ? 16 : 13, marginTop: 12, textAlign: 'center' },
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
