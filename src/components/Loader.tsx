// The app's loading mark, in place of a spinning ring: a wave of three glowing
// dots, with an optional icon that scans back and forth and a line saying what
// is loading. The large one, for players, sits on a slowly pulsing glow.
import { useEffect, useRef, type ComponentProps } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, sz } from '../theme';

type Props = {
  label?: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
  size?: 'small' | 'large';
  color?: string;
  style?: StyleProp<ViewStyle>;
};

const WAVE_MS = 1100;

export function Loader({ label, icon, size = 'small', color = colors.accent, style }: Props) {
  const wave = useRef(new Animated.Value(0)).current;
  const scan = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const appear = useRef(new Animated.Value(0)).current;
  const large = size === 'large';

  useEffect(() => {
    const loops = [
      Animated.loop(Animated.timing(wave, { toValue: 3, duration: WAVE_MS, easing: Easing.linear, useNativeDriver: true })),
      Animated.loop(
        Animated.sequence([
          Animated.timing(scan, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(scan, { toValue: 0, duration: 650, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ),
    ];
    loops.forEach((l) => l.start());
    Animated.timing(appear, { toValue: 1, duration: 260, useNativeDriver: true }).start();
    return () => loops.forEach((l) => l.stop());
  }, []);

  const dot = large ? sz(11, 14) : sz(6, 8);
  const lift = large ? dot * 0.9 : dot * 0.8;

  const dots = (
    <View style={[styles.dots, { gap: dot * 0.7, height: dot + lift }]}>
      {[0, 1, 2].map((i) => {
        // Each dot rises and brightens a third of a beat after the one before.
        const range = { inputRange: [i, i + 0.5, i + 1, 3], extrapolate: 'clamp' as const };
        return (
          <Animated.View
            key={i}
            style={{
              width: dot,
              height: dot,
              borderRadius: dot / 2,
              backgroundColor: color,
              shadowColor: color,
              shadowOpacity: 0.9,
              shadowRadius: dot,
              elevation: large ? 6 : 0,
              opacity: wave.interpolate({ ...range, outputRange: [0.3, 1, 0.3, 0.3] }),
              transform: [
                { translateY: wave.interpolate({ ...range, outputRange: [0, -lift, 0, 0] }) },
                { scale: wave.interpolate({ ...range, outputRange: [0.85, 1.15, 0.85, 0.85] }) },
              ],
            }}
          />
        );
      })}
    </View>
  );

  return (
    <Animated.View style={[large ? styles.large : styles.small, { opacity: appear }, style]} pointerEvents="none">
      {large && (
        <Animated.View
          style={[
            styles.glow,
            {
              backgroundColor: color,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.2] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.15] }) }],
            },
          ]}
        />
      )}
      {icon && (
        <Animated.View
          style={{
            transform: [
              { translateX: scan.interpolate({ inputRange: [0, 1], outputRange: [-5, 5] }) },
              { rotate: scan.interpolate({ inputRange: [0, 1], outputRange: ['-12deg', '12deg'] }) },
            ],
          }}
        >
          <Ionicons name={icon} size={large ? sz(28, 34) : sz(16, 20)} color={color} />
        </Animated.View>
      )}
      {label ? <Text style={[styles.label, large && styles.labelLarge]}>{label}</Text> : null}
      {dots}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  small: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  large: { alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  glow: { position: 'absolute', width: sz(110, 140), height: sz(110, 140), borderRadius: sz(55, 70) },
  dots: { flexDirection: 'row', alignItems: 'flex-end' },
  label: { color: colors.muted, fontSize: sz(13.5, 16), fontWeight: '700' },
  labelLarge: { color: colors.text, fontSize: sz(15, 19) },
});
