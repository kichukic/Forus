// The insides of the app's cards: a rounded picture with a duration chip and a
// small play button, and the title with its details underneath.
import { memo, useEffect, useMemo, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { resolveLiveVideoIdForTile, savedLiveVideoId } from '../api/youtubeLive';
import { LIVE_NEWS } from '../data/channels';
import { Shimmer } from './Shimmer';
import { FavoriteHeart } from './FavoriteHeart';
import type { FavoriteItem } from '../data/favorites';
import { CARD_HEIGHT, RADIUS, colors, sz } from '../theme';

type VideoCardProps = {
  image?: string | null;
  title: string;
  subtitle?: string;
  duration?: string;
  live?: boolean;
  // Shown on the picture when there is none yet.
  placeholder?: string;
  // The picture's height, for a grid of smaller cards.
  height?: number;
  // Favorite item to show a heart icon on the card
  favoriteItem?: FavoriteItem;
};

// Pictures that have been on screen already. One fades in the first time it
// loads; when its card is built again (scrolled back to) it is simply there,
// instead of the whole row flickering back in.
const shownPictures = new Set<string>();

/** The fade for a picture: `ms` the first time, none after. */
export function pictureFade(uri: string, ms: number): number {
  return shownPictures.has(uri) ? 0 : ms;
}

export function pictureShown(uri: string) {
  shownPictures.add(uri);
}

export function pictureWasShown(uri: string): boolean {
  return shownPictures.has(uri);
}

export const VideoCardContent = memo(function VideoCardContent({
  image,
  title,
  subtitle,
  duration,
  live,
  placeholder,
  height,
  favoriteItem,
}: VideoCardProps) {
  // Until its picture is in (or has failed), the card shimmers.
  const [settled, setSettled] = useState<string | null>(null);
  const waiting = !!image && image !== settled && !shownPictures.has(image);
  return (
    <View>
      <View style={[styles.picture, height ? { height } : null]}>
        {waiting ? <Shimmer /> : null}
        {image ? (
          <Image
            source={image}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={pictureFade(image, 150)}
            onLoad={() => {
              pictureShown(image);
              setSettled(image);
            }}
            onError={() => setSettled(image)}
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
        {favoriteItem ? (
          <View style={styles.favoriteBadge}>
            <FavoriteHeart item={favoriteItem} size={sz(14, 16)} />
          </View>
        ) : null}
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
  const { frame, looking } = useLiveFrame(LIVE_NEWS.find((c) => c.name === name)?.channelId);
  // It shimmers while the stream is looked up and its picture comes in.
  const [settled, setSettled] = useState<string | null>(null);
  const waiting = looking || (!!frame && frame.uri !== settled && !shownPictures.has(frame.uri));
  return (
    <View>
      <LinearGradient colors={[color, shade(color, 0.55)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.picture}>
        {waiting ? <Shimmer /> : null}
        {frame && (
          <>
            <Image
              source={frame.uri}
              style={frame.cropBars ? styles.liveFrameCropped : StyleSheet.absoluteFill}
              contentFit="cover"
              transition={pictureFade(frame.uri, 200)}
              onLoad={() => {
                pictureShown(frame.uri);
                setSettled(frame.uri);
              }}
              cachePolicy="memory-disk"
              onError={() => {
                if (frame.lastTry) setSettled(frame.uri);
                frame.onError();
              }}
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
  // The live video, and which few-minute window its picture was fetched in.
  const [live, setLive] = useState<{ videoId: string; bucket: number } | null>(null);
  const [small, setSmall] = useState(false);
  // Whether the fresh lookup has answered, live or not.
  const [looked, setLooked] = useState(false);

  useEffect(() => {
    if (!channelId) return;
    let cancelled = false;
    const show = (id: string | null) =>
      !cancelled && id && setLive({ videoId: id, bucket: Math.floor(Date.now() / FRAME_REFRESH_MS) });
    // The stream found last time shows at once, unless the fresh lookup is
    // already back; the fresh one replaces it either way.
    let fresh = false;
    savedLiveVideoId(channelId)
      .then((id) => !fresh && show(id))
      .catch(() => {});
    resolveLiveVideoIdForTile(channelId)
      .then((id) => {
        fresh = true;
        show(id);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLooked(true));
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  const looking = !!channelId && !looked;
  if (!live) return { frame: null, looking };
  return {
    frame: {
      uri: `https://i.ytimg.com/vi/${live.videoId}/${small ? 'mqdefault_live' : 'sddefault_live'}.jpg?t=${live.bucket}`,
      cropBars: !small,
      // The sharp picture failing falls back to the small one; that failing too
      // is the end of it.
      onError: () => setSmall(true),
      lastTry: small,
    },
    looking,
  };
}

export function Chip({ text }: { text: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{text}</Text>
    </View>
  );
}

// The badge's dot pulses a few times when it appears and then holds steady. A
// pulse that never stops keeps the phone redrawing the whole screen every
// frame for as long as a live tile is anywhere on it.
const LIVE_PULSES = 3;

export function LiveBadge() {
  // The value is made once, and not read out of a ref while drawing.
  const pulse = useMemo(() => new Animated.Value(1), []);
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.25, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
      { iterations: LIVE_PULSES },
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
  favoriteBadge: { position: 'absolute', top: 8, left: 8, zIndex: 10 },
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
