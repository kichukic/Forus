// The controls shown over a video on a TV, where the remote drives everything.
// The native controls are switched off on TV (they eat the D-pad), so this is
// what the user sees: a progress line and three focusable buttons.
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEvent } from 'expo';
import type { VideoPlayer } from 'expo-video';
import { FocusRow } from './FocusRow';
import { ProgressLine, type PlaybackTime } from './PlayerControls';
import { colors, isTV, sz } from '../theme';

type Props = {
  player: VideoPlayer;
  paused: boolean;
  time: PlaybackTime;
  buffering: boolean;
  show: boolean;
  onToggle: () => void;
  onSeekBy: (seconds: number) => void;
};

const SKIP = 15;

export function VideoOverlay({ player, paused, time, buffering, show, onToggle, onSeekBy }: Props) {
  if (!show) return null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {buffering && <ActivityIndicator size="large" color={colors.accent} style={styles.spinner} />}
      <View style={styles.bar}>
        <ProgressLine time={time} live={false} />
        <FocusRow style={styles.row}>
          <Pressable
            onPress={() => onSeekBy(-SKIP)}
            style={({ focused }) => [styles.btn, focused && styles.btnFocused]}
          >
            <Ionicons name="play-back" size={isTV ? 26 : 20} color={colors.text} />
            <Text style={styles.btnText}>{SKIP}s</Text>
          </Pressable>
          <Pressable
            onPress={onToggle}
            hasTVPreferredFocus
            style={({ focused }) => [styles.btn, styles.primary, focused && styles.btnFocused]}
          >
            <Ionicons name={paused ? 'play' : 'pause'} size={isTV ? 28 : 22} color="#fff" />
          </Pressable>
          <Pressable
            onPress={() => onSeekBy(SKIP)}
            style={({ focused }) => [styles.btn, focused && styles.btnFocused]}
          >
            <Ionicons name="play-forward" size={isTV ? 26 : 20} color={colors.text} />
            <Text style={styles.btnText}>{SKIP}s</Text>
          </Pressable>
        </FocusRow>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end' },
  spinner: { position: 'absolute', top: '42%', alignSelf: 'center' },
  bar: { paddingHorizontal: 32, paddingBottom: 24, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24 },
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  primary: { backgroundColor: colors.accent },
  btnFocused: { borderColor: colors.text },
  btnText: { color: colors.text, fontSize: isTV ? 12 : 11, fontWeight: '800' },
});
