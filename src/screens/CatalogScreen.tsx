import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type RefreshControlProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadCatalog, loadCatalogPage, searchCatalog, type CatalogMovie } from '../api/catalog';
import { searchTorrents, type TorrentOption } from '../api/torrents';
import { FocusCard } from '../components/FocusCard';
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
const DEBOUNCE_MS = 600;
// How many releases a search shows before the films take over.
const MAX_RELEASES = 60;

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
  // A search of less than two letters is not a search, so the browsed list
  // stays on screen until there is something to replace it with.
  const searching = query.trim().length >= 2;

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
    if (q.length < 2) return;
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

  // The grid reflows when the phone rotates.
  const { width } = useWindowDimensions();
  const columns = Math.max(1, Math.floor((width - GUTTER * 2) / (isTV ? 300 : 230)));
  // The cards fill their column, so the grid never overflows.
  const cardWidth = Math.floor((width - GUTTER * 2) / columns);

  const movies = searching ? (results ?? []) : browse;

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
        data={movies ?? []}
        numColumns={columns}
        keyExtractor={(m) => m.id}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.grid}
        refreshControl={refreshControl}
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
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
