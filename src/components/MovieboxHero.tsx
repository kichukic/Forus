import { memo, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { browseShelves, browseTabs, type MovieboxSubject } from '../api/moviebox';
import { GUTTER, colors, isTV } from '../theme';

type Props = {
  onOpen: (subject: MovieboxSubject) => void;
  version?: number;
  takeFocus?: boolean;
  // A fixed MovieBox section, such as Anime, instead of the film section.
  sectionId?: number;
  // Which kind of subject leads the slides. Falls back to the rest.
  prefer?: 'movie' | 'series';
};

const SLIDES = 5;
const ROTATE_MS = 6000;

export const MovieboxHero = memo(function MovieboxHero({
  onOpen,
  version = 0,
  takeFocus = false,
  sectionId,
  prefer = 'movie',
}: Props) {
  const { width, height } = useWindowDimensions();
  const [subjects, setSubjects] = useState<MovieboxSubject[]>([]);
  const [index, setIndex] = useState(0);
  const list = useRef<FlatList<MovieboxSubject>>(null);
  const touched = useRef(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let id = sectionId;
        if (id === undefined) {
          const tabs = await browseTabs();
          // Prefer a tab whose name is about movies/films; fall back to the first.
          const movieTab =
            tabs.find((t) => /movie|film/i.test(t.name)) ?? tabs[0];
          id = movieTab ? movieTab.id : 1;
        }
        const shelves = await browseShelves(id);
        if (!alive) return;
        const all = shelves.flatMap((s) => s.subjects ?? []);
        const wanted = all.filter((s) => s.kind === prefer);
        setSubjects((wanted.length ? wanted : all).slice(0, SLIDES));
      } catch {
        if (alive) setSubjects([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [prefer, sectionId, version]);

  const slides = subjects;
  const cardWidth = width - GUTTER * 2;
  const cardHeight = isTV ? Math.round(height * 0.4) : Math.round(cardWidth * 1.02);

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

  if (slides.length === 0) {
    return (
      <View style={[styles.wrap, { width: cardWidth, height: cardHeight }]}>
        <View style={styles.placeholder} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        ref={list}
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(s) => s.id}
        onMomentumScrollEnd={onScrollEnd}
        onScrollBeginDrag={() => (touched.current = Date.now())}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onOpen(item)}
            style={[styles.slide, { width, height: cardHeight }]}
          >
            <Image
              source={{ uri: item.backdrop || item.poster }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
            <LinearGradient
              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.85)']}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.meta}>
              <Text style={styles.title} numberOfLines={2}>
                {item.title}
              </Text>
              <View style={styles.row}>
                {item.year ? <Text style={styles.sub}>{item.year}</Text> : null}
                {item.rating ? <Text style={styles.sub}>★ {item.rating}</Text> : null}
                {item.genre ? <Text style={styles.sub}>{item.genre}</Text> : null}
              </View>
              <View style={styles.playBtn}>
                <Ionicons name="play" size={16} color="#fff" />
                <Text style={styles.playText}>Watch</Text>
              </View>
            </View>
          </Pressable>
        )}
      />
      {slides.length > 1 ? (
        <View style={styles.dots}>
          {slides.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { marginHorizontal: GUTTER, marginBottom: 12 },
  wrap: { marginHorizontal: GUTTER, marginBottom: 12, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surface },
  placeholder: { flex: 1, backgroundColor: colors.surfaceRaised },
  slide: { borderRadius: 16, overflow: 'hidden', justifyContent: 'flex-end' },
  meta: { padding: 16, gap: 6 },
  title: { color: colors.text, fontSize: isTV ? 26 : 20, fontWeight: '900' },
  row: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  sub: { color: colors.muted, fontSize: isTV ? 14 : 12, fontWeight: '600' },
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.accent,
    marginTop: 6,
  },
  playText: { color: '#fff', fontSize: isTV ? 14 : 12, fontWeight: '800' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.faint },
  dotActive: { backgroundColor: colors.accent, width: 18 },
});