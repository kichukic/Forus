import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type RefreshControlProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CATALOGS,
  GENRES,
  loadCatalogPage,
  searchStreamio,
  type StreamioItem,
  type StreamioType,
} from '../api/streamiobox';
import { FocusCard } from '../components/FocusCard';
import { playableKey } from '../data/history';
import { Loader } from '../components/Loader';
import { SectionHeader } from '../components/Section';
import { GUTTER, RADIUS, colors, isTV } from '../theme';
import type { Playable } from '../types';

type Props = {
  onOpenMovie: (item: StreamioItem) => void;
  onOpenSeries: (item: StreamioItem) => void;
  embedded?: boolean;
  header?: ReactElement;
  refreshControl?: ReactElement<RefreshControlProps>;
  history?: Playable[];
  onPlay?: (item: Playable) => void;
};

const DEBOUNCE_MS = 700;
const MIN_SEARCH = 3;
// The same budget the tabs that scroll well use; stripping it cheaper leaves
// too little on screen and the list hitches as it rebuilds under the finger.
const LIST_PERF = {
  initialNumToRender: isTV ? 12 : 8,
  maxToRenderPerBatch: isTV ? 12 : 8,
  windowSize: 7,
  updateCellsBatchingPeriod: 60,
  // Android keeps drawn-but-off-screen views alive; letting go saves memory.
  removeClippedSubviews: Platform.OS === 'android',
};

export function StreamioBoxScreen({ onOpenMovie, onOpenSeries, embedded, header, refreshControl, history, onPlay }: Props) {
  const insets = useSafeAreaInsets();
  const [type, setType] = useState<StreamioType>('movie');
  const [catalogId, setCatalogId] = useState('top');
  const [genre, setGenre] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState('');
  const [browse, setBrowse] = useState<StreamioItem[] | null>(null);
  const [results, setResults] = useState<StreamioItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [minLoading, setMinLoading] = useState(true);
  const [exhausted, setExhausted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skip = useRef(0);
  const loadingMoreRef = useRef(false);
  const latest = useRef('');
  const searching = query.trim().length >= MIN_SEARCH;

  // First load: one page (50 titles), all of them shown straight away.
  const resetAndLoad = useCallback(async () => {
    setLoading(true);
    setMinLoading(true);
    setTimeout(() => setMinLoading(false), 2500);
    setError(null);
    setExhausted(false);
    skip.current = 0;
    try {
      const page = await loadCatalogPage(type, catalogId, 0, genre);
      setBrowse(page);
      skip.current = page.length;
    } catch {
      setError("Couldn't load the catalog.");
    } finally {
      setLoading(false);
    }
  }, [type, catalogId, genre]);

  useEffect(() => {
    if (searching) return;
    const t = setTimeout(() => resetAndLoad(), 0);
    return () => clearTimeout(t);
  }, [type, catalogId, genre, searching, resetAndLoad]);

  // Scrolling to the bottom asks for the next 50.
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || loadingMore || exhausted || searching || browse === null) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await loadCatalogPage(type, catalogId, skip.current, genre);
      if (page.length === 0) {
        setExhausted(true);
        return;
      }
      skip.current += page.length;
      setBrowse((current) => {
        const seen = new Set((current ?? []).map((m) => m.id));
        return [...(current ?? []), ...page.filter((m) => !seen.has(m.id))];
      });
    } catch {
      setError("Couldn't load more.");
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [browse, exhausted, loadingMore, searching, type, catalogId, genre]);

  useEffect(() => {
    const q = query.trim();
    latest.current = q;
    if (q.length < MIN_SEARCH) {
      const t = setTimeout(() => setResults(null), 0);
      return () => clearTimeout(t);
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      const found = await searchStreamio(type, q).catch(() => [] as StreamioItem[]);
      if (latest.current !== q) return;
      setResults(found);
      setLoading(false);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, type]);

  const { width } = useWindowDimensions();
  const columns = Math.max(1, Math.floor((width - GUTTER * 2) / (isTV ? 300 : 120)));
  const cardWidth = Math.max(120, Math.floor((width - GUTTER * 2) / columns));

  const movies = searching ? (results ?? []) : (browse ?? []);
  const isLoading = loading || minLoading;

  // Watch history: stream plays land here (including StreamioBox ones), so
  // they stay reachable from the tab where they were started.
  const watched = (history ?? []).filter((h) => h.kind === 'stream').slice(0, 12);

  const open = (item: StreamioItem) => {
    if (item.type === 'series') onOpenSeries(item);
    else onOpenMovie(item);
  };

  const heading = embedded ? (
    <SectionHeader title="StreamioBox" subtitle="Stremio-style catalogs: movies and series" style={styles.sectionHeader} />
  ) : (
    <View style={[styles.header, { paddingTop: insets.top + (isTV ? 20 : 10) }]}>
      <Text style={styles.heading}>StreamioBox</Text>
      <Text style={styles.subheading}>Stremio-style catalogs: movies and series.</Text>
    </View>
  );

  const typeToggle = (
    <View style={styles.toggleRow}>
      {(['movie', 'series'] as StreamioType[]).map((t) => (
        <Pressable
          key={t}
          onPress={() => setType(t)}
          style={[styles.toggle, type === t && styles.toggleOn]}
        >
          <Text style={[styles.toggleText, type === t && styles.toggleTextOn]}>
            {t === 'movie' ? 'Movies' : 'Series'}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  const catalogRow = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
      {CATALOGS.map((c) => (
        <Pressable
          key={c.id}
          onPress={() => {
            setCatalogId(c.id);
            if (c.id !== 'year') setGenre(undefined);
          }}
          style={[styles.chip, catalogId === c.id && styles.chipOn]}
        >
          <Text style={[styles.chipText, catalogId === c.id && styles.chipTextOn]}>{c.name}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );

  const genreRow = catalogId !== 'year' ? (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
      <Pressable onPress={() => setGenre(undefined)} style={[styles.chip, !genre && styles.chipOn]}>
        <Text style={[styles.chipText, !genre && styles.chipTextOn]}>All genres</Text>
      </Pressable>
      {GENRES.map((g) => (
        <Pressable key={g} onPress={() => setGenre(g)} style={[styles.chip, genre === g && styles.chipOn]}>
          <Text style={[styles.chipText, genre === g && styles.chipTextOn]}>{g}</Text>
        </Pressable>
      ))}
    </ScrollView>
  ) : (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
      {['2026', '2025', '2024', '2023', '2022', '2021', '2020'].map((y) => (
        <Pressable key={y} onPress={() => setGenre(y)} style={[styles.chip, genre === y && styles.chipOn]}>
          <Text style={[styles.chipText, genre === y && styles.chipTextOn]}>{y}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );

  const searchBox = (
    <View style={styles.inputWrap}>
      <Ionicons name="search" size={isTV ? 22 : 19} color={colors.muted} />
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search a title…"
        placeholderTextColor={colors.muted}
        autoCorrect={false}
        returnKeyType="search"
        style={styles.input}
      />
      {query.length > 0 && (
        <Ionicons name="close-circle" size={isTV ? 20 : 18} color={colors.faint} onPress={() => setQuery('')} />
      )}
    </View>
  );

  const loadingSpinner = (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 60 }}>
      <Loader size="large" label="Loading StreamioBox" icon="film-outline" />
    </View>
  );

  return (
    <View style={styles.screen}>
      <FlatList
        key={columns}
        data={movies}
        numColumns={columns}
        keyExtractor={(m) => m.id}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.grid}
        refreshControl={refreshControl}
        {...LIST_PERF}
        ListHeaderComponent={
          <View>
            {header}
            {heading}
            {watched.length > 0 && (
              <View style={{ marginTop: 8, marginBottom: 4 }}>
                <SectionHeader title="Watch again" subtitle="Movies you played recently" style={styles.sectionHeader} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {watched.map((item) => (
                    <Pressable
                      key={playableKey(item)}
                      onPress={() => onPlay?.(item)}
                      style={{ width: isTV ? 160 : 120, marginRight: 8 }}
                    >
                      <View style={styles.poster}>
                        {item.kind === 'stream' && item.poster ? (
                          <Image source={{ uri: item.poster }} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} />
                        ) : (
                          <View style={[StyleSheet.absoluteFill, styles.posterBlank]}>
                            <Text style={styles.posterBlankText} numberOfLines={3}>{item.title}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
            {typeToggle}
            {catalogRow}
            {genreRow}
            {searchBox}
            {error ? <Text style={styles.note}>{error}</Text> : null}
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.cell, { width: cardWidth }]}>
            <FocusCard onPress={() => open(item)} width={cardWidth - 8} style={styles.card}>
              <PosterCard item={item} />
            </FocusCard>
          </View>
        )}
        ListEmptyComponent={
          isLoading ? loadingSpinner : <Text style={styles.note}>{searching ? 'No results.' : 'Nothing here yet.'}</Text>
        }
        ListFooterComponent={
          searching ? null : loadingMore ? (
            <View style={{ alignItems: 'center', paddingVertical: 20 }}>
              <Loader label="Loading more" icon="film-outline" style={styles.spinner} />
            </View>
          ) : exhausted ? (
            <Text style={styles.endNote}>That's everything.</Text>
          ) : null
        }
        onEndReached={() => { if (!exhausted && !loadingMoreRef.current) loadMore(); }}
        onEndReachedThreshold={0.6}
      />
    </View>
  );
}

// Lives at module scope so the card type stays stable between renders — an
// inline component would remount every visible card whenever state changes.
function PosterCard({ item }: { item: StreamioItem }) {
  return (
    <View>
      <View style={styles.poster}>
        {item.poster ? (
          <Image source={{ uri: item.poster }} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.posterBlank]}>
            <Text style={styles.posterBlankText} numberOfLines={3}>{item.title}</Text>
          </View>
        )}
      </View>
      <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
      <Text style={styles.subtitle} numberOfLines={1}>
        {[item.year, item.genres?.[0]].filter(Boolean).join(' · ')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: GUTTER, paddingBottom: 6 },
  heading: { color: colors.text, fontSize: isTV ? 32 : 26, fontWeight: '900', letterSpacing: -0.3 },
  subheading: { color: colors.muted, fontSize: isTV ? 15 : 13, marginTop: 3 },
  sectionHeader: { paddingHorizontal: GUTTER, marginBottom: 10 },
  toggleRow: { flexDirection: 'row', gap: 8, paddingHorizontal: GUTTER, marginTop: 8, marginBottom: 4 },
  toggle: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  toggleOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  toggleText: { color: colors.muted, fontSize: isTV ? 16 : 14, fontWeight: '700' },
  toggleTextOn: { color: colors.accent },
  chipRow: { paddingHorizontal: GUTTER, paddingVertical: 6, gap: 8, flexDirection: 'row' },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  chipText: { color: colors.muted, fontSize: isTV ? 14 : 12, fontWeight: '600' },
  chipTextOn: { color: colors.accent },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: GUTTER, marginBottom: 6, paddingHorizontal: 16, borderRadius: 26, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  input: { flex: 1, color: colors.text, fontSize: isTV ? 22 : 16, paddingVertical: isTV ? 13 : 11 },
  note: { color: colors.muted, fontSize: isTV ? 15 : 13, marginHorizontal: GUTTER, marginTop: 10 },
  endNote: { color: colors.faint, fontSize: isTV ? 14 : 12, textAlign: 'center', paddingVertical: 18 },
  spinner: { marginTop: 24, marginBottom: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: GUTTER - 4, paddingTop: 4 },
  gridRow: { marginBottom: 4 },
  cell: { padding: 4, marginBottom: 8 },
  card: { marginRight: 0 },
  poster: { width: '100%', aspectRatio: 2 / 3, borderRadius: RADIUS, overflow: 'hidden', backgroundColor: colors.surface },
  posterBlank: { justifyContent: 'center', padding: 12 },
  posterBlankText: { color: colors.text, fontSize: isTV ? 17 : 14, fontWeight: '700' },
  title: { color: colors.text, fontSize: isTV ? 16 : 14, fontWeight: '700', marginTop: 7, paddingHorizontal: 2 },
  subtitle: { color: colors.muted, fontSize: isTV ? 13 : 12, marginTop: 2, paddingHorizontal: 2 },
});
