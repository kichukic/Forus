// The opening animation. It takes over from the native splash (the same mark on
// the same background, so the switch can't be seen), plays for a moment while
// the home screen loads underneath, then fades away.
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as SplashScreen from 'expo-splash-screen';
import { colors, sz } from '../theme';

// Keeps the native splash up until this component has drawn its first frame.
SplashScreen.preventAutoHideAsync().catch(() => {});

const MARK = require('../../assets/images/splash-icon.png');
// Matches imageWidth for expo-splash-screen in app.json.
const NATIVE_MARK_SIZE = 180;
const HOLD_MS = 1500;

export function AnimatedSplash({ onDone }: { onDone: () => void }) {
  const mark = useRef(new Animated.Value(0)).current; // 0 → 1: the mark lifts and grows
  const glow = useRef(new Animated.Value(0)).current;
  const words = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.55, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    pulse.start();

    Animated.sequence([
      Animated.spring(mark, { toValue: 1, useNativeDriver: true, speed: 9, bounciness: 9 }),
      Animated.timing(words, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.delay(HOLD_MS - 600),
      Animated.timing(fade, { toValue: 0, duration: 380, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start(() => {
      pulse.stop();
      onDone();
    });
  }, []);

  const lift = mark.interpolate({ inputRange: [0, 1], outputRange: [0, sz(-56, -40)] });
  const grow = mark.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const rise = words.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  const halo = glow.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.25] });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.screen, { opacity: fade }]} pointerEvents="none">
      <LinearGradient
        colors={['rgba(155,92,255,0.22)', 'rgba(155,92,255,0.04)', 'transparent']}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.center}>
        <Animated.View style={[styles.halo, { opacity: glow, transform: [{ translateY: lift }, { scale: halo }] }]} />
        <Animated.Image
          source={MARK}
          style={[styles.mark, { transform: [{ translateY: lift }, { scale: grow }] }]}
        />
        <Animated.View style={[styles.words, { opacity: words, transform: [{ translateY: rise }] }]}>
          <Text style={styles.brand}>
            For<Text style={styles.brandAccent}>Us</Text>
          </Text>
          <Text style={styles.credit}>
            Made with <Text style={styles.heart}>♥</Text> by Kishor
          </Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, zIndex: 100, elevation: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  halo: {
    position: 'absolute',
    width: NATIVE_MARK_SIZE * 1.6,
    height: NATIVE_MARK_SIZE * 1.6,
    borderRadius: NATIVE_MARK_SIZE,
    backgroundColor: 'rgba(155,92,255,0.28)',
  },
  mark: { width: NATIVE_MARK_SIZE, height: NATIVE_MARK_SIZE },
  words: { position: 'absolute', top: '50%', marginTop: sz(60, 70), alignItems: 'center' },
  brand: { color: colors.text, fontSize: sz(42, 54), fontWeight: '900', letterSpacing: -1 },
  brandAccent: { color: colors.accent },
  credit: { color: colors.muted, fontSize: sz(14, 18), fontWeight: '600', marginTop: 6 },
  heart: { color: colors.accent },
});
