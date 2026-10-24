// The opening screen: a poster wall. Columns of real thumbnails, tilted back in
// 3D, scroll at different speeds behind the ForUs mark while the home screen's
// data loads underneath. Posters fill in as the feeds arrive (and are saved for
// next time, so later launches open with a full wall). It takes over from the
// native splash (the same mark on the same background) and waits for that to
// finish fading before anything moves, then dollies forward into the app.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as SplashScreen from 'expo-splash-screen';
import { colors, isTV, sz } from '../theme';

// Keeps the native splash up until this component has drawn its first frame,
// and keeps its fade-out short so it doesn't overlap the animation.
SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ fade: true, duration: 150 });

const MARK = require('../../assets/images/splash-icon.png');
// Matches imageWidth for expo-splash-screen in app.json.
const NATIVE_MARK_SIZE = 180;
// The intro always plays to the end, however fast the data arrives.
const INTRO_MS = 2200;
// After the native splash says it has hidden, a moment for its fade to finish.
const HANDOVER_MS = 180;

const COLUMNS = isTV ? 7 : 5;
const GAP = 10;
// Placeholder colours for tiles whose poster hasn't arrived.
const TILE_COLOURS: [string, string][] = [
  ['#3b1a7a', '#1a1030'],
  ['#5a1240', '#22101c'],
  ['#13245e', '#0e1328'],
  ['#4a2a10', '#1c140c'],
  ['#0f4a44', '#0b1c1b'],
];

type Props = {
  // True once the home screen's data is in (or loading gave up).
  ready: boolean;
  // 0 to 1, and what is being loaded.
  progress: number;
  status: string;
  // Thumbnails for the wall.
  posters: string[];
  onDone: () => void;
};

export function AnimatedSplash({ ready, progress, status, posters, onDone }: Props) {
  const { width, height } = useWindowDimensions();
  const [introDone, setIntroDone] = useState(false);

  const columns = useRef(Array.from({ length: COLUMNS }, () => new Animated.Value(0))).current;
  const wall = useRef(new Animated.Value(0)).current; // the wall fades in and settles
  const mark = useRef(new Animated.Value(0)).current; // the mark rises into place
  const halo = useRef(new Animated.Value(0)).current;
  const words = useRef(new Animated.Value(0)).current;
  const shine = useRef(new Animated.Value(0)).current;
  const footer = useRef(new Animated.Value(0)).current;
  const bar = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(0)).current;

  // The wall is larger than the screen, so its tilted edges stay off screen.
  const wallWidth = width * 1.75;
  const wallHeight = height * 1.7;
  const columnWidth = (wallWidth - GAP * (COLUMNS + 1)) / COLUMNS;
  const tileHeight = (columnWidth * 9) / 16;
  const perColumn = Math.ceil(wallHeight / (tileHeight + GAP)) + 1;
  const cycle = perColumn * (tileHeight + GAP);

  // Which poster sits where: spread so neighbours differ.
  const grid = useMemo(
    () =>
      Array.from({ length: COLUMNS }, (_, c) =>
        Array.from({ length: perColumn }, (_, r) => (posters.length ? posters[(c * 7 + r * 3) % posters.length] : null)),
      ),
    [posters, perColumn],
  );

  useEffect(() => {
    let ambient: Animated.CompositeAnimation[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const start = () => {
      if (cancelled) return;
      // Each column scrolls its own way at its own speed.
      ambient = columns.map((v, i) =>
        Animated.loop(
          Animated.timing(v, {
            toValue: 1,
            duration: 16000 + ((i * 3700) % 9000),
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        ),
      );
      ambient.push(
        Animated.loop(
          Animated.sequence([
            Animated.timing(halo, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(halo, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          ]),
        ),
        Animated.loop(
          Animated.sequence([
            Animated.delay(700),
            Animated.timing(shine, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            Animated.timing(shine, { toValue: 0, duration: 0, useNativeDriver: true }),
            Animated.delay(1600),
          ]),
        ),
      );
      ambient.forEach((a) => a.start());

      Animated.parallel([
        Animated.timing(wall, { toValue: 1, duration: 1400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(250),
          Animated.spring(mark, { toValue: 1, useNativeDriver: true, speed: 7, bounciness: 8 }),
          Animated.timing(words, { toValue: 1, duration: 460, easing: Easing.out(Easing.back(1.3)), useNativeDriver: true }),
          Animated.timing(footer, { toValue: 1, duration: 320, useNativeDriver: true }),
        ]),
      ]).start();
      timer = setTimeout(() => setIntroDone(true), INTRO_MS);
    };

    // Nothing moves until the native splash has gone; otherwise its fading
    // copy of the mark and this one show at the same time.
    SplashScreen.hideAsync()
      .catch(() => {})
      .finally(() => setTimeout(start, HANDOVER_MS));

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
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

  // Leaves once the intro has played and the data is in: the wall dollies
  // towards the camera and everything fades into the app.
  useEffect(() => {
    if (!introDone || !ready) return;
    Animated.timing(bar, { toValue: 1, duration: 200, useNativeDriver: false }).start();
    Animated.timing(exit, {
      toValue: 1,
      duration: 620,
      delay: 160,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => onDone());
  }, [introDone, ready]);

  const fadeOut = exit.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0.6, 0] });
  const contentOut = exit.interpolate({ inputRange: [0, 0.45], outputRange: [1, 0], extrapolate: 'clamp' });
  // The wall starts close and settles back (a reveal), then rushes forward on exit.
  const dolly = Animated.add(
    wall.interpolate({ inputRange: [0, 1], outputRange: [1.25, 1] }),
    exit.interpolate({ inputRange: [0, 1], outputRange: [0, 0.6] }),
  );

  const markLift = mark.interpolate({ inputRange: [0, 1], outputRange: [0, sz(-62, -50)] });
  const markScale = Animated.multiply(
    mark.interpolate({ inputRange: [0, 1], outputRange: [1, 0.8] }),
    exit.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] }),
  );
  const barWidth = bar.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const barLength = sz(200, 280);
  const wordWidth = sz(190, 250);
  const shineX = shine.interpolate({ inputRange: [0, 1], outputRange: [-80, wordWidth + 80] });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.screen, { opacity: fadeOut }]} pointerEvents="none">
      {/* The wall, tilted back like a stage set. */}
      <Animated.View
        style={[
          styles.wall,
          {
            width: wallWidth,
            height: wallHeight,
            left: (width - wallWidth) / 2,
            top: (height - wallHeight) / 2,
            opacity: wall,
            transform: [{ perspective: 1100 }, { rotateX: '26deg' }, { rotateZ: '-13deg' }, { scale: dolly }],
          },
        ]}
      >
        {grid.map((column, c) => (
          <Animated.View
            key={c}
            style={{
              width: columnWidth,
              marginLeft: GAP,
              transform: [
                {
                  translateY: columns[c].interpolate({
                    inputRange: [0, 1],
                    // Alternate columns run up and down.
                    outputRange: c % 2 ? [-cycle, 0] : [0, -cycle],
                  }),
                },
              ],
            }}
          >
            {/* Two copies, so the scroll loops without a seam. */}
            {[...column, ...column].map((uri, r) => (
              <Tile key={r} uri={uri} height={tileHeight} colour={TILE_COLOURS[(c + r) % TILE_COLOURS.length]} />
            ))}
          </Animated.View>
        ))}
      </Animated.View>

      {/* Dims the wall, darkest behind the mark so it reads clearly. */}
      <LinearGradient
        colors={[
          'rgba(12,10,18,0.9)',
          'rgba(12,10,18,0.35)',
          'rgba(12,10,18,0.82)',
          'rgba(12,10,18,0.35)',
          'rgba(12,10,18,0.95)',
        ]}
        locations={[0, 0.3, 0.5, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.center}>
        <Animated.View style={[styles.markWrap, { transform: [{ translateY: markLift }] }]}>
          <Animated.View
            style={[
              styles.halo,
              {
                opacity: Animated.multiply(
                  halo.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.9] }),
                  Animated.multiply(mark, contentOut),
                ),
                transform: [{ scale: halo.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.2] }) }],
              },
            ]}
          />
          <Animated.Image source={MARK} style={[styles.mark, { transform: [{ scale: markScale }] }]} />
        </Animated.View>

        <Animated.View
          style={[
            styles.words,
            {
              opacity: Animated.multiply(words, contentOut),
              transform: [{ translateY: words.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
            },
          ]}
        >
          <View style={[styles.wordBox, { width: wordWidth }]}>
            <Text style={styles.brand}>
              For<Text style={styles.brandAccent}>Us</Text>
            </Text>
            {/* A glint of light that sweeps across the name now and then. */}
            <Animated.View style={[styles.shine, { transform: [{ translateX: shineX }, { rotate: '18deg' }] }]}>
              <LinearGradient
                colors={['transparent', 'rgba(255,255,255,0.22)', 'transparent']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          </View>
          <Text style={styles.credit}>
            Made with <Text style={styles.heart}>♥</Text>
          </Text>
        </Animated.View>
      </View>

      <Animated.View style={[styles.footer, { opacity: Animated.multiply(footer, contentOut) }]}>
        <View style={[styles.track, { width: barLength }]}>
          <Animated.View style={[styles.fill, { width: barWidth }]}>
            <LinearGradient
              colors={[colors.accentDeep, colors.accent, '#ff6bb5']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </View>
        <Text style={styles.status}>{status}</Text>
      </Animated.View>
    </Animated.View>
  );
}

// One poster on the wall, or a coloured placeholder until its picture arrives.
function Tile({ uri, height, colour }: { uri: string | null; height: number; colour: [string, string] }) {
  return (
    <View style={[styles.tile, { height }]}>
      <LinearGradient colors={colour} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {uri ? (
        <Image source={uri} style={StyleSheet.absoluteFill} contentFit="cover" transition={500} cachePolicy="memory-disk" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, zIndex: 100, elevation: 100, overflow: 'hidden' },
  wall: { position: 'absolute', flexDirection: 'row' },
  tile: { marginBottom: GAP, borderRadius: 8, overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  markWrap: { alignItems: 'center', justifyContent: 'center' },
  halo: {
    position: 'absolute',
    width: NATIVE_MARK_SIZE * 1.45,
    height: NATIVE_MARK_SIZE * 1.45,
    borderRadius: NATIVE_MARK_SIZE,
    backgroundColor: 'rgba(155,92,255,0.32)',
  },
  mark: { width: NATIVE_MARK_SIZE, height: NATIVE_MARK_SIZE },
  words: { position: 'absolute', top: '50%', marginTop: sz(42, 54), alignItems: 'center' },
  wordBox: { alignItems: 'center', overflow: 'hidden' },
  brand: { color: colors.text, fontSize: sz(50, 64), fontWeight: '900', letterSpacing: -1 },
  brandAccent: { color: colors.accent },
  shine: { position: 'absolute', top: -20, bottom: -20, left: 0, width: 28 },
  credit: { color: colors.muted, fontSize: sz(14, 18), fontWeight: '600', marginTop: 6, letterSpacing: 0.3 },
  heart: { color: '#ff6bb5' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: sz(70, 60), alignItems: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2, overflow: 'hidden' },
  status: { color: colors.muted, fontSize: sz(12.5, 15), fontWeight: '600', marginTop: 12, letterSpacing: 0.4 },
});
