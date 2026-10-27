import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { loadVideos, type Video } from '../api/youtube';
import { pictureFade, pictureShown, pictureWasShown } from './Cards';
import { Shimmer } from './Shimmer';
import { FocusRow } from './FocusRow';
import { cleanTitle } from './VideoRow';
import { recallRow, rememberRow } from '../data/rowMemory';
import { useBannerFilter } from '../data/bannerFilter';
import { showToast } from '../data/toasts';
import { BannerOptionsModal } from './BannerOptionsModal';
import type { VideoSource } from '../data/channels';
import { GUTTER, RADIUS, SCRIM, colors, isTV, sz } from '../theme';

type Props = {
  // Module-level constants, so the effect below runs once.
  sources: VideoSource[];
  label: string;
  onPlay: (video: Video) => void;
  // TV: put the remote's focus on Watch Now when the app opens. Only one
  // carousel should, or switching tabs would pull focus off the tab bar.
  takeFocus?: boolean;
};

type Featured = Video & { channel: string };

const SLIDES = 6;
const HERO_SIZES = ['maxresdefault', 'hq720', 'mqdefault'];
const ROTATE_MS = 6000;

export const HeroCarousel = memo(function HeroCarousel({ sources, label, onPlay, takeFocus = false }: Props) {
  const { width, height } = useWindowDimensions();
  const { isBlocked, hideLocally, blockGlobally, unhideLocally, unblockGlobally } = useBannerFilter();
  // Built again after being scrolled far away, it shows the same slides at once.
  const memoryKey = `hero:${label}`;
  const [slides, setSlides] = useState<Featured[]>(() => recallRow<Featured>(memoryKey)?.videos ?? []);
  const [pool, setPool] = useState<Featured[]>([]);
  const [index, setIndex] = useState(0);
  const [menuVideo, setMenuVideo] = useState<Featured | null>(null);
  const list = useRef<FlatList<Featured>>(null);
  const touched = useRef(0);

  const cardWidth = width - GUTTER * 2;
  // On TV it leaves room below for the first row of cards.
  const cardHeight = isTV ? Math.round(height * 0.4) : Math.round(cardWidth * 1.02);

  useEffect(() => {
    if (slides.length && pool.length) return;
    let cancelled = false;
    const activeSources = sources.length > 8 ? sources.slice(0, 8) : sources;
    Promise.all(activeSources.map((s) => loadVideos(s).catch(() => [] as Video[]))).then((lists) => {
      if (cancelled) return;
      const all = lists
        .flatMap((l, i) => (Array.isArray(l) ? l.map((v) => ({ ...v, channel: activeSources[i]?.name ?? '' })) : []))
        .filter((v) => v && v.id)
        .sort((a, b) => (b.published || '').localeCompare(a.published || ''));
      // One slide per channel first, so the carousel isn't all from one place.
      const firstPerChannel = all.filter((v, i) => all.findIndex((o) => o.channel === v.channel) === i);
      const rest = all.filter((v) => !firstPerChannel.includes(v));
      const candidates = [...firstPerChannel, ...rest];
      setPool(candidates);
      const picked = candidates.filter((v) => !isBlocked(v.id)).slice(0, SLIDES);
      rememberRow(memoryKey, { videos: picked });
      setSlides(picked);
    });
    return () => {
      cancelled = true;
    };
  }, [sources]);

  // Slides that are not hidden or blocked.
  // Whenever any banner is blocked, the next candidate from the pool fills its place immediately.
  const visibleSlides = useMemo(() => {
    const unblocked = slides.filter((v) => !isBlocked(v.id));
    if (unblocked.length < SLIDES && pool.length > 0) {
      const existing = new Set(unblocked.map((s) => s.id));
      const additions: Featured[] = [];
      for (const candidate of pool) {
        if (!existing.has(candidate.id) && !isBlocked(candidate.id)) {
          existing.add(candidate.id);
          additions.push(candidate);
          if (unblocked.length + additions.length >= SLIDES) break;
        }
      }
      return [...unblocked, ...additions];
    }
    return unblocked;
  }, [slides, isBlocked, pool]);

  // Turns the page every few seconds, unless the viewer just swiped. On TV the
  // remote moves through the slides instead.
  useEffect(() => {
    if (isTV || visibleSlides.length < 2) return;
    const timer = setInterval(() => {
      // Nothing to turn for while the app is out of sight.
      if (AppState.currentState !== 'active') return;
      if (Date.now() - touched.current < ROTATE_MS) return;
      const next = (index + 1) % visibleSlides.length;
      list.current?.scrollToIndex({ index: next, animated: true });
      setIndex(next);
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, [index, visibleSlides.length]);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));

  const handleHideForMe = (v: { id: string; title: string; channel?: string }) => {
    hideLocally({ videoId: v.id, title: v.title, channel: v.channel });
    showToast({
      text: `Hidden from recommendations: ${cleanTitle(v.title)}`,
      icon: 'eye-off-outline',
      action: {
        label: 'Undo',
        onPress: () => unhideLocally(v.id),
      },
    });
  };

  const handleBlockForEveryone = (v: { id: string; title: string; channel?: string }) => {
    blockGlobally({ videoId: v.id, title: v.title, channel: v.channel })
      .then(() => {
        showToast({
          text: `Blocked for all users: ${cleanTitle(v.title)}`,
          icon: 'shield-checkmark-outline',
          action: {
            label: 'Undo',
            onPress: () => unblockGlobally(v.id),
          },
        });
      })
      .catch((err: any) => {
        showToast({
          text: `Failed to block: ${err.message || 'Server error'}`,
          icon: 'alert-circle-outline',
        });
      });
  };

  if (visibleSlides.length === 0) {
    if (slides.length > 0) return null;
    return (
      <View style={[styles.skeleton, { height: cardHeight }]}>
        <Shimmer width={cardWidth} />
      </View>
    );
  }

  const safeIndex = Math.min(index, visibleSlides.length - 1);

  return (
    <View style={styles.wrap}>
      <FocusRow>
        <FlatList
          ref={list}
          horizontal
          pagingEnabled
          data={visibleSlides}
          keyExtractor={(v) => v.id}
          showsHorizontalScrollIndicator={false}
          onScrollBeginDrag={() => (touched.current = Date.now())}
          onMomentumScrollEnd={onScrollEnd}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          renderItem={({ item, index: i }) => (
            <View style={{ width, paddingHorizontal: GUTTER }}>
              <Slide
                video={item}
                label={label}
                height={cardHeight}
                onPlay={() => onPlay(item)}
                onOpenMenu={() => setMenuVideo(item)}
                takeFocus={takeFocus && i === 0}
                // On TV the remote moves between slides, so the dots follow focus.
                onFocused={() => setIndex(i)}
              />
            </View>
          )}
        />
      </FocusRow>
      <View style={styles.dots}>
        {visibleSlides.map((v, i) => (
          <View key={v.id} style={[styles.dot, i === safeIndex && styles.dotActive]} />
        ))}
      </View>

      <BannerOptionsModal
        visible={!!menuVideo}
        video={menuVideo}
        onClose={() => setMenuVideo(null)}
        onHideForMe={handleHideForMe}
        onBlockForEveryone={handleBlockForEveryone}
      />
    </View>
  );
});

const Slide = memo(function Slide({
  video,
  label,
  height,
  onPlay,
  onOpenMenu,
  takeFocus,
  onFocused,
}: {
  video: Featured;
  label: string;
  height: number;
  onPlay: () => void;
  onOpenMenu: () => void;
  takeFocus: boolean;
  onFocused: () => void;
}) {
  // Not every upload has a full-resolution thumbnail, so step down through the
  // 16:9 sizes. (hqdefault is 4:3 with black bars baked in, so it's skipped.)
  const [size, setSize] = useState(0);
  const [loadedUri, setLoadedUri] = useState<string | null>(null);
  const slideWidth = useWindowDimensions().width - GUTTER * 2;
  const uri = `https://i.ytimg.com/vi/${video.id}/${HERO_SIZES[size]}.jpg`;
  const [focused, setFocused] = useState(false);
  const [optionsFocused, setOptionsFocused] = useState(false);

  return (
    <Pressable
      onPress={onPlay}
      onLongPress={onOpenMenu}
      focusable={false}
      style={[styles.slide, { height }]}
    >
      {/* Shimmers until the big picture is in. */}
      {loadedUri !== uri && !pictureWasShown(uri) ? <Shimmer width={slideWidth} /> : null}
      <Image
        source={uri}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={pictureFade(uri, 200)}
        onLoad={() => {
          pictureShown(uri);
          setLoadedUri(uri);
        }}
        cachePolicy="memory-disk"
        onError={() => setSize((n) => Math.min(n + 1, HERO_SIZES.length - 1))}
      />
      <LinearGradient colors={SCRIM} locations={[0.25, 0.6, 1]} style={StyleSheet.absoluteFill} />

      <View style={styles.info}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.title} numberOfLines={2}>
          {cleanTitle(video.title)}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {video.channel}
        </Text>
        <View style={styles.actions}>
          <Pressable
            onPress={onPlay}
            onFocus={() => {
              setFocused(true);
              onFocused();
            }}
            onBlur={() => setFocused(false)}
            hasTVPreferredFocus={isTV && takeFocus}
            style={[styles.watch, focused && styles.watchFocused]}
          >
            <View style={styles.watchIcon}>
              <Ionicons name="play" size={sz(13, 16)} color="#fff" style={{ marginLeft: 2 }} />
            </View>
            <Text style={styles.watchText}>Watch Now</Text>
          </Pressable>

          <Pressable
            onPress={onOpenMenu}
            onFocus={() => {
              setOptionsFocused(true);
              onFocused();
            }}
            onBlur={() => setOptionsFocused(false)}
            style={[styles.optionsBtn, optionsFocused && styles.optionsBtnFocused]}
            accessibilityLabel="Banner options"
          >
            <Ionicons name="ellipsis-horizontal" size={sz(18, 22)} color="#fff" />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  wrap: { marginTop: 4, marginBottom: sz(6, 12) },
  skeleton: {
    marginHorizontal: GUTTER,
    borderRadius: RADIUS + 8,
    backgroundColor: colors.surface,
    marginBottom: 26,
    overflow: 'hidden',
  },
  slide: { borderRadius: RADIUS + 8, overflow: 'hidden', backgroundColor: colors.surface, justifyContent: 'flex-end' },
  info: { padding: sz(20, 32) },
  label: { color: 'rgba(246,244,250,0.75)', fontSize: sz(13, 16), fontWeight: '600', marginBottom: 6 },
  title: {
    color: colors.text,
    fontSize: sz(26, 38),
    fontWeight: '800',
    lineHeight: sz(31, 44),
    maxWidth: isTV ? '60%' : '100%',
  },
  meta: { color: 'rgba(246,244,250,0.7)', fontSize: sz(12.5, 15), marginTop: 8, fontWeight: '500' },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: sz(16, 20),
    gap: sz(10, 14),
  },
  watch: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 30,
    paddingLeft: 6,
    paddingRight: sz(18, 22),
    paddingVertical: 6,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  watchFocused: { borderColor: colors.accent, transform: [{ scale: 1.06 }] },
  watchIcon: {
    width: sz(28, 34),
    height: sz(28, 34),
    borderRadius: 17,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  watchText: { color: colors.background, fontSize: sz(15, 18), fontWeight: '800' },
  optionsBtn: {
    width: sz(42, 48),
    height: sz(42, 48),
    borderRadius: sz(21, 24),
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  optionsBtnFocused: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    transform: [{ scale: 1.06 }],
  },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 12 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.faint },
  dotActive: { width: 18, backgroundColor: colors.accent },
});
