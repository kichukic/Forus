import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type RefreshControlProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadCatalog, loadCatalogPage, searchCatalog, type CatalogMovie } from '../api/catalog';
import { searchTorrents, type TorrentOption } from '../api/torrents';
import { FocusCard } from '../components/FocusCard';
import { Loader } from '../components/Loader';
import { SectionHeader } from '../components/Section';
import { GUTTER, RADIUS, colors, isTV } from '../theme';

type Props = {
  onOpen: (movie: CatalogMovie) => void;
  // Starts a release that was found by searching for its name.
  onSend: (option: TorrentOption) => void;
  // Set when the screen sits inside a tab, where the app's own header is
  // already above it.
  embedded?: boolean;
  // Content shown above the catalog, scrolled with it.
  header?: ReactElement;
  refreshControl?: ReactElement<RefreshControlProps>;
};

// Typing on a TV remote is slow, so a search runs once typing pauses.
const DEBOUNCE_MS = 700;
// Two letters are half a word, and a search on half a word finds nothing but
// noise, so the search waits for a word that could be meant.
const MIN_SEARCH = 3;
// How many releases a search shows before the films take over.
const MAX_RELEASES = 60;
// The catalog is let in a few at a time as the page is scrolled, the way the
// All tab lets its rows in. Each card holds a poster, and a phone with little
// memory feels every one of them.
const FILMS_AT_START = 12;
const FILMS_PER_STEP = 12;
// Only a few cards are built at a time. A phone with little memory cannot
// hold fifty posters at once, and the ones it does hold are the ones that
// crash it.
const LIST_PERF = {
  initialNumToRender: isTV ? 12 : 8,
  maxToRenderPerBatch: isTV ? 12 : 8,
  windowSize: 7,
  updateCellsBatchingPeriod: 60,
  // Android keeps what it draws out of view; letting go of it saves memory.
  removeClippedSubviews: Platform.OS === 'android',
};

export function CatalogScreen({ onOpen, onSend, embedded, header, refreshControl }: Props) {
  const insets = useSafeAreaInsets();
  // The browsed list, and the films a search matched.
  const [browse, setBrowse] = useState<CatalogMovie[] | null>(null);
  const [results, setResults] = useState<CatalogMovie[] | null>(null);
  // The releases a search found by name.
  const [releases, setReleases] = useState<TorrentOption[] | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef('');

  // How many films have been passed over, so the next page starts where the
  // last one ended.
  const skip = useRef(0);
  // A search of less than a few letters is not a search, so the browsed list
  // stays on screen until there is something to replace it with.
  const searching = query.trim().length >= MIN_SEARCH;

  useEffect(() => {
    let alive = true;
    loadCatalog()
      .then((list) => {
        if (!alive) return;
        setBrowse(list);
        skip.current = list.length;
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setError("Couldn't load the catalog. Check the internet connection.");
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // More films are fetched as the list is scrolled to the end.
  const loadMore = useCallback(async () => {
    if (loadingMore || exhausted || searching || browse === null) return;
    setLoadingMore(true);
    try {
      const page = await loadCatalogPage(skip.current);
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
      setError("Couldn't load more films. Check the internet connection.");
    } finally {
      setLoadingMore(false);
    }
  }, [browse, exhausted, loadingMore, searching]);

  useEffect(() => {
    const q = query.trim();
    latest.current = q;
    if (q.length < MIN_SEARCH) return;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      // Both at once: the releases are what people usually want, and the
      // films are what they recognise.
      const [found, foundReleases] = await Promise.all([
        searchCatalog(q).catch(() => [] as CatalogMovie[]),
        searchTorrents(q).catch(() => [] as TorrentOption[]),
      ]);
      if (latest.current !== q) return;
      setResults(found);
      setReleases(foundReleases);
      setLoading(false);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // The grid reflows when the phone rotates. The posters are small enough for
  // three to fit across a phone, so more of the catalog is seen at once.
  const { width } = useWindowDimensions();
  const columns = Math.max(1, Math.floor((width - GUTTER * 2) / (isTV ? 300 : 165)));
  // The cards fill their column, so the grid never overflows. A width that
  // comes out wrong (a split screen, a fold) must not reach the cards.
  const cardWidth = Math.max(120, Math.floor((width - GUTTER * 2) / columns));

  const movies = searching ? (results ?? []) : browse;

  // A list starts with a few cards, and the rest come as it is scrolled. A new
  // search or a new page of the catalog starts the count again.
  const listKey = searching ? `q:${query.trim().toLowerCase()}` : 'browse';
  const [reveal, setReveal] = useState({ key: listKey, count: FILMS_AT_START });
  if (reveal.key !== listKey) setReveal({ key: listKey, count: FILMS_AT_START });
  const shownMovies = movies ? movies.slice(0, reveal.count) : null;
  const moreFilms = (movies?.length ?? 0) > reveal.count;

  // The same measure the All tab uses: within a screen of the bottom.
  const growFilms = ({ nativeEvent: e }: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!movies) return;
    const left = e.contentSize.height - (e.contentOffset.y + e.layoutMeasurement.height);
    if (left < e.layoutMeasurement.height) {
      setReveal((current) =>
        current.count >= movies.length
          ? current
          : { ...current, count: Math.min(current.count + FILMS_PER_STEP, movies.length) },
      );
    }
  };

  const searchBox = (
    <View style={styles.inputWrap}>
      <Ionicons name="search" size={isTV ? 22 : 19} color={colors.muted} />
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search a film or a release…"
        placeholderTextColor={colors.muted}
        autoCorrect={false}
        returnKeyType="search"
        style={styles.input}
        hasTVPreferredFocus
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

  const heading = embedded ? (
    <SectionHeader
      title="Movie Catalog"
      subtitle="Anything you pick is sent to your TorBox and played here"
      style={styles.sectionHeader}
    />
  ) : (
    <View style={[styles.header, { paddingTop: insets.top + (isTV ? 20 : 10) }]}>
      <Text style={styles.heading}>Movie Catalog</Text>
      <Text style={styles.subheading}>Anything you pick is sent to your TorBox and played here.</Text>
    </View>
  );

  if (searching) {
    // A search is one list of releases, with the films they matched under it.
    return (
      <View style={styles.screen}>
        <FlatList
          data={(releases ?? []).slice(0, MAX_RELEASES)}
          keyExtractor={(r) => r.hash}
          contentContainerStyle={styles.list}
          refreshControl={refreshControl}
          {...LIST_PERF}
          ListHeaderComponent={
            <View>
              {header}
              {heading}
              {searchBox}
              {error ? <Text style={styles.note}>{error}</Text> : null}
              <Text style={styles.sectionTitle}>
                {releases === null
                  ? 'Looking for releases…'
                  : releases.length > 0
                    ? `Releases (${releases.length})`
                    : 'No releases found'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onSend(item)}
              style={({ focused, pressed }) => [
                styles.release,
                (focused || pressed) && styles.releaseActive,
              ]}
            >
              <View style={styles.releaseMain}>
                <Text style={styles.releaseName} numberOfLines={2}>
                  {item.name}
                </Text>
                <Text style={styles.releaseMeta}>
                  {[item.quality, item.size, item.seeders !== undefined ? `${item.seeders} seeds` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              {item.tracker ? <Text style={styles.tracker}>{item.tracker}</Text> : null}
              <Ionicons name="cloud-download-outline" size={20} color={colors.faint} />
            </Pressable>
          )}
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator color={colors.accent} style={styles.spinner} />
            ) : null
          }
          ListFooterComponent={
            <View>
              <Text style={styles.sectionTitle}>
                {movies && movies.length > 0 ? 'Films' : ''}
              </Text>
              {movies && movies.length > 0 ? (
                <View style={styles.grid}>
                  {movies.map((movie) => (
                    <View key={movie.id} style={[styles.cell, { width: cardWidth }]}>
                      <FocusCard onPress={() => onOpen(movie)} width={cardWidth - 8} style={styles.card}>
                        <PosterCard movie={movie} />
                      </FocusCard>
                    </View>
                  ))}
                </View>
              ) : loading ? (
                <ActivityIndicator color={colors.accent} style={styles.spinner} />
              ) : null}
            </View>
          }
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        key={columns}
        data={shownMovies ?? []}
        numColumns={columns}
        keyExtractor={(m) => m.id}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.grid}
        refreshControl={refreshControl}
        {...LIST_PERF}
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        onScroll={growFilms}
        scrollEventThrottle={200}
        ListHeaderComponent={
          <View>
            {header}
            {heading}
            {searchBox}
            {error ? <Text style={styles.note}>{error}</Text> : null}
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.cell, { width: cardWidth }]}>
            <FocusCard onPress={() => onOpen(item)} width={cardWidth - 8} style={styles.card}>
              <PosterCard movie={item} />
            </FocusCard>
          </View>
        )}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.accent} style={styles.spinner} />
          ) : (
            <Text style={styles.note}>The catalog is empty right now.</Text>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator color={colors.accent} style={styles.spinner} />
          ) : moreFilms ? (
            <Loader still label="More films coming" icon="film-outline" style={styles.moreFilms} />
          ) : null
        }
      />
    </View>
  );
}

// A film in the grid: its poster with the name and year underneath.
function PosterCard({ movie }: { movie: CatalogMovie }) {
  return (
    <View>
      <View style={styles.poster}>
        {movie.poster ? (
          <Image source={{ uri: movie.poster }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.posterBlank]}>
            <Text style={styles.posterBlankText} numberOfLines={3}>
              {movie.title}
            </Text>
          </View>
        )}
      </View>
      <Text style={styles.title} numberOfLines={1}>
        {movie.title}
      </Text>
      <Text style={styles.subtitle} numberOfLines={1}>
        {[movie.year, movie.genres?.[0]].filter(Boolean).join(' · ')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: GUTTER, paddingBottom: 6 },
  heading: { color: colors.text, fontSize: isTV ? 32 : 26, fontWeight: '900', letterSpacing: -0.3 },
  subheading: { color: colors.muted, fontSize: isTV ? 15 : 13, marginTop: 3 },
  // The heading's own gutter is cancelled by the one around it.
  sectionHeader: { paddingHorizontal: GUTTER, marginBottom: 10 },
  sectionTitle: {
    color: colors.text,
    fontSize: isTV ? 20 : 17,
    fontWeight: '800',
    marginTop: 14,
    marginBottom: 10,
  },
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
  spinner: { marginTop: 24, marginBottom: 24 },
  moreFilms: { marginVertical: 24, alignSelf: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: GUTTER - 4, paddingTop: 4 },
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
  posterBlank: { justifyContent: 'center', padding: 12 },
  posterBlankText: { color: colors.text, fontSize: isTV ? 17 : 14, fontWeight: '700' },
  title: {
    color: colors.text,
    fontSize: isTV ? 16 : 14,
    fontWeight: '700',
    marginTop: 7,
    paddingHorizontal: 2,
  },
  subtitle: { color: colors.muted, fontSize: isTV ? 13 : 12, marginTop: 2, paddingHorizontal: 2 },
  list: { paddingHorizontal: GUTTER, paddingBottom: 120 },
  release: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: isTV ? 14 : 11,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderRadius: RADIUS,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  releaseActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  releaseMain: { flex: 1 },
  releaseName: { color: colors.text, fontSize: isTV ? 16 : 14, fontWeight: '700' },
  releaseMeta: { color: colors.muted, fontSize: isTV ? 13 : 12, marginTop: 3 },
  tracker: { color: colors.faint, fontSize: isTV ? 12 : 11, maxWidth: 120 },
});
