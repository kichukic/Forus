import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, isTV, sz } from '../theme';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

type Props = {
  visible: boolean;
  speed: number;
  delay: number;
  captionsAvailable: boolean;
  onSpeed: (speed: number) => void;
  onDelay: (delay: number) => void;
  onClose: () => void;
};

export function PlaybackSettings({
  visible,
  speed,
  delay,
  captionsAvailable,
  onSpeed,
  onDelay,
  onClose,
}: Props) {
  if (!visible) return null;

  const stepDelay = (delta: number) => {
    const next = Math.max(-5, Math.min(5, Math.round((delay + delta) * 10) / 10));
    onDelay(next);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>Playback</Text>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Ionicons name="close" size={isTV ? 24 : 20} color={colors.text} />
            </Pressable>
          </View>

          <Text style={styles.label}>Speed</Text>
          <View style={styles.chips}>
            {SPEEDS.map((rate) => {
              const active = Math.abs(speed - rate) < 0.01;
              return (
                <Pressable
                  key={rate}
                  hasTVPreferredFocus={active}
                  onPress={() => onSpeed(rate)}
                  style={({ focused, pressed }) => [
                    styles.chip,
                    active && styles.chipActive,
                    (focused || pressed) && styles.chipFocused,
                  ]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {rate === 1 ? 'Normal' : `${rate}×`}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {captionsAvailable && (
            <>
              <Text style={[styles.label, styles.delayLabel]}>Subtitle delay</Text>
              <View style={styles.delayRow}>
                <Pressable
                  onPress={() => stepDelay(-0.5)}
                  style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.stepText}>−0.5s</Text>
                </Pressable>
                <Text style={styles.delayValue}>
                  {delay > 0 ? '+' : ''}
                  {delay.toFixed(1)}s
                </Text>
                <Pressable
                  onPress={() => stepDelay(0.5)}
                  style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.stepText}>+0.5s</Text>
                </Pressable>
              </View>
              <Text style={styles.hint}>
                Positive values show subtitles later, to line them up with the audio.
              </Text>
              <Pressable
                onPress={() => onDelay(0)}
                style={({ pressed }) => [styles.reset, pressed && styles.pressed]}
              >
                <Text style={styles.resetText}>Reset delay</Text>
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: isTV ? 'center' : 'flex-end',
    alignItems: isTV ? 'center' : 'stretch',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: isTV ? 16 : 20,
    borderTopRightRadius: isTV ? 16 : 20,
    borderRadius: isTV ? 16 : undefined,
    width: isTV ? 520 : '100%',
    paddingHorizontal: sz(20, 26),
    paddingTop: sz(18, 22),
    paddingBottom: isTV ? sz(20, 26) : 34,
    borderWidth: isTV ? 1 : 0,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: sz(20, 24),
  },
  title: { color: colors.text, fontSize: sz(18, 24), fontWeight: '800' },
  closeBtn: {
    width: sz(34, 40),
    height: sz(34, 40),
    borderRadius: sz(17, 20),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  label: {
    color: colors.muted,
    fontSize: sz(12, 14),
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: sz(10, 12),
  },
  delayLabel: { marginTop: sz(22, 26) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: sz(8, 10) },
  chip: {
    paddingHorizontal: sz(14, 18),
    paddingVertical: sz(8, 10),
    borderRadius: sz(18, 20),
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipFocused: { borderColor: colors.text },
  chipText: { color: colors.text, fontSize: sz(13, 16), fontWeight: '700' },
  chipTextActive: { color: '#fff' },
  delayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: sz(14, 18),
  },
  stepBtn: {
    minWidth: sz(74, 90),
    paddingVertical: sz(10, 12),
    borderRadius: sz(14, 16),
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepText: { color: colors.text, fontSize: sz(14, 17), fontWeight: '800' },
  delayValue: {
    minWidth: sz(62, 74),
    color: colors.text,
    fontSize: sz(16, 20),
    fontWeight: '800',
    textAlign: 'center',
  },
  hint: {
    color: colors.muted,
    fontSize: sz(12, 14),
    lineHeight: sz(17, 20),
    textAlign: 'center',
    marginTop: sz(10, 12),
  },
  reset: { alignSelf: 'center', paddingHorizontal: sz(14, 18), paddingVertical: sz(8, 10) },
  resetText: { color: colors.accent, fontSize: sz(13, 15), fontWeight: '700' },
  pressed: { opacity: 0.65 },
});
