// The insides of the app's cards: a rounded picture with a duration chip and a
// small play button, and the title with its details underneath.
import { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { CARD_HEIGHT, RADIUS, colors, isTV } from '../theme';

type VideoCardProps = {
  image?: string | null;
  title: string;
  subtitle?: string;
  duration?: string;
  live?: boolean;
  // Shown on the picture when there is none yet.
  placeholder?: string;
};

export function VideoCardContent({ image, title, subtitle, duration, live, placeholder }: VideoCardProps) {
  return (
    <View>
      <View style={styles.picture}>
        {image ? (
          <Image source={{ uri: image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <LinearGradient colors={[colors.surfaceRaised, colors.surface]} style={[StyleSheet.absoluteFill, styles.blank]}>
            {placeholder ? (
              <Text style={styles.placeholder} numberOfLines={3}>
                {placeholder}
              </Text>
            ) : null}
          </LinearGradient>
        )}
        <View style={styles.topRight}>{live ? <LiveBadge /> : duration ? <Chip text={duration} /> : null}</View>
        <View style={styles.play}>
          <Ionicons name="play" size={isTV ? 16 : 13} color="#fff" style={styles.playIcon} />
        </View>
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

// A live channel: its colour as a gradient, with a pulsing LIVE badge.
export function LiveTileContent({ name, color }: { name: string; color: string }) {
  return (
    <View>
      <LinearGradient colors={[color, shade(color, 0.55)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.picture}>
        <View style={styles.liveInner}>
          <LiveBadge />
          <Text style={styles.liveName} numberOfLines={2}>
            {name}
          </Text>
        </View>
      </LinearGradient>
      <Text style={styles.title} numberOfLines={1}>
        {name}
      </Text>
      <Text style={styles.subtitle}>Live now · News</Text>
    </View>
  );
}

export function Chip({ text }: { text: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{text}</Text>
    </View>
  );
}

export function LiveBadge() {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.25, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={styles.liveBadge}>
      <Animated.View style={[styles.liveDot, { opacity: pulse }]} />
      <Text style={styles.liveText}>LIVE</Text>
    </View>
  );
}

// Darkens a #rrggbb colour; used for the far end of a live tile's gradient.
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Math.round(((n >> shift) & 255) * (1 - amount));
  return `rgb(${channel(16)},${channel(8)},${channel(0)})`;
}

const styles = StyleSheet.create({
  picture: { height: CARD_HEIGHT, borderRadius: RADIUS, overflow: 'hidden', backgroundColor: colors.surface },
  blank: { justifyContent: 'center', padding: 14 },
  placeholder: { color: colors.text, fontSize: isTV ? 18 : 15, fontWeight: '700', opacity: 0.85 },
  topRight: { position: 'absolute', top: 8, right: 8, flexDirection: 'row' },
  play: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: isTV ? 34 : 28,
    height: isTV ? 34 : 28,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(155,92,255,0.92)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  playIcon: { marginLeft: 2 },
  title: {
    color: colors.text,
    fontSize: isTV ? 16 : 14,
    fontWeight: '700',
    lineHeight: isTV ? 21 : 19,
    marginTop: 8,
    paddingHorizontal: 2,
  },
  subtitle: { color: colors.muted, fontSize: isTV ? 13 : 12, marginTop: 3, paddingHorizontal: 2 },
  chip: { backgroundColor: 'rgba(12,10,18,0.75)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  chipText: { color: '#fff', fontSize: isTV ? 13 : 11, fontWeight: '700' },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.live,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff', marginRight: 5 },
  liveText: { color: '#fff', fontSize: isTV ? 13 : 11, fontWeight: '800', letterSpacing: 1 },
  liveInner: { flex: 1, padding: isTV ? 16 : 12, justifyContent: 'space-between' },
  liveName: { color: '#fff', fontSize: isTV ? 24 : 20, fontWeight: '800', lineHeight: isTV ? 28 : 24 },
});
