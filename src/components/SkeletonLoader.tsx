// What a list shows while it loads: placeholder cards in the same layout as
// the real ones, with a band of light sweeping across them, under the app's
// loading line. The cards then arrive into the same places.
import { useEffect, useState, type ComponentProps } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { CARD_GAP, RADIUS, colors } from '../theme';
import { Loader } from './Loader';

type Props = {
  columns: number;
  cardWidth: number;
  label?: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
  rows?: number;
  style?: StyleProp<ViewStyle>;
};

const SWEEP_MS = 1400;

export function SkeletonLoader({ columns, cardWidth, label, icon = 'search', rows = 3, style }: Props) {
  const [sweep] = useState(() => new Animated.Value(0));
  const [appear] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(appear, { toValue: 1, duration: 260, useNativeDriver: true }).start();
    let stopped = false;
    const runSweep = () => {
      if (stopped) return;
      sweep.setValue(0);
      Animated.timing(sweep, { toValue: 1, duration: SWEEP_MS, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start(({ finished }) => {
        if (finished && !stopped) runSweep();
      });
    };
    runSweep();
    return () => { stopped = true; };
  }, []);

  const pictureHeight = (cardWidth * 9) / 16;
  const rowWidth = cardWidth * columns + CARD_GAP * (columns - 1);

  return (
    <Animated.View style={[{ opacity: appear }, style]} pointerEvents="none">
      {label ? <Loader label={label} icon={icon} style={styles.status} /> : null}

      {Array.from({ length: rows }, (_, r) => (
        <View key={r} style={[styles.row, { width: rowWidth }]}>
          {Array.from({ length: columns }, (_, c) => {
            // Each card's shine runs a little behind the one before, so the
            // light ripples down the grid.
            return (
              <View key={c} style={{ width: cardWidth, marginRight: c === columns - 1 ? 0 : CARD_GAP }}>
                <View style={[styles.block, { height: pictureHeight, borderRadius: RADIUS }]}>
                  <Shine x={Animated.modulo(Animated.add(sweep, ((r * columns + c) * 0.12) % 1), 1).interpolate({ inputRange: [0, 1], outputRange: [-cardWidth, cardWidth * 1.4] })} />
                </View>
                <View style={[styles.block, styles.line, { width: '88%' }]}>
                  <Shine x={Animated.modulo(Animated.add(sweep, ((r * columns + c) * 0.12) % 1), 1).interpolate({ inputRange: [0, 1], outputRange: [-cardWidth, cardWidth * 1.4] })} />
                </View>
                <View style={[styles.block, styles.line, styles.lineShort]}>
                  <Shine x={Animated.modulo(Animated.add(sweep, ((r * columns + c) * 0.12) % 1), 1).interpolate({ inputRange: [0, 1], outputRange: [-cardWidth, cardWidth * 1.4] })} />
                </View>
              </View>
            );
          })}
        </View>
      ))}
    </Animated.View>
  );
}

// The moving band of light inside one placeholder block.
function Shine({ x }: { x: Animated.AnimatedInterpolation<number> }) {
  return (
    <Animated.View style={[styles.shine, { transform: [{ translateX: x }, { rotate: '16deg' }] }]}>
      <LinearGradient
        colors={['transparent', 'rgba(185,138,255,0.22)', 'rgba(255,255,255,0.10)', 'transparent']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  status: { marginBottom: 16 },
  row: { flexDirection: 'row', marginBottom: 18 },
  block: { backgroundColor: colors.surface, overflow: 'hidden' },
  line: { height: 11, borderRadius: 6, marginTop: 10 },
  lineShort: { width: '55%', marginTop: 7 },
  shine: { position: 'absolute', top: -40, bottom: -40, width: 90 },
}
);
