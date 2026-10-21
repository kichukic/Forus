// What search shows while it looks: a grid of placeholder result cards in the
// same layout as the real results, with a band of light sweeping across them,
// and a little magnifier scanning beside a "Searching" line. Results then
// arrive into the same places.
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { CARD_GAP, RADIUS, colors, sz } from '../theme';

type Props = {
  columns: number;
  cardWidth: number;
  label: string;
};

const ROWS = 3;
const SWEEP_MS = 1400;

export function SearchLoader({ columns, cardWidth, label }: Props) {
  const sweep = useRef(new Animated.Value(0)).current;
  const scan = useRef(new Animated.Value(0)).current;
  const dots = useRef(new Animated.Value(0)).current;
  const appear = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loops = [
      Animated.loop(Animated.timing(sweep, { toValue: 1, duration: SWEEP_MS, easing: Easing.inOut(Easing.quad), useNativeDriver: true })),
      Animated.loop(
        Animated.sequence([
          Animated.timing(scan, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(scan, { toValue: 0, duration: 650, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ),
      Animated.loop(Animated.timing(dots, { toValue: 3, duration: 1200, easing: Easing.linear, useNativeDriver: true })),
    ];
    loops.forEach((l) => l.start());
    Animated.timing(appear, { toValue: 1, duration: 260, useNativeDriver: true }).start();
    return () => loops.forEach((l) => l.stop());
  }, []);

  const pictureHeight = (cardWidth * 9) / 16;
  const rowWidth = cardWidth * columns + CARD_GAP * (columns - 1);

  return (
    <Animated.View style={[styles.wrap, { opacity: appear }]}>
      <View style={styles.status}>
        <Animated.View
          style={{
            transform: [
              { translateX: scan.interpolate({ inputRange: [0, 1], outputRange: [-5, 5] }) },
              { rotate: scan.interpolate({ inputRange: [0, 1], outputRange: ['-12deg', '12deg'] }) },
            ],
          }}
        >
          <Ionicons name="search" size={sz(16, 20)} color={colors.accent} />
        </Animated.View>
        <Text style={styles.label}>{label}</Text>
        {[0, 1, 2].map((i) => (
          <Animated.Text
            key={i}
            style={[
              styles.dot,
              { opacity: dots.interpolate({ inputRange: [i, i + 0.5, i + 1, 3], outputRange: [0.2, 1, 0.2, 0.2], extrapolate: 'clamp' }) },
            ]}
          >
            .
          </Animated.Text>
        ))}
      </View>

      {Array.from({ length: ROWS }, (_, r) => (
        <View key={r} style={[styles.row, { width: rowWidth }]}>
          {Array.from({ length: columns }, (_, c) => {
            // Each card's shine runs a little behind the one before, so the
            // light ripples down the grid.
            const offset = ((r * columns + c) * 0.12) % 1;
            const shift = Animated.modulo(Animated.add(sweep, offset), 1);
            const x = shift.interpolate({ inputRange: [0, 1], outputRange: [-cardWidth, cardWidth * 1.4] });
            return (
              <View key={c} style={{ width: cardWidth, marginRight: c === columns - 1 ? 0 : CARD_GAP }}>
                <View style={[styles.block, { height: pictureHeight, borderRadius: RADIUS }]}>
                  <Shine x={x} />
                </View>
                <View style={[styles.block, styles.line, { width: '88%' }]}>
                  <Shine x={x} />
                </View>
                <View style={[styles.block, styles.line, styles.lineShort]}>
                  <Shine x={x} />
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
  wrap: { paddingTop: 18 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  label: { color: colors.muted, fontSize: sz(13.5, 16), fontWeight: '700' },
  dot: { color: colors.accent, fontSize: sz(18, 22), fontWeight: '900', marginLeft: -6, lineHeight: sz(18, 22) },
  row: { flexDirection: 'row', marginBottom: 18 },
  block: { backgroundColor: colors.surface, overflow: 'hidden' },
  line: { height: 11, borderRadius: 6, marginTop: 10 },
  lineShort: { width: '55%', marginTop: 7 },
  shine: { position: 'absolute', top: -40, bottom: -40, width: 90 },
});
