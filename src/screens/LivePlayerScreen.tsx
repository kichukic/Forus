import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useEvent } from 'expo';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFullscreenOrientation } from '../hooks/useFullscreenOrientation';
import { useAudioTracks } from '../hooks/useAudioTracks';
import { AudioTrackPicker } from '../components/AudioTrackPicker';
import { colors, isTV } from '../theme';

type Props = {
  url: string;
  title: string;
  poster?: string;
  headers?: Record<string, string>;
  onClose: () => void;
};

/** A live IPTV channel: no duration, resume point, subtitles, or scrobbling. */
export function LivePlayerScreen({ url, title, headers, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const fullscreenOrientation = useFullscreenOrientation();
  const [audioPickerOpen, setAudioPickerOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const player = useVideoPlayer({ uri: url, headers }, (instance) => {
    instance.loop = false;
    instance.play();
  });
  const audio = useAudioTracks(player);
  const { status, error } = useEvent(player, 'statusChange', { status: player.status });

  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await player.replaceAsync({ uri: url, headers });
      player.play();
    } catch {
      // The error overlay stays up so it can be tried again.
    } finally {
      setRetrying(false);
    }
  };

  return (
    <View style={styles.screen}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        nativeControls
        allowsPictureInPicture={!isTV}
        startsPictureInPictureAutomatically={!isTV}
        fullscreenOptions={{
          enable: !isTV,
          orientation: 'landscape',
          autoExitOnRotate: true,
        }}
        onFullscreenEnter={fullscreenOrientation.onFullscreenEnter}
        onFullscreenExit={fullscreenOrientation.onFullscreenExit}
      />

      <View style={[styles.top, { paddingTop: insets.top + (isTV ? 18 : 8) }]} pointerEvents="box-none">
        <Pressable onPress={onClose} style={styles.back} hitSlop={12} accessibilityLabel="Close live TV">
          <Ionicons name="chevron-back" size={isTV ? 28 : 24} color={colors.text} />
        </Pressable>
        <View style={styles.livePill}>
          <View style={styles.dot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {audio.hasMultiple ? (
          <Pressable onPress={() => setAudioPickerOpen(true)} style={styles.action} hitSlop={8}>
            <Ionicons name="volume-high" size={20} color={colors.accent} />
          </Pressable>
        ) : null}
      </View>

      {status === 'error' ? (
        <View style={styles.errorWrap} pointerEvents="box-none">
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={28} color={colors.live} />
            <Text style={styles.errorTitle}>This channel is not responding</Text>
            <Text style={styles.errorText} numberOfLines={2}>
              {error?.message || 'The stream may be offline or only available in its own app.'}
            </Text>
            <Pressable onPress={retry} style={({ pressed }) => [styles.retry, pressed && styles.pressed]}>
              <Ionicons name="refresh" size={16} color="#fff" />
              <Text style={styles.retryText}>{retrying ? 'Reconnecting…' : 'Try again'}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <AudioTrackPicker
        visible={audioPickerOpen}
        tracks={audio.tracks}
        selected={audio.selected}
        onSelect={audio.select}
        onClose={() => setAudioPickerOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: isTV ? 28 : 14,
    paddingBottom: 10,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  back: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: colors.live,
  },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#fff' },
  liveText: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  title: { flex: 1, color: colors.text, fontSize: isTV ? 20 : 16, fontWeight: '800' },
  action: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  errorWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorCard: {
    maxWidth: 380,
    alignItems: 'center',
    gap: 8,
    padding: 22,
    borderRadius: 18,
    backgroundColor: 'rgba(23,20,31,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  errorTitle: { color: colors.text, fontSize: isTV ? 20 : 16, fontWeight: '800', textAlign: 'center' },
  errorText: { color: colors.muted, fontSize: isTV ? 15 : 13, textAlign: 'center', lineHeight: 19 },
  retry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 18,
    backgroundColor: colors.accent,
  },
  retryText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  pressed: { opacity: 0.65 },
});
