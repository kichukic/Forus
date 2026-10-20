// The big featured card at the top of a tab: the newest uploads from its
// channels, one at a time, with a Watch Now button and page dots.
import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { loadVideos, type Video } from '../api/youtube';
import type { VideoSource } from '../data/channels';
import { GUTTER, RADIUS, SCRIM, colors, isTV } from '../theme';

type Props = {
  // Module-level constants, so the effect below runs once.
  sources: VideoSource[];
  label: string;
  onPlay: (video: Video) => void;
};

type Featured = Video & { channel: string };

const SLIDES = 6;
const HERO_SIZES = ['maxresdefault', 'hq720', 'mqdefault'];
const ROTATE_MS = 6000;

export function HeroCarousel({ sources, label, onPlay }: Props) {
  const { width, height } = useWindowDimensions();
  const [slides, setSlides] = useState<Featured[]>([]);
  const [index, setIndex] = useState(0);
  const list = useRef<FlatList<Featured>>(null);
  const touched = useRef(0);

  const cardWidth = width - GUTTER * 2;
  const cardHeight = isTV ? Math.round(height * 0.5) : Math.round(cardWidth * 1.02);

  useEffect(() => {
    let cancelled = false;
    Promise.all(sources.map((s) => loadVideos(s).catch(() => [] as Video[]))).then((lists) => {
      if (cancelled) return;
      const all = lists
        .flatMap((l, i) => l.map((v) => ({ ...v, channel: sources[i].name })))
        .sort((a, b) => b.published.localeCompare(a.published));
      // One slide per channel first, so the carousel isn't all from one place.
      const firstPerChannel = all.filter((v, i) => all.findIndex((o) => o.channel === v.channel) === i);
      const rest = all.filter((v) => !firstPerChannel.includes(v));
      setSlides([...firstPerChannel, ...rest].slice(0, SLIDES));
    });
    return () => {
      cancelled = true;
    };
  }, [sources]);

  // Turns the page every few seconds, unless the viewer just swiped. On TV the
  // remote moves through the slides instead.
  useEffect(() => {
    if (isTV || slides.length < 2) return;
    const timer = setInterval(() => {
      if (Date.now() - touched.current < ROTATE_MS) return;
      const next = (index + 1) % slides.length;
      list.current?.scrollToIndex({ index: next, animated: true });
      setIndex(next);
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, [index, slides.length]);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));

  if (slides.length === 0) return <View style={[styles.skeleton, { height: cardHeight }]} />;

  return (
    <View style={styles.wrap}>
      <FlatList
        ref={list}
        horizontal
        pagingEnabled
        data={slides}
        keyExtractor={(v) => v.id}
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={() => (touched.current = Date.now())}
        onMomentumScrollEnd={onScrollEnd}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item, index: i }) => (
          <View style={{ width, paddingHorizontal: GUTTER }}>
            <Slide video={item} label={label} height={cardHeight} onPlay={() => onPlay(item)} first={i === 0} />
          </View>
        )}
      />
      <View style={styles.dots}>
        {slides.map((v, i) => (
          <View key={v.id} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

function Slide({
  video,
  label,
  height,
  onPlay,
  first,
}: {
  video: Featured;
  label: string;
  height: number;
  onPlay: () => void;
  first: boolean;
}) {
  // Not every upload has a full-resolution thumbnail, so step down through the
  // 16:9 sizes. (hqdefault is 4:3 with black bars baked in, so it's skipped.)
  const [size, setSize] = useState(0);
  const uri = `https://i.ytimg.com/vi/${video.id}/${HERO_SIZES[size]}.jpg`;
  const [focused, setFocused] = useState(false);

  return (
    <Pressable onPress={onPlay} focusable={false} style={[styles.slide, { height }]}>
      <Image
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        onError={() => setSize((n) => Math.min(n + 1, HERO_SIZES.length - 1))}
      />
      <LinearGradient colors={SCRIM} locations={[0.25, 0.6, 1]} style={StyleSheet.absoluteFill} />

      <View style={styles.info}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.title} numberOfLines={2}>
          {video.title.split('|')[0].trim()}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {video.channel}
        </Text>
        <Pressable
          onPress={onPlay}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          hasTVPreferredFocus={isTV && first}
          style={[styles.watch, focused && styles.watchFocused]}
        >
          <View style={styles.watchIcon}>
            <Ionicons name="play" size={isTV ? 16 : 13} color="#fff" style={{ marginLeft: 2 }} />
          </View>
          <Text style={styles.watchText}>Watch Now</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 4, marginBottom: isTV ? 12 : 6 },
  skeleton: { marginHorizontal: GUTTER, borderRadius: RADIUS + 8, backgroundColor: colors.surface, marginBottom: 26 },
  slide: { borderRadius: RADIUS + 8, overflow: 'hidden', backgroundColor: colors.surface, justifyContent: 'flex-end' },
  info: { padding: isTV ? 32 : 20 },
  label: { color: 'rgba(246,244,250,0.75)', fontSize: isTV ? 16 : 13, fontWeight: '600', marginBottom: 6 },
  title: {
    color: colors.text,
    fontSize: isTV ? 38 : 26,
    fontWeight: '800',
    lineHeight: isTV ? 44 : 31,
    maxWidth: isTV ? '60%' : '100%',
  },
  meta: { color: 'rgba(246,244,250,0.7)', fontSize: isTV ? 15 : 12.5, marginTop: 8, fontWeight: '500' },
  watch: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 30,
    paddingLeft: 6,
    paddingRight: isTV ? 22 : 18,
    paddingVertical: 6,
    marginTop: isTV ? 20 : 16,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  watchFocused: { borderColor: colors.accent, transform: [{ scale: 1.06 }] },
  watchIcon: {
    width: isTV ? 34 : 28,
    height: isTV ? 34 : 28,
    borderRadius: 17,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  watchText: { color: colors.background, fontSize: isTV ? 18 : 15, fontWeight: '800' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 12 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.faint },
  dotActive: { width: 18, backgroundColor: colors.accent },
});
