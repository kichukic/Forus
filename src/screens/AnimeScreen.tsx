// The Anime tab: MovieBox's anime section with its own hero, genre filters
// and a search that stays inside anime. Everything it finds opens in the
// normal MovieBox detail screen, so downloads, dubs and playback work as usual.
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
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
import {
  ANIME_TAB_ID,
  browseShelves,
  searchSubjects,
  type MovieboxShelf,
  type MovieboxSubject,
} from '../api/moviebox';
import { FocusCard } from '../components/FocusCard';
import { FocusRow } from '../components/FocusRow';
import { MovieboxHero } from '../components/MovieboxHero';
import {
  MovieboxPoster,
  POSTER_ROW_HEIGHT,
  POSTER_ROW_PROPS,
  POSTER_WIDTH,
} from '../components/MovieboxPoster';
import { Loader } from '../components/Loader';
import { SectionHeader } from '../components/Section';
import { shareOnLongPress } from '../chat/share';
import { GUTTER, colors, isTV, sz } from '../theme';

type Props = {
  onOpen: (subject: MovieboxSubject) => void;
  refreshControl?: ReactElement<RefreshControlProps>;
};

// Typing on a TV remote is slow, so a search runs once typing pauses.
const DEBOUNCE_MS = 700;
const MIN_SEARCH = 3;

// The rows are let in a few at a time, like the other catalogue tabs.
const SHELVES_AT_START = 3;
const SHELVES_PER_STEP = 3;

const SHELF_PERF = {
  initialNumToRender: 2,
  maxToRenderPerBatch: 2,
  windowSize: 4,
  updateCellsBatchingPeriod: 60,
  removeClippedSubviews: Platform.OS === 'android' && !isTV,
};

// The filters the shelves can answer. "Movies" and "Series" use the subject
// kind; the rest match the genres MovieBox puts on each title.
const FILTERS = [
  'All',
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Fantasy',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Supernatural',
  'Movies',
  'Series',
] as const;
type Filter = (typeof FILTERS)[number];

function matchesFilter(subject: MovieboxSubject, filter: Filter): boolean {
  if (filter === 'All') return true;
  if (filter === 'Movies') return subject.kind === 'movie';
  if (filter === 'Series') return subject.kind === 'series';
  const genre = (subject.genre ?? '').toLowerCase();
  if (filter === 'Sci-Fi') return genre.includes('sci-fi') || genre.includes('science fiction');
  if (filter === 'Slice of Life') return genre.includes('slice of life') || genre.includes('slice-of-life');
  return genre.includes(filter.toLowerCase());
}

// A search result belongs on this tab when it is one of the anime titles we
// already know, or when MovieBox labels it as animation.
function looksAnime(subject: MovieboxSubject, known: Set<string>): boolean {
  return known.has(subject.id) || /animation|anime/i.test(subject.genre ?? '');
}

export function AnimeScreen({ onOpen, refreshControl }: Props) {
  const [shelves, setShelves] = useState<MovieboxShelf[] | null>(null);
  const [filter, setFilter] = useState<Filter>('All');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ query: string; subjects: MovieboxSubject[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // How many rows of the current filter are on screen.
  const [reveal, setReveal] = useState(SHELVES_AT_START);
  const [revealFor, setRevealFor] = useState<Filter>('All');
  const latest = useRef('');

  useEffect(() => {
    let alive = true;
    browseShelves(ANIME_TAB_ID)
      .then((rows) => {
        if (!alive) return;
        setShelves(rows);
        setError(rows.length === 0 ? 'The anime section is empty right now.' : null);
      })
      .catch(() => {
        if (!alive) return;
        setShelves([]);
        setError("Couldn't load anime. Check the internet connection.");
      });
    return () => {
      alive = false;
    };
  }, []);

  const name = query.trim();
  const searching = name.length >= MIN_SEARCH;

  useEffect(() => {
    latest.current = name;
    if (name.length < MIN_SEARCH) return;
    const timer = setTimeout(async () => {
      try {
        const found = await searchSubjects(name, 1);
        if (latest.current !== name) return;
        setResults({ query: name, subjects: found.subjects });
        setError(null);
      } catch {
        if (latest.current !== name) return;
        setError("Couldn't search MovieBox. Check the internet connection.");
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [name]);

  // Every title the anime shelves know, so search can tell anime from the rest.
  const known = useMemo(
    () => new Set((shelves ?? []).flatMap((shelf) => shelf.subjects.map((subject) => subject.id))),
    [shelves],
  );

  const searchRows =
    results && results.query === name
      ? results.subjects.filter((subject) => known.size === 0 || looksAnime(subject, known))
      : null;

  const filteredRows = useMemo(
    () =>
      (shelves ?? [])
        .map((shelf) => ({ ...shelf, subjects: shelf.subjects.filter((subject) => matchesFilter(subject, filter)) }))
        .filter((shelf) => shelf.subjects.length > 0),
    [filter, shelves],
  );

  // A new filter starts from the first few rows again.
  if (revealFor !== filter) {
    setRevealFor(filter);
    setReveal(SHELVES_AT_START);
  }

  const { width } = useWindowDimensions();
  const columns = isTV
    ? Math.min(10, Math.max(6, Math.floor((width - GUTTER * 2) / 128)))
    : Math.max(3, Math.floor((width - GUTTER * 2) / 124));
  const cardWidth = Math.floor((width - GUTTER * 2) / columns);

  // The same measure the other tabs use: within a screen of the bottom.
  const growRows = ({ nativeEvent: event }: NativeSyntheticEvent<NativeScrollEvent>) => {
    const left = event.contentSize.height - (event.contentOffset.y + event.layoutMeasurement.height);
    if (left < event.layoutMeasurement.height) {
      setReveal((count) =>
        count >= filteredRows.length ? count : Math.min(count + SHELVES_PER_STEP, filteredRows.length),
      );
    }
  };

  const heading = (
    <View>
      <SectionHeader
        title="Anime"
        subtitle="Series and films from MovieBox, with dubs where available"
        style={styles.sectionHeader}
      />
      {!searching && (
        <MovieboxHero
          sectionId={ANIME_TAB_ID}
          prefer="series"
          onOpen={onOpen}
        />
      )}
      <View style={styles.inputWrap}>
        <Ionicons name="search" size={isTV ? 22 : 19} color={colors.muted} />
        <TextInput
          value={query}
          onChangeText={(value) => {
            setQuery(value);
            // A name too short to search leaves the shelves in front again.
            if (value.trim().length < MIN_SEARCH) setResults(null);
          }}
          placeholder="Search anime…"
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
            onPress={() => {
              setQuery('');
              setResults(null);
            }}
          />
        )}
      </View>
      {!searching && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {FILTERS.map((entry) => (
            <Pressable
              key={entry}
              onPress={() => setFilter(entry)}
              style={({ focused, pressed }) => [
                styles.chip,
                filter === entry && styles.chipActive,
                (focused || pressed) && styles.chipFocused,
              ]}
            >
              <Text style={[styles.chipText, filter === entry && styles.chipTextActive]}>{entry}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      {error ? <Text style={styles.note}>{error}</Text> : null}
    </View>
  );

  if (searching) {
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
          ListHeaderComponent={heading}
          renderItem={({ item }) => (
            <View style={[styles.cell, { width: cardWidth }]}>
              <FocusCard
                onPress={() => onOpen(item)}
                onLongPress={shareOnLongPress({
                  kind: 'moviebox',
                  subjectId: item.id,
                  title: item.title,
                  poster: item.poster,
                })}
                width={cardWidth - 8}
                style={styles.card}
              >
                <MovieboxPoster subject={item} />
              </FocusCard>
            </View>
          )}
          ListEmptyComponent={
            searchRows === null ? (
              <View style={styles.searching}>
                <ActivityIndicator color={colors.accent} size="small" />
                <Text style={styles.searchingText}>Searching…</Text>
              </View>
            ) : (
              <Text style={styles.note}>No anime found for that name.</Text>
            )
          }
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={filteredRows.slice(0, reveal)}
        keyExtractor={(shelf) => shelf.title}
        contentContainerStyle={styles.content}
        refreshControl={refreshControl}
        {...SHELF_PERF}
        onScroll={growRows}
        scrollEventThrottle={200}
        ListHeaderComponent={
          <View>
            {heading}
            {shelves === null ? <ActivityIndicator color={colors.accent} style={styles.spinner} /> : null}
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
                  <FocusCard
                    onPress={() => onOpen(subject)}
                    onLongPress={shareOnLongPress({
                      kind: 'moviebox',
                      subjectId: subject.id,
                      title: subject.title,
                      poster: subject.poster,
                    })}
                    width={POSTER_WIDTH}
                  >
                    <MovieboxPoster subject={subject} />
                  </FocusCard>
                )}
              />
            </FocusRow>
          </View>
        )}
        ListFooterComponent={
          reveal < filteredRows.length ? (
            <Loader label="More rows coming" icon="albums-outline" style={styles.moreRows} />
          ) : null
        }
        ListEmptyComponent={
          shelves !== null ? <Text style={styles.note}>Nothing in this filter right now.</Text> : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  sectionHeader: { paddingHorizontal: GUTTER, marginBottom: 10 },
  content: { paddingBottom: sz(110, 40) },
  moreRows: { marginVertical: 24, alignSelf: 'center' },
  filterRow: { gap: 8, paddingHorizontal: GUTTER, paddingBottom: 10, paddingRight: GUTTER },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  chipActive: { backgroundColor: colors.accent },
  chipFocused: { borderColor: colors.text },
  chipText: { color: colors.muted, fontSize: isTV ? 13 : 11.5, fontWeight: '800' },
  chipTextActive: { color: '#fff' },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: GUTTER,
    marginBottom: 12,
    paddingHorizontal: 16,
    borderRadius: 26,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: { flex: 1, color: colors.text, fontSize: isTV ? 22 : 16, paddingVertical: isTV ? 13 : 11 },
  row: { marginBottom: sz(22, 28) },
  list: { paddingHorizontal: GUTTER, paddingVertical: sz(2, 8) },
  note: { color: colors.muted, fontSize: isTV ? 15 : 13, marginHorizontal: GUTTER, marginTop: 10 },
  searching: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: GUTTER, marginTop: 10 },
  searchingText: { color: colors.muted, fontSize: isTV ? 15 : 13 },
  spinner: { marginTop: 24, marginBottom: 24 },
  grid: { paddingHorizontal: GUTTER - 4, paddingTop: 4, paddingBottom: sz(110, 40) },
  gridRow: { marginBottom: 4 },
  cell: { padding: 4, marginBottom: 8 },
  card: { marginRight: 0 },
});
