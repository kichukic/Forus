// The insides of the app's cards: a rounded picture with a duration chip and a
// small play button, and the title with its details underneath.
import { memo, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { resolveLiveVideoId } from '../api/youtubeLive';
import { LIVE_NEWS } from '../data/channels';
import { CARD_HEIGHT, RADIUS, colors, sz } from '../theme';

type VideoCardProps = {
  image?: string | null;
  title: string;
  subtitle?: string;
  duration?: string;
  live?: boolean;
  // Shown on the picture when there is none yet.
  placeholder?: string;
};

export const VideoCardContent = memo(function VideoCardContent({
  image,
  title,
  subtitle,
  duration,
  live,
  placeholder,
}: VideoCardProps) {
  return (
    <View>
      <View style={styles.picture}>
        {image ? (
          <Image
            source={image}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
            // Lists reuse card views; this stops a reused card flashing the old picture.
            recyclingKey={image}
          />
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
          <Ionicons name="play" size={sz(13, 16)} color="#fff" style={styles.playIcon} />
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
});

// A live channel: its colour as a gradient, with a pulsing LIVE badge.
// A live channel: a current frame of its broadcast, tinted with the channel's
// colour, with a pulsing LIVE badge. Until the frame arrives (or if the channel
// isn't live) it is the colour as a gradient.
export const LiveTileContent = memo(function LiveTileContent({ name, color }: { name: string; color: string }) {
  const frame = useLiveFrame(LIVE_NEWS.find((c) => c.name === name)?.channelId);
  return (
    <View>
      <LinearGradient colors={[color, shade(color, 0.55)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.picture}>
        {frame && (
          <>
            <Image
              source={frame.uri}
              style={frame.cropBars ? styles.liveFrameCropped : StyleSheet.absoluteFill}
              contentFit="cover"
              transition={200}
              cachePolicy="memory-disk"
              onError={frame.onError}
            />
            <LinearGradient
              colors={[`${color}00`, `${color}66`, `${color}ee`]}
              locations={[0.2, 0.55, 1]}
              style={StyleSheet.absoluteFill}
            />
          </>
        )}
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
});

// Live frames change, so the picture is fetched afresh every few minutes.
const FRAME_REFRESH_MS = 5 * 60 * 1000;

// A current frame of the channel's live stream. The 640x480 picture is sharp
// but has black bars above and below the 16:9 image, which are cropped off;
// the small 16:9 one is the fallback.
function useLiveFrame(channelId?: string) {
  const [videoId, setVideoId] = useState<string | null>(null);
  const [small, setSmall] = useState(false);

  useEffect(() => {
    if (!channelId) return;
    let cancelled = false;
    resolveLiveVideoId(channelId)
      .then((id) => !cancelled && setVideoId(id))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  if (!videoId) return null;
  const bucket = Math.floor(Date.now() / FRAME_REFRESH_MS);
  return {
    uri: `https://i.ytimg.com/vi/${videoId}/${small ? 'mqdefault_live' : 'sddefault_live'}.jpg?t=${bucket}`,
    cropBars: !small,
    onError: () => setSmall(true),
  };
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
  placeholder: { color: colors.text, fontSize: sz(15, 18), fontWeight: '700', opacity: 0.85 },
  topRight: { position: 'absolute', top: 8, right: 8, flexDirection: 'row' },
  play: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: sz(28, 34),
    height: sz(28, 34),
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
    fontSize: sz(14, 16),
    fontWeight: '700',
    lineHeight: sz(19, 21),
    marginTop: 8,
    paddingHorizontal: 2,
  },
  subtitle: { color: colors.muted, fontSize: sz(12, 13), marginTop: 3, paddingHorizontal: 2 },
  chip: { backgroundColor: 'rgba(12,10,18,0.75)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  chipText: { color: '#fff', fontSize: sz(11, 13), fontWeight: '700' },
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
  liveText: { color: '#fff', fontSize: sz(11, 13), fontWeight: '800', letterSpacing: 1 },
  liveInner: { flex: 1, padding: sz(12, 16), justifyContent: 'space-between' },
  // The 4:3 frame's 16:9 picture sits in its middle three quarters; enlarging
  // it by 4/3 and shifting it up by 1/6 shows just that band.
  liveFrameCropped: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -CARD_HEIGHT / 6,
    height: (CARD_HEIGHT * 4) / 3,
  },
  liveName: { color: '#fff', fontSize: sz(20, 24), fontWeight: '800', lineHeight: sz(24, 28) },
});
