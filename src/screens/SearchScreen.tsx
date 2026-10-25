import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatSize, getApiKey, listVideoFiles, type TorboxFile } from '../api/torbox';
import { searchSubjects, type MovieboxSubject } from '../api/moviebox';
import { searchTorrents, type TorrentOption } from '../api/torrents';
import { searchVideos, type SearchResult } from '../api/youtube';
import { aiVibeSearch, ChatError, type AiVibeResult } from '../chat/api';
import { FileCardContent } from '../components/FileCardContent';
import { VideoCardContent } from '../components/Cards';
import { FocusCard } from '../components/FocusCard';
import { shareOnLongPress } from '../chat/share';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { MovieboxPoster, POSTER_WIDTH } from '../components/MovieboxPoster';
import { ReleaseList } from '../components/ReleaseList';
import { cleanTitle } from '../components/VideoRow';
import { FULL_MOVIE, SCOPE_CHANNELS, type SearchScope } from '../data/channels';
import { CARD_GAP, GUTTER, colors, sz } from '../theme';
import type { Playable } from '../types';

type Props = {
  // The tab search was opened from; it only searches that tab's channels.
  scope: SearchScope;
  onPlay: (item: Playable) => void;
  // Opens a film from MovieBox, to play it there.
  onOpenMoviebox: (subject: MovieboxSubject) => void;
  // Sends a release to the TorBox, to be downloaded and played from there.
  onSendRelease: (option: TorrentOption) => void;
};

const SCOPE_TEXT: Record<SearchScope, { heading: string; placeholder: string; note: string; empty: string }> = {
  all: {
    heading: 'Search',
    placeholder: 'Search a film, a show, a release…',
    note: 'Everywhere the film can be found: MovieBox, the channels, your TorBox and the release indexes.',
    empty: 'Nothing found anywhere.',
  },
  movies: {
    heading: 'Search movies',
    placeholder: 'Search Malayalam movies…',
    note: 'Full movies from the official movie channels.',
    empty: 'No full movies found on the movie channels.',
  },
  shows: {
    heading: 'Search shows',
    placeholder: 'Search serials and shows…',
    note: 'Episodes from the official TV channels.',
    empty: 'Nothing found on the show channels.',
  },
  hindi: {
    heading: 'Search Hindi',
    placeholder: 'Search Hindi movies and dramas…',
    note: 'Hindi movies and dramas from the official channels.',
    empty: 'Nothing found on the Hindi channels.',
  },
  news: {
    heading: 'Search news',
    placeholder: 'Search the news channels…',
    note: 'Videos from the official news channels.',
    empty: 'Nothing found on the news channels.',
  },
  torbox: {
    heading: 'Search TorBox',
    placeholder: 'Search a film, a show, a release…',
    note: 'MovieBox, the channels, your TorBox and the release indexes.',
    empty: 'Nothing found anywhere.',
  },
};

const VIBE_SUGGESTIONS = [
  '🌧️ Rainy Noir Detective',
  '🚀 Gritty Space Survival',
  '🧠 Mind-bending Sci-Fi Plot Twist',
  '🛋️ Wholesome Cozy Comfort',
  '🩸 Intense Psychological Thriller',
  '🏎️ High Octane Adrenaline Heist',
  '🌌 Ethereal Cyberpunk Aesthetic',
  '🏰 Epic Medieval Dark Fantasy',
];

// Typing on a TV remote is slow, so a search runs once typing pauses.
const DEBOUNCE_MS = 700;
// Two letters are half a word, and a search on half a word finds nothing but
// noise, so the search waits for a word that could be meant.
const MIN_SEARCH = 3;
// How many releases a search shows. They are the best seeded first, and too
// many of them would push the other sources out of sight.
const MAX_RELEASES = 12;
// The width of a TorBox file card in a row.
const FILE_WIDTH = sz(200, 300);
// Result cards come in one after another, this far apart; past the first few
// they arrive together so a long list doesn't take ages.
const CASCADE_STEP_MS = 45;
const CASCADE_MAX = 8;

export function SearchScreen({ scope, onPlay, onOpenMoviebox, onSendRelease }: Props) {
  const text = SCOPE_TEXT[scope];
  const searchesTorbox = scope === 'all' || scope === 'torbox';
  // The main search looks everywhere the film can be found: the films
  // themselves, the releases to download, the channels and the TorBox.
  const searchesEverywhere = scope === 'all' || scope === 'torbox';
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [vibeMode, setVibeMode] = useState(false);
  const [aiResults, setAiResults] = useState<{ query: string; list: AiVibeResult[] } | null>(null);
  const [resolvingAi, setResolvingAi] = useState<string | null>(null);
  const [files, setFiles] = useState<{ query: string; list: TorboxFile[] } | null>(null);
  const [videos, setVideos] = useState<{ query: string; list: SearchResult[] } | null>(null);
  // The films and the releases the name matched.
  const [films, setFilms] = useState<{ query: string; list: MovieboxSubject[] } | null>(null);
  const [releases, setReleases] = useState<{ query: string; list: TorrentOption[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ query: string; message: string } | null>(null);
  const torboxFiles = useRef<TorboxFile[] | null>(null);
  const latest = useRef('');

  // TorBox files are matched locally, so the list is fetched once per visit.
  useEffect(() => {
    if (!searchesTorbox) return;
    getApiKey()
      .then((key) => (key ? listVideoFiles(key) : []))
      .then((files) => (torboxFiles.current = files))
      .catch(() => (torboxFiles.current = []));
  }, [searchesTorbox]);

  useEffect(() => {
    const q = query.trim();
    latest.current = q;
    if (q.length < MIN_SEARCH) return;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      if (vibeMode) {
        try {
          const results = await aiVibeSearch(q);
          if (latest.current !== q) return;
          setAiResults({ query: q, list: results });
        } catch (e) {
          if (latest.current === q) {
            // status 0 means the request never reached the server; anything
            // else is a server-side problem, so show what it actually said.
            const err = e as ChatError;
            setError({
              query: q,
              message: err.status
                ? `AI search failed: ${err.message}`
                : "Couldn't get AI recommendations. Check your connection.",
            });
          }
        } finally {
          if (latest.current === q) setLoading(false);
        }
        return;
      }

      try {
        const words = q.toLowerCase().split(/\s+/);
        const files = searchesTorbox
          ? (torboxFiles.current ?? []).filter((f) =>
              words.every((w) => f.name.toLowerCase().replace(/[._]/g, ' ').includes(w)),
            )
          : [];
        // Everything is asked for at once, so a name that is a film comes
        // back with every way of getting it, without waiting for each.
        const videosPromise =
          scope !== 'torbox'
            ? (async () => {
                // The film tabs only show complete films, not scenes and
                // trailers, so their searches ask YouTube for films and read a
                // few more pages.
                const filmsOnly = scope === 'movies' || scope === 'hindi';
                const asked =
                  !filmsOnly || /movie|film/i.test(q)
                    ? q
                    : `${q} ${scope === 'hindi' ? 'hindi ' : ''}full movie`;
                const found = await searchVideos(asked, SCOPE_CHANNELS[scope], filmsOnly ? 5 : undefined);
                return filmsOnly ? found.filter((v) => FULL_MOVIE.test(v.title)) : found;
              })()
            : Promise.resolve([] as SearchResult[]);
        const sourcesPromise: Promise<[MovieboxSubject[], TorrentOption[]]> = searchesEverywhere
          ? Promise.all([
              searchSubjects(q, 1).then((r) => r.subjects).catch(() => [] as MovieboxSubject[]),
              searchTorrents(q).catch(() => [] as TorrentOption[]),
            ])
          : Promise.resolve([[], []]);
        const [videos, [found, foundReleases]] = await Promise.all([videosPromise, sourcesPromise]);
        if (latest.current !== q) return;
        setFilms({ query: q, list: found });
        setReleases({ query: q, list: foundReleases });
        setFiles({ query: q, list: files });
        setVideos({ query: q, list: videos });
      } catch {
        if (latest.current === q) {
          setError({ query: q, message: "Couldn't search. Check the internet connection." });
        }
      } finally {
        if (latest.current === q) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, scope, searchesTorbox, searchesEverywhere, vibeMode]);

  const toggleVibeMode = () => {
    setVibeMode((prev) => {
      const next = !prev;
      if (next) {
        setFilms(null);
        setReleases(null);
        setFiles(null);
        setVideos(null);
      } else {
        setAiResults(null);
      }
      return next;
    });
  };

  const handleSelectAiResult = async (rec: AiVibeResult) => {
    setResolvingAi(rec.title);
    try {
      const res = await searchSubjects(rec.title, 1);
      if (res.subjects && res.subjects.length > 0) {
        onOpenMoviebox(res.subjects[0]);
      } else {
        setVibeMode(false);
        setQuery(rec.title);
      }
    } catch {
      setVibeMode(false);
      setQuery(rec.title);
    } finally {
      setResolvingAi(null);
    }
  };

  // Only what was found for the name in the box is shown.
  const fileList = files && files.query === query.trim() ? files.list : [];
  const videoList = videos && videos.query === query.trim() ? videos.list : [];
  const filmList = films && films.query === query.trim() ? films.list : [];
  const releaseList = releases && releases.query === query.trim() ? releases.list : [];
  const aiResultList =
    vibeMode && aiResults && aiResults.query === query.trim() && query.trim().length >= MIN_SEARCH
      ? aiResults.list
      : [];

  const playVideo = (video: SearchResult) => onPlay({ kind: 'video', videoId: video.id, title: video.title });

  const playFile = (file: TorboxFile) =>
    onPlay({ kind: 'file', source: file.source, itemId: file.itemId, fileId: file.fileId, title: file.name });

  // Opening: the screen fades in, the bar grows out from the right (where the
  // search button sits on the home screen) and the heading drops in above it.
  const enter = useMemo(() => new Animated.Value(0), []);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    Animated.spring(enter, { toValue: 1, useNativeDriver: true, speed: 11, bounciness: 6 }).start();
  }, []);
  const screenIn = enter.interpolate({ inputRange: [0, 0.4], outputRange: [0, 1], extrapolate: 'clamp' });
  const headingIn = {
    opacity: enter.interpolate({ inputRange: [0.2, 0.8], outputRange: [0, 1], extrapolate: 'clamp' }),
    transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }],
  };
  const barIn = {
    opacity: enter.interpolate({ inputRange: [0, 0.3], outputRange: [0, 1], extrapolate: 'clamp' }),
    transformOrigin: 'right center',
    transform: [{ scaleX: enter.interpolate({ inputRange: [0, 1], outputRange: [0.12, 1] }) }],
  };
  const iconIn = {
    transform: [{ rotate: enter.interpolate({ inputRange: [0, 1], outputRange: ['-90deg', '0deg'] }) }],
  };
  const noteIn = enter.interpolate({ inputRange: [0.6, 1], outputRange: [0, 1], extrapolate: 'clamp' });

  // The grid reflows when the phone rotates.
  const { width } = useWindowDimensions();
  const columns = Math.max(1, Math.floor((width - GUTTER * 2 + CARD_GAP) / ((sz(200, 230)) + CARD_GAP)));
  const cardWidth = (width - GUTTER * 2 - CARD_GAP * (columns - 1)) / columns;

  return (
    <Animated.View style={[styles.screen, { paddingTop: insets.top + GUTTER, opacity: screenIn }]}>
      <Animated.Text style={[styles.heading, headingIn]}>{text.heading}</Animated.Text>
      <Animated.View style={[styles.inputWrap, focused && styles.inputWrapFocused, barIn]}>
        <Animated.View style={iconIn}>
          <Ionicons
            name={vibeMode ? 'sparkles' : 'search'}
            size={sz(19, 22)}
            color={vibeMode ? colors.accent : focused ? colors.accent : colors.muted}
          />
        </Animated.View>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={vibeMode ? 'Describe a mood, plot, or vibe…' : text.placeholder}
          placeholderTextColor={colors.muted}
          autoFocus
          autoCorrect={false}
          returnKeyType="search"
          style={styles.input}
          hasTVPreferredFocus
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        <Pressable
          onPress={toggleVibeMode}
          style={({ pressed }) => [
            styles.vibePill,
            vibeMode && styles.vibePillActive,
            pressed && { opacity: 0.8 },
          ]}
        >
          <Ionicons
            name="sparkles"
            size={sz(13, 15)}
            color={vibeMode ? '#0c0a12' : colors.accent}
          />
          <Text style={[styles.vibePillText, vibeMode && styles.vibePillTextActive]}>
            AI Vibe
          </Text>
        </Pressable>
      </Animated.View>
      <Animated.Text style={[styles.note, { opacity: noteIn }]}>
        {vibeMode
          ? 'AI Mood Search powered by Gemini. Finds exact movie recommendations based on aesthetic, emotion, or story premise.'
          : text.note}
      </Animated.Text>

      {vibeMode && query.trim().length === 0 && (
        <View style={styles.vibeSuggestions}>
          <Text style={styles.vibeSuggestionsTitle}>Try these moods & vibes:</Text>
          <View style={styles.vibeChipsWrap}>
            {VIBE_SUGGESTIONS.map((s) => (
              <Pressable
                key={s}
                onPress={() => setQuery(s.replace(/^[^\s]+\s*/, ''))}
                style={({ pressed }) => [styles.vibeChip, pressed && { opacity: 0.75 }]}
              >
                <Text style={styles.vibeChipText}>{s}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {loading && (
        <SkeletonLoader
          columns={columns}
          cardWidth={cardWidth}
          label={
            vibeMode
              ? 'Asking Gemini for recommendations…'
              : scope === 'torbox'
              ? 'Searching your TorBox'
              : 'Searching the channels'
          }
          style={styles.loader}
        />
      )}
      {error && error.query === query.trim() && <Text style={styles.note}>{error.message}</Text>}

      {vibeMode && aiResultList.length > 0 && (
        <ScrollView contentContainerStyle={styles.aiScroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.blockTitle}>Recommended for &ldquo;{aiResults?.query}&rdquo;</Text>
          {aiResultList.map((rec, i) => (
            <Pressable
              key={`${rec.title}-${rec.year ?? i}`}
              onPress={() => handleSelectAiResult(rec)}
              style={({ pressed }) => [
                styles.aiCard,
                pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
              ]}
            >
              <View style={styles.aiCardHeader}>
                <View style={styles.aiTitleWrap}>
                  <Text style={styles.aiCardTitle}>{rec.title}</Text>
                  {rec.year ? <Text style={styles.aiCardYear}>({rec.year})</Text> : null}
                </View>
                <View style={styles.aiActionBadge}>
                  <Ionicons
                    name={resolvingAi === rec.title ? 'hourglass' : 'play-circle'}
                    size={sz(15, 17)}
                    color={colors.accent}
                  />
                  <Text style={styles.aiActionText}>
                    {resolvingAi === rec.title ? 'Opening…' : 'Watch'}
                  </Text>
                </View>
              </View>
              {rec.reason ? <Text style={styles.aiCardReason}>{rec.reason}</Text> : null}
            </Pressable>
          ))}
        </ScrollView>
      )}

      {vibeMode && !loading && query.trim().length >= MIN_SEARCH && aiResultList.length === 0 && !error && (
        <Text style={styles.note}>No recommendations found for that vibe. Try phrasing differently.</Text>
      )}

      {!vibeMode &&
        filmList.length === 0 &&
        releaseList.length === 0 &&
        fileList.length === 0 &&
        videoList.length === 0 &&
        !loading &&
        query.trim().length >= MIN_SEARCH && <Text style={styles.note}>{text.empty}</Text>}

      {!vibeMode &&
        (videoList.length > 0 ||
          filmList.length > 0 ||
          releaseList.length > 0 ||
          fileList.length > 0) && (
        <FlatList
          key={columns}
          data={videoList}
          numColumns={columns}
          keyExtractor={(video) => `yt:${video.id}`}
          contentContainerStyle={styles.grid}
          ListHeaderComponent={
            searchesEverywhere ? (
              <View>
                {/* The films themselves: they play from here, with no download. */}
                {filmList.length > 0 && (
                  <View style={styles.block}>
                    <Text style={styles.blockTitle}>From MovieBox</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.films}
                    >
                      {filmList.map((film) => (
                        <FocusCard
                          key={film.id}
                          onPress={() => onOpenMoviebox(film)}
                          onLongPress={shareOnLongPress({
                            kind: 'moviebox',
                            subjectId: film.id,
                            title: film.title,
                            poster: film.poster,
                          })}
                          width={POSTER_WIDTH}
                        >
                          <MovieboxPoster subject={film} />
                        </FocusCard>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* The releases: they are downloaded to the TorBox and played from there. */}
                {releaseList.length > 0 && (
                  <View style={styles.block}>
                    <Text style={styles.blockTitle}>
                      Releases to send to your TorBox
                      {releaseList.length > MAX_RELEASES ? ` (best ${MAX_RELEASES} of ${releaseList.length})` : ''}
                    </Text>
                    <ReleaseList releases={releaseList.slice(0, MAX_RELEASES)} onSend={onSendRelease} />
                  </View>
                )}

                {/* The files that are already in the TorBox. */}
                {fileList.length > 0 && (
                  <View style={styles.block}>
                    <Text style={styles.blockTitle}>In your TorBox</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.films}
                    >
                      {fileList.map((file) => (
                        <FocusCard
                          key={`${file.source}:${file.itemId}:${file.fileId}`}
                          onPress={() => playFile(file)}
                          onLongPress={shareOnLongPress({
                            kind: 'file',
                            source: file.source,
                            itemId: file.itemId,
                            fileId: file.fileId,
                            title: file.name,
                          })}
                          width={FILE_WIDTH}
                        >
                          <FileCardContent
                            fileName={file.name}
                            detail={`TorBox · ${formatSize(file.size)}`}
                          />
                        </FocusCard>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* The channels come last: they have the fewest films. */}
                <View style={styles.block}>
                  <Text style={styles.blockTitle}>From the channels</Text>
                  {videoList.length === 0 ? (
                    <Text style={styles.note}>
                      The official channels have nothing by that name.
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null
          }
          renderItem={({ item, index }) => (
            <CascadeIn index={index}>
              <View style={styles.cell}>
                <FocusCard
                  width={cardWidth}
                  onPress={() => playVideo(item)}
                  onLongPress={shareOnLongPress(item.id, item.title)}
                  style={{ marginRight: (index + 1) % columns === 0 ? 0 : CARD_GAP }}
                >
                  <VideoCardContent
                    image={item.thumbnail}
                    title={cleanTitle(item.title)}
                    subtitle={[item.channel, item.published].filter(Boolean).join(' · ')}
                    duration={item.duration}
                    live={item.live}
                  />
                </FocusCard>
              </View>
            </CascadeIn>
          )}
        />
      )}
    </Animated.View>
  );
}

// A result card that fades up into place, a moment after the one before it.
function CascadeIn({ index, children }: { index: number; children: ReactNode }) {
  const progress = useMemo(() => new Animated.Value(0), []);
  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 320,
      delay: Math.min(index, CASCADE_MAX) * CASCADE_STEP_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, []);
  return (
    <Animated.View
      style={{
        opacity: progress,
        transform: [
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
          { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  heading: { color: colors.text, fontSize: sz(26, 32), fontWeight: '900', marginHorizontal: GUTTER, marginBottom: 14 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: GUTTER,
    paddingHorizontal: 16,
    borderRadius: 26,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputWrapFocused: { borderColor: colors.accent, backgroundColor: colors.surfaceRaised },
  input: { flex: 1, color: colors.text, fontSize: sz(16, 22), paddingVertical: sz(12, 14) },
  note: { color: colors.muted, fontSize: sz(13, 15), marginHorizontal: GUTTER, marginTop: 8 },
  loader: { paddingTop: 18 },
  spinner: { marginTop: 24 },
  grid: { paddingHorizontal: GUTTER, paddingTop: 18, paddingBottom: 120 },
  cell: { marginBottom: 18 },
  block: { marginBottom: 22 },
  blockTitle: {
    color: colors.text,
    fontSize: sz(17, 21),
    fontWeight: '800',
    marginBottom: 10,
  },
  films: { gap: CARD_GAP, paddingRight: GUTTER },
  vibePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: sz(10, 14),
    paddingVertical: sz(6, 8),
    borderRadius: 16,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  vibePillActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  vibePillText: {
    color: colors.accent,
    fontSize: sz(12, 14),
    fontWeight: '800',
  },
  vibePillTextActive: {
    color: '#0c0a12',
  },
  vibeSuggestions: {
    marginTop: 18,
    marginHorizontal: GUTTER,
  },
  vibeSuggestionsTitle: {
    color: colors.muted,
    fontSize: sz(13, 15),
    fontWeight: '700',
    marginBottom: 10,
  },
  vibeChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  vibeChip: {
    backgroundColor: colors.surface,
    paddingHorizontal: sz(12, 14),
    paddingVertical: sz(8, 10),
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  vibeChipText: {
    color: colors.text,
    fontSize: sz(13, 15),
    fontWeight: '600',
  },
  aiScroll: {
    paddingHorizontal: GUTTER,
    paddingTop: 18,
    paddingBottom: 120,
    gap: 12,
  },
  aiCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: sz(14, 18),
    gap: 8,
  },
  aiCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  aiTitleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    flexWrap: 'wrap',
  },
  aiCardTitle: {
    color: colors.text,
    fontSize: sz(16, 20),
    fontWeight: '800',
  },
  aiCardYear: {
    color: colors.muted,
    fontSize: sz(13, 16),
    fontWeight: '600',
  },
  aiActionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: sz(10, 14),
    paddingVertical: sz(5, 7),
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  aiActionText: {
    color: colors.accent,
    fontSize: sz(12, 14),
    fontWeight: '700',
  },
  aiCardReason: {
    color: colors.muted,
    fontSize: sz(13, 15),
    lineHeight: sz(18, 22),
  },
});
