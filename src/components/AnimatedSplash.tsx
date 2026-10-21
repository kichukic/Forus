// The opening screen. It takes over from the native splash (the same mark on
// the same background, so the switch can't be seen), plays its intro, then keeps
// going (glows drifting, rings pulsing, a progress bar filling) until the home
// screen's data has loaded underneath, and finally zooms away.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as SplashScreen from 'expo-splash-screen';
import { colors, sz } from '../theme';

// Keeps the native splash up until this component has drawn its first frame.
SplashScreen.preventAutoHideAsync().catch(() => {});

const MARK = require('../../assets/images/splash-icon.png');
// Matches imageWidth for expo-splash-screen in app.json.
const NATIVE_MARK_SIZE = 180;
// The intro always plays to the end, however fast the data arrives.
const INTRO_MS = 1900;
const WORD = ['F', 'o', 'r', 'U', 's'];
const SPARKLES = 16;

type Props = {
  // True once the home screen's data is in (or loading gave up).
  ready: boolean;
  // 0 to 1, and what is being loaded.
  progress: number;
  status: string;
  onDone: () => void;
};

const loop = (value: Animated.Value, to: number, duration: number, delay = 0) =>
  Animated.loop(
    Animated.sequence([
      Animated.delay(delay),
      Animated.timing(value, { toValue: to, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(value, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]),
  );

export function AnimatedSplash({ ready, progress, status, onDone }: Props) {
  const { width, height } = useWindowDimensions();
  const [introDone, setIntroDone] = useState(false);

  const mark = useRef(new Animated.Value(0)).current; // the mark springs up into place
  const float = useRef(new Animated.Value(0)).current; // then bobs gently while waiting
  const glow = useRef(new Animated.Value(0)).current;
  const letters = useRef(WORD.map(() => new Animated.Value(0))).current;
  const credit = useRef(new Animated.Value(0)).current;
  const footer = useRef(new Animated.Value(0)).current;
  const rings = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  const orbs = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  const twinkles = useRef(Array.from({ length: SPARKLES }, () => new Animated.Value(0))).current;
  const shimmer = useRef(new Animated.Value(0)).current;
  const bar = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(0)).current;

  // Where the sparkles sit: spread over the screen, the same on every render.
  const sparkles = useMemo(
    () =>
      Array.from({ length: SPARKLES }, (_, i) => ({
        x: ((i * 37 + 11) % 97) / 97,
        y: ((i * 53 + 29) % 89) / 89,
        size: 2 + (i % 3),
        delay: (i * 230) % 1800,
      })),
    [],
  );

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});

    // Background life that runs until the splash leaves.
    const ambient = [
      ...orbs.map((o, i) => loop(o, 1, 4200 + i * 900, i * 500)),
      ...twinkles.map((t, i) => loop(t, 1, 900 + (i % 4) * 250, sparkles[i].delay)),
      ...rings.map((r, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(i * 800),
            Animated.timing(r, { toValue: 1, duration: 2400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(r, { toValue: 0, duration: 0, useNativeDriver: true }),
          ]),
        ),
      ),
      loop(glow, 1, 1100),
      loop(float, 1, 1600),
      Animated.loop(
        Animated.timing(shimmer, { toValue: 1, duration: 1300, easing: Easing.linear, useNativeDriver: true }),
      ),
    ];
    ambient.forEach((a) => a.start());

    // The intro: the mark springs up, the name types itself in, then the
    // credit and the loading bar appear.
    Animated.sequence([
      Animated.spring(mark, { toValue: 1, useNativeDriver: true, speed: 8, bounciness: 10 }),
      Animated.stagger(
        70,
        letters.map((l) =>
          Animated.timing(l, { toValue: 1, duration: 320, easing: Easing.out(Easing.back(2)), useNativeDriver: true }),
        ),
      ),
      Animated.parallel([
        Animated.timing(credit, { toValue: 1, duration: 380, useNativeDriver: true }),
        Animated.timing(footer, { toValue: 1, duration: 380, useNativeDriver: true }),
      ]),
    ]).start();
    const timer = setTimeout(() => setIntroDone(true), INTRO_MS);

    return () => {
      clearTimeout(timer);
      ambient.forEach((a) => a.stop());
    };
  }, []);

  // The bar follows the loading progress.
  useEffect(() => {
    Animated.timing(bar, {
      toValue: progress,
      duration: 450,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress]);

  // Leaves once the intro has played and the data is in: the mark zooms
  // forward as everything fades into the home screen.
  useEffect(() => {
    if (!introDone || !ready) return;
    Animated.timing(bar, { toValue: 1, duration: 200, useNativeDriver: false }).start();
    Animated.timing(exit, {
      toValue: 1,
      duration: 520,
      delay: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => onDone());
  }, [introDone, ready]);

  const markIn = mark.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const markLift = mark.interpolate({ inputRange: [0, 1], outputRange: [0, sz(-70, -56)] });
  const bob = float.interpolate({ inputRange: [0, 1], outputRange: [0, -7] });
  const zoom = exit.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] });
  const fadeOut = exit.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0.6, 0] });
  const contentOut = exit.interpolate({ inputRange: [0, 0.5], outputRange: [1, 0], extrapolate: 'clamp' });
  const barWidth = bar.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const barLength = sz(180, 240);
  const shimmerX = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-60, barLength + 60] });

  const drift = (o: Animated.Value, dx: number, dy: number) => ({
    transform: [
      { translateX: o.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
      { translateY: o.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
      { scale: o.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] }) },
    ],
  });
  const orb = Math.max(width, height) * 0.75;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.screen, { opacity: fadeOut }]} pointerEvents="none">
      {/* Soft coloured glows drifting behind everything. */}
      <Animated.View
        style={[
          styles.orb,
          { width: orb, height: orb, borderRadius: orb / 2, top: -orb * 0.35, left: -orb * 0.3 },
          drift(orbs[0], 40, 60),
        ]}
      >
        <LinearGradient
          colors={['rgba(155,92,255,0.55)', 'rgba(155,92,255,0)']}
          start={{ x: 0.3, y: 0.3 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.orb,
          { width: orb, height: orb, borderRadius: orb / 2, bottom: -orb * 0.4, right: -orb * 0.35 },
          drift(orbs[1], -50, -40),
        ]}
      >
        <LinearGradient
          colors={['rgba(255,107,181,0.38)', 'rgba(255,107,181,0)']}
          start={{ x: 0.7, y: 0.7 }}
          end={{ x: 0, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.orb,
          { width: orb * 0.7, height: orb * 0.7, borderRadius: orb, top: height * 0.35, left: -orb * 0.45 },
          drift(orbs[2], 60, -30),
        ]}
      >
        <LinearGradient
          colors={['rgba(79,124,255,0.32)', 'rgba(79,124,255,0)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <LinearGradient
        colors={['rgba(12,10,18,0.55)', 'transparent', 'transparent', 'rgba(12,10,18,0.85)']}
        locations={[0, 0.25, 0.65, 1]}
        style={StyleSheet.absoluteFill}
      />

      {sparkles.map((s, i) => (
        <Animated.View
          key={i}
          style={[
            styles.sparkle,
            {
              left: s.x * width,
              top: s.y * height,
              width: s.size,
              height: s.size,
              borderRadius: s.size,
              opacity: twinkles[i].interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.9] }),
              transform: [{ scale: twinkles[i].interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.4] }) }],
            },
          ]}
        />
      ))}

      <View style={styles.center}>
        <Animated.View style={[styles.markWrap, { transform: [{ translateY: markLift }] }]}>
          {/* Rings pulsing out from the heart. */}
          {rings.map((r, i) => (
            <Animated.View
              key={i}
              style={[
                styles.ring,
                {
                  opacity: Animated.multiply(
                    r.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.55, 0] }),
                    contentOut,
                  ),
                  transform: [{ scale: r.interpolate({ inputRange: [0, 1], outputRange: [0.7, 2.3] }) }],
                },
              ]}
            />
          ))}
          <Animated.View
            style={[
              styles.halo,
              {
                opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.95] }),
                transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.25] }) }],
              },
            ]}
          />
          <Animated.Image
            source={MARK}
            style={[styles.mark, { transform: [{ translateY: bob }, { scale: Animated.multiply(markIn, zoom) }] }]}
          />
        </Animated.View>

        <Animated.View style={[styles.words, { opacity: contentOut }]}>
          <View style={styles.wordRow}>
            {WORD.map((letter, i) => (
              <Animated.Text
                key={i}
                style={[
                  styles.brand,
                  i >= 3 && styles.brandAccent,
                  {
                    opacity: letters[i],
                    transform: [
                      { translateY: letters[i].interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) },
                      { scale: letters[i].interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
                    ],
                  },
                ]}
              >
                {letter}
              </Animated.Text>
            ))}
          </View>
          <Animated.Text
            style={[
              styles.credit,
              {
                opacity: credit,
                transform: [{ translateY: credit.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
              },
            ]}
          >
            Made with <Text style={styles.heart}>♥</Text> by Kishor
          </Animated.Text>
        </Animated.View>
      </View>

      {/* What is loading, and how far along it is. */}
      <Animated.View style={[styles.footer, { opacity: Animated.multiply(footer, contentOut) }]}>
        <View style={[styles.track, { width: barLength }]}>
          <Animated.View style={[styles.fill, { width: barWidth }]}>
            <LinearGradient
              colors={[colors.accentDeep, colors.accent, '#ff6bb5']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
            <Animated.View style={[styles.shimmer, { transform: [{ translateX: shimmerX }] }]}>
              <LinearGradient
                colors={['transparent', 'rgba(255,255,255,0.65)', 'transparent']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          </Animated.View>
        </View>
        <Text style={styles.status}>{status}</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, zIndex: 100, elevation: 100, overflow: 'hidden' },
  orb: { position: 'absolute', overflow: 'hidden' },
  sparkle: { position: 'absolute', backgroundColor: '#e9dcff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  markWrap: { alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    width: NATIVE_MARK_SIZE,
    height: NATIVE_MARK_SIZE,
    borderRadius: NATIVE_MARK_SIZE / 2,
    borderWidth: 2,
    borderColor: colors.accent,
  },
  halo: {
    position: 'absolute',
    width: NATIVE_MARK_SIZE * 1.5,
    height: NATIVE_MARK_SIZE * 1.5,
    borderRadius: NATIVE_MARK_SIZE,
    backgroundColor: 'rgba(155,92,255,0.25)',
  },
  mark: { width: NATIVE_MARK_SIZE, height: NATIVE_MARK_SIZE },
  words: { position: 'absolute', top: '50%', marginTop: sz(50, 60), alignItems: 'center' },
  wordRow: { flexDirection: 'row' },
  brand: { color: colors.text, fontSize: sz(48, 60), fontWeight: '900', letterSpacing: -1 },
  brandAccent: { color: colors.accent },
  heart: { color: '#ff6bb5' },
  credit: { color: colors.muted, fontSize: sz(14, 18), fontWeight: '600', marginTop: 8, letterSpacing: 0.3 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: sz(70, 60), alignItems: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2, overflow: 'hidden' },
  shimmer: { position: 'absolute', top: 0, bottom: 0, width: 60 },
  status: { color: colors.muted, fontSize: sz(12.5, 15), fontWeight: '600', marginTop: 12, letterSpacing: 0.4 },
});
