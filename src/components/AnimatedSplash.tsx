// The opening screen, styled like a film intro. It takes over from the native
// splash (the same mark on the same background, so the switch can't be seen):
// film strips roll past under a flickering projector beam, the mark lands with
// a lens flare, the name slides together and catches a glint of light, and a
// film-timeline bar fills while the home screen's data loads underneath.
// Finally a flash and a zoom carry it into the app.
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
const INTRO_MS = 2100;
const WORD = ['F', 'o', 'r', 'U', 's'];

// The lit frames on the film strips, like posters flickering past.
const FRAME_COLOURS: [string, string][] = [
  ['#9b5cff', '#3b1a7a'],
  ['#ff6bb5', '#5a1240'],
  ['#4f7cff', '#13245e'],
  ['#ffb347', '#5e3410'],
  ['#38d6c4', '#0f4a44'],
  ['#c084fc', '#3a1660'],
];
const FRAME_W = sz(116, 150);
const FRAME_H = Math.round(FRAME_W * 0.62);
const FRAME_GAP = 10;
const HOLE_BAND = 16;
const STRIP_CYCLE = (FRAME_W + FRAME_GAP) * FRAME_COLOURS.length;

type Props = {
  // True once the home screen's data is in (or loading gave up).
  ready: boolean;
  // 0 to 1, and what is being loaded.
  progress: number;
  status: string;
  onDone: () => void;
};

export function AnimatedSplash({ ready, progress, status, onDone }: Props) {
  const { width, height } = useWindowDimensions();
  const [introDone, setIntroDone] = useState(false);

  const stripA = useRef(new Animated.Value(0)).current;
  const stripB = useRef(new Animated.Value(0)).current;
  const beam = useRef(new Animated.Value(0)).current;
  const reveal = useRef(new Animated.Value(0)).current; // the scene fades up from black
  const mark = useRef(new Animated.Value(0)).current; // the mark punches in
  const flare = useRef(new Animated.Value(0)).current; // the lens-flare streak
  const letters = useRef(new Animated.Value(0)).current; // the name slides together
  const shine = useRef(new Animated.Value(0)).current; // a glint sweeping the name
  const footer = useRef(new Animated.Value(0)).current;
  const bar = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(0)).current;

  // Enough frames to cover the tilted strip across the whole screen, plus one
  // extra cycle so the roll can loop without a seam.
  const frameCount = useMemo(
    () => (Math.ceil((Math.hypot(width, height) * 1.3) / STRIP_CYCLE) + 1) * FRAME_COLOURS.length,
    [width, height],
  );

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});

    const roll = (v: Animated.Value, ms: number) =>
      Animated.loop(Animated.timing(v, { toValue: 1, duration: ms, easing: Easing.linear, useNativeDriver: true }));
    // An uneven flicker, like an old projector lamp.
    const flicker = Animated.loop(
      Animated.sequence(
        [0.75, 1, 0.85, 1, 0.65, 0.95, 1].map((to, i) =>
          Animated.timing(beam, { toValue: to, duration: 120 + ((i * 97) % 260), useNativeDriver: true }),
        ),
      ),
    );
    const glint = Animated.loop(
      Animated.sequence([
        Animated.delay(900),
        Animated.timing(shine, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(shine, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(1400),
      ]),
    );
    const ambient = [roll(stripA, 9000), roll(stripB, 11000), flicker];
    ambient.forEach((a) => a.start());

    Animated.sequence([
      Animated.timing(reveal, { toValue: 1, duration: 450, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.parallel([
        Animated.spring(mark, { toValue: 1, useNativeDriver: true, speed: 9, bounciness: 11 }),
        Animated.sequence([
          Animated.delay(140),
          Animated.timing(flare, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
      ]),
      Animated.timing(letters, { toValue: 1, duration: 520, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }),
      Animated.timing(footer, { toValue: 1, duration: 350, useNativeDriver: true }),
    ]).start(() => glint.start());
    const timer = setTimeout(() => setIntroDone(true), INTRO_MS);

    return () => {
      clearTimeout(timer);
      ambient.forEach((a) => a.stop());
      glint.stop();
    };
  }, []);

  // The timeline bar follows the loading progress.
  useEffect(() => {
    Animated.timing(bar, {
      toValue: progress,
      duration: 450,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress]);

  // Leaves once the intro has played and the data is in: a flash of light, the
  // mark zooms forward and everything fades into the app.
  useEffect(() => {
    if (!introDone || !ready) return;
    Animated.timing(bar, { toValue: 1, duration: 200, useNativeDriver: false }).start();
    Animated.timing(exit, {
      toValue: 1,
      duration: 560,
      delay: 160,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => onDone());
  }, [introDone, ready]);

  const sceneIn = reveal.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const fadeOut = exit.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 0.55, 0] });
  const contentOut = exit.interpolate({ inputRange: [0, 0.45], outputRange: [1, 0], extrapolate: 'clamp' });
  const flash = exit.interpolate({ inputRange: [0, 0.25, 0.6], outputRange: [0, 0.28, 0], extrapolate: 'clamp' });

  const markScale = Animated.multiply(
    mark.interpolate({ inputRange: [0, 1], outputRange: [1, 0.78] }),
    exit.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }),
  );
  const markLift = mark.interpolate({ inputRange: [0, 1], outputRange: [0, sz(-64, -52)] });
  const flareWidth = flare.interpolate({ inputRange: [0, 1], outputRange: [0.05, 1] });
  const flareOpacity = flare.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 0.35] });

  const barWidth = bar.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const barLength = sz(200, 280);
  const playhead = bar.interpolate({ inputRange: [0, 1], outputRange: [0, barLength] });

  const wordWidth = sz(190, 250);
  const shineX = shine.interpolate({ inputRange: [0, 1], outputRange: [-80, wordWidth + 80] });

  const strip = (roll: Animated.Value, top: number, reverse: boolean) => (
    <Animated.View
      style={[
        styles.strip,
        {
          top,
          left: -width * 0.4,
          opacity: Animated.multiply(sceneIn, 0.5),
          transform: [
            { rotate: '-11deg' },
            {
              translateX: roll.interpolate({
                inputRange: [0, 1],
                outputRange: reverse ? [-STRIP_CYCLE, 0] : [0, -STRIP_CYCLE],
              }),
            },
          ],
        },
      ]}
    >
      <Holes count={frameCount} />
      <View style={styles.frames}>
        {Array.from({ length: frameCount }, (_, i) => {
          const [from, to] = FRAME_COLOURS[i % FRAME_COLOURS.length];
          return (
            <LinearGradient
              key={i}
              colors={[from, to]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.frame}
            />
          );
        })}
      </View>
      <Holes count={frameCount} />
    </Animated.View>
  );

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.screen, { opacity: fadeOut }]} pointerEvents="none">
      {strip(stripA, height * 0.16, false)}
      {strip(stripB, height * 0.64, true)}

      {/* The projector beam from the top, flickering. */}
      <Animated.View style={[styles.beamWrap, { opacity: Animated.multiply(Animated.multiply(beam, sceneIn), contentOut) }]}>
        <LinearGradient
          colors={['rgba(214,190,255,0.30)', 'rgba(155,92,255,0.10)', 'transparent']}
          style={[styles.beam, { width: width * 0.9, height: height * 0.75, transform: [{ rotate: '8deg' }] }]}
        />
        <LinearGradient
          colors={['rgba(214,190,255,0.30)', 'rgba(155,92,255,0.10)', 'transparent']}
          style={[styles.beam, { width: width * 0.9, height: height * 0.75, transform: [{ rotate: '-8deg' }] }]}
        />
      </Animated.View>

      {/* Darkens the edges, the way a cinema screen falls off into black. */}
      <LinearGradient
        colors={['rgba(12,10,18,0.85)', 'rgba(12,10,18,0.2)', 'rgba(12,10,18,0.2)', 'rgba(12,10,18,0.92)']}
        locations={[0, 0.3, 0.62, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.center}>
        <Animated.View style={[styles.markWrap, { transform: [{ translateY: markLift }] }]}>
          <Animated.View
            style={[
              styles.flare,
              { width: width * 1.2, opacity: Animated.multiply(flareOpacity, contentOut), transform: [{ scaleX: flareWidth }] },
            ]}
          >
            <LinearGradient
              colors={['transparent', 'rgba(255,255,255,0.95)', 'transparent']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          <Animated.View
            style={[
              styles.glow,
              { opacity: Animated.multiply(flareOpacity, contentOut), transform: [{ scale: flareWidth }] },
            ]}
          />
          <Animated.Image source={MARK} style={[styles.mark, { transform: [{ scale: markScale }] }]} />
        </Animated.View>

        <Animated.View style={[styles.words, { opacity: contentOut }]}>
          <View style={[styles.wordBox, { width: wordWidth }]}>
            <View style={styles.wordRow}>
              {WORD.map((letter, i) => (
                <Animated.Text
                  key={i}
                  style={[
                    styles.brand,
                    i >= 3 && styles.brandAccent,
                    {
                      opacity: letters,
                      transform: [
                        {
                          translateX: letters.interpolate({
                            inputRange: [0, 1],
                            outputRange: [(i - 2) * sz(34, 44), 0],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  {letter}
                </Animated.Text>
              ))}
            </View>
            {/* A glint of light that sweeps across the name now and then. */}
            <Animated.View style={[styles.shine, { transform: [{ translateX: shineX }, { rotate: '18deg' }] }]}>
              <LinearGradient
                colors={['transparent', 'rgba(255,255,255,0.55)', 'transparent']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          </View>
          <Animated.Text style={[styles.credit, { opacity: letters }]}>
            Made with <Text style={styles.heart}>♥</Text> by Kishor
          </Animated.Text>
        </Animated.View>
      </View>

      {/* Loading, as a film timeline with a playhead. */}
      <Animated.View style={[styles.footer, { opacity: Animated.multiply(footer, contentOut) }]}>
        <View style={{ width: barLength }}>
          <View style={styles.ticks}>
            {Array.from({ length: 11 }, (_, i) => (
              <View key={i} style={[styles.tick, i % 5 === 0 && styles.tickMajor]} />
            ))}
          </View>
          <View style={styles.track}>
            <Animated.View style={[styles.fill, { width: barWidth }]}>
              <LinearGradient
                colors={[colors.accentDeep, colors.accent, '#ff6bb5']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          </View>
          <Animated.View style={[styles.playhead, { left: playhead }]} />
        </View>
        <Text style={styles.status}>{status}</Text>
      </Animated.View>

      <Animated.View style={[StyleSheet.absoluteFill, styles.flash, { opacity: flash }]} />
    </Animated.View>
  );
}

// A row of sprocket holes along a film strip's edge.
function Holes({ count }: { count: number }) {
  const holes = Math.ceil(((FRAME_W + FRAME_GAP) * count) / 22);
  return (
    <View style={styles.holes}>
      {Array.from({ length: holes }, (_, i) => (
        <View key={i} style={styles.hole} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, zIndex: 100, elevation: 100, overflow: 'hidden' },
  strip: { position: 'absolute', backgroundColor: '#0f0d16', paddingHorizontal: 4 },
  holes: { flexDirection: 'row', height: HOLE_BAND, alignItems: 'center' },
  hole: { width: 10, height: 7, borderRadius: 2, backgroundColor: colors.background, marginRight: 12 },
  frames: { flexDirection: 'row' },
  frame: { width: FRAME_W, height: FRAME_H, marginRight: FRAME_GAP, borderRadius: 4 },
  beamWrap: { position: 'absolute', top: -40, left: 0, right: 0, alignItems: 'center' },
  beam: { position: 'absolute', top: 0, borderBottomLeftRadius: 400, borderBottomRightRadius: 400 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  markWrap: { alignItems: 'center', justifyContent: 'center' },
  flare: { position: 'absolute', height: 3, borderRadius: 2, overflow: 'hidden' },
  glow: {
    position: 'absolute',
    width: NATIVE_MARK_SIZE * 1.3,
    height: NATIVE_MARK_SIZE * 1.3,
    borderRadius: NATIVE_MARK_SIZE,
    backgroundColor: 'rgba(155,92,255,0.3)',
  },
  mark: { width: NATIVE_MARK_SIZE, height: NATIVE_MARK_SIZE },
  words: { position: 'absolute', top: '50%', marginTop: sz(40, 52), alignItems: 'center' },
  wordBox: { alignItems: 'center', overflow: 'hidden' },
  wordRow: { flexDirection: 'row' },
  brand: { color: colors.text, fontSize: sz(50, 64), fontWeight: '900', letterSpacing: -1 },
  brandAccent: { color: colors.accent },
  shine: { position: 'absolute', top: -20, bottom: -20, left: 0, width: 46 },
  credit: { color: colors.muted, fontSize: sz(14, 18), fontWeight: '600', marginTop: 6, letterSpacing: 0.3 },
  heart: { color: '#ff6bb5' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: sz(70, 60), alignItems: 'center' },
  ticks: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  tick: { width: 1, height: 5, backgroundColor: 'rgba(255,255,255,0.22)' },
  tickMajor: { height: 8, backgroundColor: 'rgba(255,255,255,0.4)' },
  track: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2, overflow: 'hidden' },
  playhead: {
    position: 'absolute',
    bottom: -4,
    width: 12,
    height: 12,
    marginLeft: -6,
    borderRadius: 6,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: colors.accent,
  },
  status: { color: colors.muted, fontSize: sz(12.5, 15), fontWeight: '600', marginTop: 14, letterSpacing: 0.4 },
  flash: { backgroundColor: '#fff' },
});
