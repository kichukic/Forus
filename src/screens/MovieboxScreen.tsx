// The MovieBox tab: the films and series the MovieBoxTV app shows, and a
// search over the same catalogue. What is picked here is opened on its own
// screen, where it can be played or sent to the TorBox.
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
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
import {
  browseShelves,
  browseTabs,
  searchSubjects,
  type MovieboxShelf,
  type MovieboxSubject,
} from '../api/moviebox';
import { FocusCard } from '../components/FocusCard';
import { FocusRow } from '../components/FocusRow';
import {
  MovieboxPoster,
  POSTER_ROW_HEIGHT,
  POSTER_ROW_PROPS,
  POSTER_WIDTH,
} from '../components/MovieboxPoster';
import { Loader } from '../components/Loader';
import { SectionHeader } from '../components/Section';
import { GUTTER, colors, isTV, sz } from '../theme';

type Props = {
  onOpen: (subject: MovieboxSubject) => void;
  // Set when the screen sits inside a tab, where the app's own header is
  // already above it.
  embedded?: boolean;
  refreshControl?: ReactElement<RefreshControlProps>;
};

// Typing on a TV remote is slow, so a search runs once typing pauses.
const DEBOUNCE_MS = 700;
// Two letters are half a word, and a search on half a word finds nothing but
// noise, so the search waits for a word that could be meant.
const MIN_SEARCH = 3;
// The rows are let in a few at a time as the page is scrolled, the way the
// All tab lets its themed rows in. A section can hold twenty rows, and every
// row holds a shelf of posters.
const SHELVES_AT_START = 3;
const SHELVES_PER_STEP = 3;
// Only a few cards are built at a time. A phone with little memory cannot
// hold fifty posters at once.
const LIST_PERF = {
  initialNumToRender: isTV ? 12 : 8,
  maxToRenderPerBatch: isTV ? 12 : 8,
  windowSize: 7,
  updateCellsBatchingPeriod: 60,
  // Android keeps what it draws out of view; letting go of it saves memory.
  removeClippedSubviews: Platform.OS === 'android',
};
// The rows of films are one list, so only the ones near the screen are
// built. Every row that is built holds its own posters, so this is what
// keeps the page light.
const SHELF_PERF = {
  initialNumToRender: 2,
  maxToRenderPerBatch: 2,
  windowSize: 4,
  updateCellsBatchingPeriod: 60,
  removeClippedSubviews: Platform.OS === 'android' && !isTV,
};

export function MovieboxScreen({ onOpen, embedded, refreshControl }: Props) {
  const insets = useSafeAreaInsets();
  // The sections of the app: Trending, Movie, Anime, TV and the rest.
  const [tabs, setTabs] = useState<{ id: number; name: string }[]>([]);
  const [tab, setTab] = useState<number | null>(null);
  // The sections that answered with nothing. The service ships a few of them
  // (its Hindi section holds no films at all), and an empty chip is no use.
  const [emptyTabs, setEmptyTabs] = useState<number[]>([]);
  // The same lists, for the code that runs outside a render.
  const tabsRef = useRef<{ id: number; name: string }[]>([]);
  const emptyRef = useRef<number[]>([]);
  // The section that last had films in it, to come back to.
  const goodTabRef = useRef<number | null>(null);
  // The rows are kept with the section they came from, so the rows of the
  // section before are not on screen while the new ones are on their way.
  const [shelves, setShelves] = useState<{ tab: number; rows: MovieboxShelf[] } | null>(null);
  // The films a search matched, kept with the name they were found for.
  const [results, setResults] = useState<{ query: string; subjects: MovieboxSubject[] } | null>(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  // How many rows of the section in front have been let in.
  const [reveal, setReveal] = useState({ tab: -1, count: SHELVES_AT_START });
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef('');

  // A search of less than a few letters is not a search, so the browsed rows
  // stay on screen until there is something to replace them with.
  const name = query.trim();
  const searching = name.length >= MIN_SEARCH;
  // The rows of the section in front, and the films the search matched.
  const shelfRows = shelves && shelves.tab === tab ? shelves.rows : null;
  const searchRows = results && results.query === name ? results.subjects : null;
  const waiting = searching ? searchRows === null : shelfRows === null;

  useEffect(() => {
    let alive = true;
    browseTabs()
      .then((list) => {
        if (!alive || list.length === 0) return;
        tabsRef.current = list;
        setTabs(list);
        setTab(list[0].id);
      })
      .catch(() => alive && setError("Couldn't reach MovieBox. Check the internet connection."));
    return () => {
      alive = false;
    };
  }, []);

  // The rows of the section in front.
  useEffect(() => {
    if (tab === null || searching) return;
    let alive = true;
    browseShelves(tab)
      .then((rows) => {
        if (!alive) return;
        if (rows.length === 0) {
          const empties = emptyRef.current.includes(tab)
            ? emptyRef.current
            : [...emptyRef.current, tab];
          emptyRef.current = empties;
          setEmptyTabs(empties);
          // A blank section is no use, so the one that had films is kept.
          const good = goodTabRef.current;
          const next =
            good !== null && good !== tab
              ? good
              : tabsRef.current.find((entry) => !empties.includes(entry.id))?.id;
          if (next !== undefined && next !== tab) setTab(next);
          return;
        }
        goodTabRef.current = tab;
        setShelves({ tab, rows });
        setError(null);
      })
      .catch(() => {
        if (!alive) return;
        setError("Couldn't load the films. Check the internet connection.");
      });
    return () => {
      alive = false;
    };
  }, [tab, searching]);

  useEffect(() => {
    const q = name;
    latest.current = q;
    if (q.length < MIN_SEARCH) return;
    const timer = setTimeout(async () => {
      try {
        const found = await searchSubjects(q, 1);
        if (latest.current !== q) return;
        setResults({ query: q, subjects: found.subjects });
        setHasMore(found.hasMore);
        setPage(1);
        setError(null);
      } catch {
        if (latest.current !== q) return;
        setError("Couldn't search MovieBox. Check the internet connection.");
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [name]);

  // More results are fetched as the grid is scrolled to the end.
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !searching) return;
    setLoadingMore(true);
    try {
      const next = await searchSubjects(name, page + 1);
      setResults((current) => {
        const seen = new Set((current?.subjects ?? []).map((s) => s.id));
        return {
          query: name,
          subjects: [...(current?.subjects ?? []), ...next.subjects.filter((s) => !seen.has(s.id))],
        };
      });
      setHasMore(next.hasMore);
      setPage(next.nextPage);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, name, page, searching]);

  // The grid reflows when the phone rotates.
  const { width } = useWindowDimensions();
  const columns = Math.max(1, Math.floor((width - GUTTER * 2) / (isTV ? 240 : 150)));
  const cardWidth = Math.max(96, Math.floor((width - GUTTER * 2) / columns));

  const searchBox = (
    <View style={styles.inputWrap}>
      <Ionicons name="search" size={isTV ? 22 : 19} color={colors.muted} />
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search a film or a series…"
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

  const shownTabs = tabs.filter((entry) => !emptyTabs.includes(entry.id));

  // A section starts with a few rows, and the rest come as it is scrolled.
  if (reveal.tab !== (tab ?? -1)) setReveal({ tab: tab ?? -1, count: SHELVES_AT_START });
  const rows = shelfRows ?? [];
  const shownRows = rows.slice(0, reveal.count);
  const moreRows = reveal.count < rows.length;

  // The same measure the All tab uses: within a screen of the bottom.
  const growRows = ({ nativeEvent: e }: NativeSyntheticEvent<NativeScrollEvent>) => {
    const left = e.contentSize.height - (e.contentOffset.y + e.layoutMeasurement.height);
    if (left < e.layoutMeasurement.height) {
      setReveal((current) => ({
        ...current,
        count: Math.min(current.count + SHELVES_PER_STEP, rows.length),
      }));
    }
  };

  const tabsRow = shownTabs.length > 1 && (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.tabs}
    >
      {shownTabs.map((entry) => (
        <Pressable
          key={entry.id}
          onPress={() => setTab(entry.id)}
          style={({ focused, pressed }) => [
            styles.tab,
            tab === entry.id && styles.tabActive,
            (focused || pressed) && styles.tabFocused,
          ]}
        >
          <Text style={[styles.tabText, tab === entry.id && styles.tabTextActive]}>{entry.name}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );

  const heading = embedded ? (
    <SectionHeader
      title="MovieBox by Kishor"
      subtitle="Films and series, played here as they are"
      style={styles.sectionHeader}
    />
  ) : (
    <View style={[styles.header, { paddingTop: insets.top + (isTV ? 20 : 10) }]}>
      <Text style={styles.heading}>MovieBox by Kishor</Text>
      <Text style={styles.subheading}>Films and series, played here as they are.</Text>
    </View>
  );

  if (searching) {
    // A search is one grid of films and series.
    return (
      <View style={styles.screen}>
        <FlatList
          key={columns}
          data={searchRows ?? []}
          numColumns={columns}
          keyExtractor={(subject) => subject.id}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.grid}
          refreshControl={refreshControl}
          {...LIST_PERF}
          onEndReached={loadMore}
          onEndReachedThreshold={0.6}
          ListHeaderComponent={
            <View>
              {heading}
              {searchBox}
              {error ? <Text style={styles.note}>{error}</Text> : null}
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.cell, { width: cardWidth }]}>
              <FocusCard onPress={() => onOpen(item)} width={cardWidth - 8} style={styles.card}>
                <MovieboxPoster subject={item} />
              </FocusCard>
            </View>
          )}
          ListEmptyComponent={
            waiting ? (
              <ActivityIndicator color={colors.accent} style={styles.spinner} />
            ) : (
              <Text style={styles.note}>Nothing found for that name.</Text>
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

  return (
    <View style={styles.screen}>
      <FlatList
        data={shownRows}
        keyExtractor={(shelf) => shelf.title}
        contentContainerStyle={styles.content}
        refreshControl={refreshControl}
        {...SHELF_PERF}
        onScroll={growRows}
        scrollEventThrottle={200}
        ListHeaderComponent={
          <View>
            {heading}
            {searchBox}
            {tabsRow}
            {error ? <Text style={styles.note}>{error}</Text> : null}
            {searching && waiting ? (
              <View style={styles.searching}>
                <ActivityIndicator color={colors.accent} size="small" />
                <Text style={styles.searchingText}>Searching…</Text>
              </View>
            ) : null}
            {!searching && waiting ? (
              <ActivityIndicator color={colors.accent} style={styles.spinner} />
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <SectionHeader title={item.title} />
            <FocusRow>
              <FlatList
                horizontal
                data={item.subjects}
                keyExtractor={(subject) => subject.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.list}
                style={{ height: POSTER_ROW_HEIGHT }}
                {...POSTER_ROW_PROPS}
                renderItem={({ item: subject }) => (
                  <FocusCard onPress={() => onOpen(subject)} width={POSTER_WIDTH}>
                    <MovieboxPoster subject={subject} />
                  </FocusCard>
                )}
              />
            </FocusRow>
          </View>
        )}
        ListFooterComponent={
          moreRows ? <Loader label="More rows coming" icon="albums-outline" style={styles.moreRows} /> : null
        }
        ListEmptyComponent={
          !waiting ? <Text style={styles.note}>Nothing to show in this section right now.</Text> : null
        }
      />
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
  content: { paddingBottom: sz(110, 40) },
  moreRows: { marginVertical: 24, alignSelf: 'center' },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: GUTTER,
    marginBottom: 10,
    paddingHorizontal: 16,
    borderRadius: 26,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: { flex: 1, color: colors.text, fontSize: isTV ? 22 : 16, paddingVertical: isTV ? 13 : 11 },
  tabs: { gap: 8, paddingHorizontal: GUTTER, paddingBottom: 14 },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  tabActive: { backgroundColor: colors.accent },
  tabFocused: { borderColor: colors.text },
  tabText: { color: colors.muted, fontSize: isTV ? 16 : 13.5, fontWeight: '800' },
  tabTextActive: { color: '#fff' },
  row: { marginBottom: sz(22, 28) },
  list: { paddingHorizontal: GUTTER, paddingVertical: sz(2, 8) },
  note: { color: colors.muted, fontSize: isTV ? 15 : 13, marginHorizontal: GUTTER, marginTop: 10 },
  searching: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: GUTTER,
    marginTop: 10,
  },
  searchingText: { color: colors.muted, fontSize: isTV ? 15 : 13 },
  spinner: { marginTop: 24, marginBottom: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: GUTTER - 4, paddingTop: 4 },
  gridRow: { marginBottom: 4 },
  cell: { padding: 4, marginBottom: 8 },
  card: { marginRight: 0 },
});
