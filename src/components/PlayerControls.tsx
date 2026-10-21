// The app's own controls, drawn over the video. YouTube's are switched off, so
// these are what the viewer sees and touches.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, sz } from '../theme';
import { LiveBadge } from './Cards';

export type PlaybackTime = { t: number; d: number };

type Props = {
  paused: boolean;
  buffering: boolean;
  time: PlaybackTime;
  live: boolean;
  onToggle: () => void;
  onSeekBy: (seconds: number) => void;
  onSeekTo: (seconds: number) => void;
};

const HIDE_AFTER_MS = 3000;
const DOUBLE_TAP_MS = 280;
const SKIP = 10;

export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function PlayerControls({ paused, buffering, time, live, onToggle, onSeekBy, onSeekTo }: Props) {
  const [visible, setVisible] = useState(true);
  const [skipFlash, setSkipFlash] = useState<{ side: 'left' | 'right'; key: number } | null>(null);
  const opacity = useRef(new Animated.Value(1)).current;
  const lastTap = useRef<{ at: number; side: 'left' | 'right' } | null>(null);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const width = useRef(0);

  const show = (on: boolean) => {
    setVisible(on);
    Animated.timing(opacity, { toValue: on ? 1 : 0, duration: 180, useNativeDriver: true }).start();
  };

  // Fade away while playing; stay up while paused.
  useEffect(() => {
    if (!visible || paused) return;
    const timer = setTimeout(() => show(false), HIDE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [visible, paused, time.t > 0]);

  useEffect(() => {
    if (paused) show(true);
  }, [paused]);

  // One tap shows or hides the controls; two quick taps on a side skip.
  const onTap = (x: number) => {
    const side = x < width.current / 2 ? 'left' : 'right';
    const now = Date.now();
    if (!live && lastTap.current && now - lastTap.current.at < DOUBLE_TAP_MS && lastTap.current.side === side) {
      if (tapTimer.current) clearTimeout(tapTimer.current);
      lastTap.current = null;
      onSeekBy(side === 'left' ? -SKIP : SKIP);
      setSkipFlash({ side, key: now });
      return;
    }
    lastTap.current = { at: now, side };
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => show(!visible), DOUBLE_TAP_MS);
  };

  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={(e: LayoutChangeEvent) => (width.current = e.nativeEvent.layout.width)}
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={(e) => onTap(e.nativeEvent.locationX)} />

      {skipFlash && <SkipFlash key={skipFlash.key} side={skipFlash.side} onDone={() => setSkipFlash(null)} />}

      {buffering && !paused && (
        <View style={styles.center} pointerEvents="none">
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}

      <Animated.View style={[StyleSheet.absoluteFill, { opacity }]} pointerEvents={visible ? 'box-none' : 'none'}>
        <LinearGradient
          colors={['rgba(0,0,0,0.45)', 'transparent', 'transparent', 'rgba(0,0,0,0.75)']}
          locations={[0, 0.3, 0.6, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        <View style={styles.center} pointerEvents="box-none">
          {!live && <RoundIcon icon="play-back" label="10" size={44} onPress={() => onSeekBy(-SKIP)} />}
          <RoundIcon icon={paused ? 'play' : 'pause'} size={64} onPress={onToggle} primary />
          {!live && <RoundIcon icon="play-forward" label="10" size={44} onPress={() => onSeekBy(SKIP)} />}
        </View>

        <View style={styles.bottom} pointerEvents="box-none">
          {live ? (
            <LiveBadge />
          ) : (
            <>
              <Text style={styles.time}>
                {formatTime(time.t)} <Text style={styles.timeTotal}>/ {formatTime(time.d)}</Text>
              </Text>
              <SeekBar time={time} onSeekTo={onSeekTo} />
            </>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

// The thin progress line for TV, where the remote does the seeking. While skip
// presses are being gathered, it previews where the player is about to jump.
export function ProgressLine({ time, live, target }: { time: PlaybackTime; live: boolean; target?: number | null }) {
  if (live) return null;
  const fraction = time.d > 0 ? Math.min(1, time.t / time.d) : 0;
  const preview = target != null && time.d > 0 ? Math.min(1, target / time.d) : null;
  return (
    <View style={styles.tvProgress}>
      <Text style={styles.time}>{formatTime(time.t)}</Text>
      <View style={styles.tvTrack}>
        {preview !== null && <View style={[styles.preview, { width: `${preview * 100}%` }]} />}
        <View style={[styles.fill, { width: `${fraction * 100}%` }]} />
      </View>
      <Text style={styles.timeTotal}>
        {preview !== null ? <Text style={styles.jump}>Jump to {formatTime(target!)}   </Text> : null}
        {formatTime(time.d)}
      </Text>
    </View>
  );
}

function SeekBar({ time, onSeekTo }: { time: PlaybackTime; onSeekTo: (seconds: number) => void }) {
  const [trackWidth, setTrackWidth] = useState(1);
  // While dragging, the bar follows the finger instead of the player.
  const [dragging, setDragging] = useState<number | null>(null);
  const latest = useRef({ trackWidth, duration: time.d, onSeekTo });
  latest.current = { trackWidth, duration: time.d, onSeekTo };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => setDragging(clamp(e.nativeEvent.locationX / latest.current.trackWidth)),
        onPanResponderMove: (e) => setDragging(clamp(e.nativeEvent.locationX / latest.current.trackWidth)),
        onPanResponderRelease: (e) => {
          const f = clamp(e.nativeEvent.locationX / latest.current.trackWidth);
          latest.current.onSeekTo(f * latest.current.duration);
          setDragging(null);
        },
        onPanResponderTerminate: () => setDragging(null),
      }),
    [],
  );

  const fraction = dragging ?? (time.d > 0 ? Math.min(1, time.t / time.d) : 0);

  return (
    <View
      style={styles.seekHit}
      onLayout={(e) => setTrackWidth(Math.max(1, e.nativeEvent.layout.width))}
      {...pan.panHandlers}
    >
      <View style={styles.track} pointerEvents="none">
        <View style={[styles.fill, { width: `${fraction * 100}%` }]} />
      </View>
      <View
        pointerEvents="none"
        style={[styles.thumb, dragging !== null && styles.thumbActive, { left: fraction * trackWidth - 7 }]}
      />
    </View>
  );
}

function RoundIcon({
  icon,
  label,
  size,
  onPress,
  primary,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label?: string;
  size: number;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [
        styles.round,
        { width: size, height: size, borderRadius: size / 2 },
        primary && styles.roundPrimary,
        pressed && { transform: [{ scale: 0.92 }] },
      ]}
    >
      <Ionicons name={icon} size={size * 0.46} color="#fff" style={icon === 'play' ? { marginLeft: 3 } : undefined} />
      {label ? <Text style={styles.roundLabel}>{label}</Text> : null}
    </Pressable>
  );
}

function SkipFlash({ side, onDone }: { side: 'left' | 'right'; onDone: () => void }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 120, useNativeDriver: true }),
      Animated.delay(350),
      Animated.timing(anim, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(onDone);
  }, []);
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.flash, side === 'left' ? styles.flashLeft : styles.flashRight, { opacity: anim }]}
    >
      <Ionicons name={side === 'left' ? 'play-back' : 'play-forward'} size={22} color="#fff" />
      <Text style={styles.flashText}>{side === 'left' ? `−${SKIP}s` : `+${SKIP}s`}</Text>
    </Animated.View>
  );
}

const clamp = (f: number) => Math.min(1, Math.max(0, f));

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 34,
  },
  round: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  roundPrimary: { backgroundColor: 'rgba(155,92,255,0.92)' },
  roundLabel: { position: 'absolute', bottom: 3, color: '#fff', fontSize: 9, fontWeight: '800' },
  bottom: { position: 'absolute', left: 14, right: 14, bottom: 8 },
  time: { color: '#fff', fontSize: sz(12.5, 16), fontWeight: '700', marginBottom: 2 },
  timeTotal: { color: 'rgba(255,255,255,0.65)', fontSize: sz(12.5, 16), fontWeight: '600' },
  seekHit: { height: 22, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.28)', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.accent, borderRadius: 2 },
  thumb: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: '#fff',
  },
  thumbActive: { transform: [{ scale: 1.35 }] },
  flash: {
    position: 'absolute',
    top: '35%',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 30,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  flashLeft: { left: '12%' },
  flashRight: { right: '12%' },
  flashText: { color: '#fff', fontSize: 13, fontWeight: '800', marginTop: 2 },
  tvProgress: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  preview: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: 'rgba(155,92,255,0.45)' },
  jump: { color: colors.accent, fontWeight: '800' },
  tvTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
});
