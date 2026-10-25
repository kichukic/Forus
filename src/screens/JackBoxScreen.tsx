import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
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
  fetchMovieDbDetails,
  fetchMovieDbSearch,
  fetchMovieDbTrending,
  type MovieDbItem,
  type MovieDbType,
} from '../api/moviedbbox';
import type { CatalogMovie } from '../api/catalog';
import type { StreamioItem } from '../api/streamiobox';
import { FocusCard } from '../components/FocusCard';
import { Loader } from '../components/Loader';
import { SectionHeader } from '../components/Section';
import { shareOnLongPress } from '../chat/share';
import { showToast } from '../data/toasts';
import { GUTTER, RADIUS, colors, isTV } from '../theme';
import type { Playable } from '../types';

type Props = {
  embedded?: boolean;
  refreshControl?: ReactElement<RefreshControlProps>;
  onOpenMovie: (movie: CatalogMovie) => void;
  onOpenSeries: (item: StreamioItem) => void;
  onPlay?: (item: Playable) => void;
};

const DEBOUNCE_MS = 700;
const MIN_SEARCH = 3;

const LIST_PERF = {
  initialNumToRender: isTV ? 12 : 9,
  maxToRenderPerBatch: isTV ? 12 : 9,
  windowSize: 5,
  updateCellsBatchingPeriod: 50,
  removeClippedSubviews: Platform.OS === 'android',
};

export function JackBoxScreen({
  embedded,
  refreshControl,
  onOpenMovie,
  onOpenSeries,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [type, setType] = useState<MovieDbType>('movie');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<MovieDbItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<number | null>(null);

  const latest = useRef('');
  const searching = query.trim().length >= MIN_SEARCH;

  const columns = Math.max(1, Math.floor((width - GUTTER * 2) / (isTV ? 230 : 120)));
  const cardWidth = Math.max(120, Math.floor((width - GUTTER * 2) / columns));

  const loadTrending = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPage(1);
    setHasMore(true);
    try {
      const list = await fetchMovieDbTrending(type, 1);
      setItems(list);
      setHasMore(list.length >= 18);
    } catch {
      setError("Couldn't load JACKBOX. Check your network connection.");
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    if (searching) return;
    const t = setTimeout(() => loadTrending(), 0);
    return () => clearTimeout(t);
  }, [type, searching, loadTrending]);

  useEffect(() => {
    const q = query.trim();
    latest.current = q;
    if (q.length < MIN_SEARCH) {
      const t = setTimeout(() => setItems(null), 0);
      return () => clearTimeout(t);
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      setPage(1);
      setHasMore(true);
      const found = await fetchMovieDbSearch(q, 1).catch(() => [] as MovieDbItem[]);
      if (latest.current !== q) return;
      setItems(found);
      setHasMore(found.length >= 18);
      setLoading(false);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const q = query.trim();
      const found = searching
        ? await fetchMovieDbSearch(q, nextPage).catch(() => [] as MovieDbItem[])
        : await fetchMovieDbTrending(type, nextPage).catch(() => [] as MovieDbItem[]);
      if (!found.length) {
        setHasMore(false);
        return;
      }
      setItems((current) => {
        const seen = new Set((current ?? []).map((m) => m.id));
        const newItems = found.filter((m) => !seen.has(m.id));
        if (!newItems.length) {
          setHasMore(false);
          return current;
        }
        return [...(current ?? []), ...newItems];
      });
      setPage(nextPage);
      setHasMore(found.length >= 18);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, loading, page, query, searching, type]);

  const openItem = useCallback(
    async (item: MovieDbItem) => {
      if (resolvingId) return;
      setResolvingId(item.id);
      try {
        const details = await fetchMovieDbDetails(item).catch(() => null);
        const resolvedId = details?.imdbId || `jackbox:${item.id}`;

        if (item.mediaType === 'tv') {
          const series: StreamioItem = {
            id: resolvedId,
            type: 'series',
            title: item.title,
            year: item.year,
            poster: item.poster,
            background: item.backdrop,
            genres: details?.genres,
            description: details?.overview || item.overview,
          };
          onOpenSeries(series);
        } else {
          const movie: CatalogMovie = {
            id: resolvedId,
            title: item.title,
            year: item.year,
            poster: item.poster,
            background: item.backdrop,
            genres: details?.genres,
            description: details?.overview || item.overview,
            runtime: details?.runtime ? `${details.runtime} min` : undefined,
          };
          onOpenMovie(movie);
        }
      } catch {
        showToast({ text: "Couldn't load title details." });
      } finally {
        setResolvingId(null);
      }
    },
    [resolvingId, onOpenMovie, onOpenSeries],
  );

  const heading = embedded ? (
    <SectionHeader
      title="JACKBOX"
      subtitle="Movies and TV shows, powered by MovieDB"
      style={styles.sectionHeader}
    />
  ) : (
    <View style={[styles.header, { paddingTop: insets.top + (isTV ? 20 : 10) }]}>
      <Text style={styles.heading}>JACKBOX</Text>
      <Text style={styles.subheading}>Movies and TV shows, powered by MovieDB.</Text>
    </View>
  );

  const typeToggle = (
    <View style={styles.toggleRow}>
      {(['movie', 'tv'] as MovieDbType[]).map((t) => (
        <Pressable
          key={t}
          onPress={() => setType(t)}
          style={({ focused, pressed }) => [
            styles.toggle,
            type === t && styles.toggleOn,
            (focused || pressed) && styles.toggleFocused,
          ]}
        >
          <Text style={[styles.toggleText, type === t && styles.toggleTextOn]}>
            {t === 'movie' ? 'Movies' : 'TV Shows'}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  const searchBox = (
    <View style={styles.inputWrap}>
      <Ionicons name="search" size={isTV ? 22 : 19} color={colors.muted} />
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search JACKBOX…"
        placeholderTextColor={colors.muted}
        autoCorrect={false}
        returnKeyType="search"
        style={styles.input}
      />
      {query.length > 0 && (
        <Ionicons
          name="close-circle"
          size={isTV ? 20 : 18}
          color={colors.faint}
          onPress={() => setQuery('')}
        />
      )}
    </View>
  );

  const shown = items ?? [];

  return (
    <View style={styles.screen}>
      <FlatList
        key={columns}
        data={shown}
        numColumns={columns}
        keyExtractor={(m) => `${m.mediaType}-${m.id}`}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.grid}
        refreshControl={refreshControl}
        {...LIST_PERF}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          loadingMore ? (
            <View style={{ alignItems: 'center', paddingVertical: 20 }}>
              <Loader size="small" label="Loading more" icon="film-outline" />
            </View>
          ) : null
        }
        ListHeaderComponent={
          <View>
            {heading}
            {typeToggle}
            {searchBox}
            {error ? <Text style={styles.note}>{error}</Text> : null}
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.cell, { width: cardWidth }]}>
            <FocusCard
              onPress={() => openItem(item)}
              onLongPress={shareOnLongPress({
                kind: 'movie',
                id: String(item.id),
                title: item.title,
                poster: item.poster,
                year: item.year,
              })}
              width={cardWidth - 8}
              style={styles.card}
            >
              <PosterCard item={item} loading={resolvingId === item.id} />
            </FocusCard>
          </View>
        )}
        ListEmptyComponent={
          loading ? (
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 60 }}>
              <Loader size="large" label="Loading JACKBOX" icon="film-outline" />
            </View>
          ) : (
            <Text style={styles.note}>{searching ? 'No results.' : 'Nothing here yet.'}</Text>
          )
        }
      />
    </View>
  );
}

function PosterCard({ item, loading }: { item: MovieDbItem; loading?: boolean }) {
  const [failed, setFailed] = useState(false);
  const showBlank = !item.poster || failed;
  return (
    <View>
      <View style={styles.poster}>
        {showBlank ? (
          <View style={[StyleSheet.absoluteFill, styles.posterBlank]}>
            <Text style={styles.posterBlankText} numberOfLines={3}>
              {item.title}
            </Text>
          </View>
        ) : (
          <Image
            source={{ uri: item.poster }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
            onError={() => setFailed(true)}
          />
        )}
        {loading && (
          <View style={[StyleSheet.absoluteFill, styles.cardLoadingOverlay]}>
            <ActivityIndicator size="small" color={colors.accent} />
          </View>
        )}
      </View>
      <Text style={styles.title} numberOfLines={1}>
        {item.title}
      </Text>
      <Text style={styles.subtitle} numberOfLines={1}>
        {[item.year, item.rating ? `${item.rating}★` : null].filter(Boolean).join(' · ')}
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
  toggle: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  toggleFocused: { borderColor: colors.accent, transform: [{ scale: 1.05 }] },
  toggleText: { color: colors.muted, fontSize: isTV ? 16 : 14, fontWeight: '700' },
  toggleTextOn: { color: colors.accent },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: GUTTER,
    marginBottom: 6,
    paddingHorizontal: 16,
    borderRadius: 26,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: { flex: 1, color: colors.text, fontSize: isTV ? 22 : 16, paddingVertical: isTV ? 13 : 11 },
  note: { color: colors.muted, fontSize: isTV ? 15 : 13, marginHorizontal: GUTTER, marginTop: 10 },
  grid: { paddingHorizontal: GUTTER - 4, paddingTop: 4, paddingBottom: 80 },
  gridRow: { marginBottom: 4 },
  cell: { padding: 4, marginBottom: 8 },
  card: { marginRight: 0 },
  poster: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: RADIUS,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  cardLoadingOverlay: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterBlank: { justifyContent: 'center', padding: 12 },
  posterBlankText: { color: colors.text, fontSize: isTV ? 17 : 14, fontWeight: '700' },
  title: { color: colors.text, fontSize: isTV ? 16 : 14, fontWeight: '700', marginTop: 7, paddingHorizontal: 2 },
  subtitle: { color: colors.muted, fontSize: isTV ? 13 : 12, marginTop: 2, paddingHorizontal: 2 },
});
