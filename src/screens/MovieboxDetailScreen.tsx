// A film or series from MovieBox: what it is, what the episodes are, and the
// two ways to watch it — here as a stream, or through the TorBox as a file.
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  playableRows,
  searchSubjects,
  seasonEpisodes,
  seasonList,
  subjectDetails,
  type MovieboxDub,
  type MovieboxEpisode,
  type MovieboxSeason,
  type MovieboxSubject,
} from '../api/moviebox';
import { searchTorrents, type TorrentOption } from '../api/torrents';
import { shareMoviebox } from '../chat/share';
import { ReleaseList } from '../components/ReleaseList';
import { GUTTER, RADIUS, SCRIM, colors, isTV } from '../theme';
import type { Playable } from '../types';

type Props = {
  subject: MovieboxSubject;
  onClose: () => void;
  // Plays the film or an episode of it.
  onPlay: (item: Playable) => void;
  // Sends a release found by name to the TorBox.
  onSendRelease: (option: TorrentOption) => void;
};

// The name without the language and quality tags, which the indexes do not
// know about.
function plainTitle(title: string): string {
  return title
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// "Hindi dub" reads as "Hindi"; "Original Audio" as "Original".
function dubLabel(dub: MovieboxDub): string {
  return dub.original ? 'Original' : dub.name.replace(/\s*dub$/i, '');
}

export function MovieboxDetailScreen({ subject, onClose, onPlay, onSendRelease }: Props) {
  const insets = useSafeAreaInsets();
  const [details, setDetails] = useState<MovieboxSubject | null>(null);
  const [cast, setCast] = useState<{ name: string; character: string }[]>([]);
  const [seasons, setSeasons] = useState<MovieboxSeason[] | null>(null);
  const [season, setSeason] = useState(1);
  const [episodes, setEpisodes] = useState<{ season: number; list: MovieboxEpisode[] } | null>(null);
  const [releases, setReleases] = useState<TorrentOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  // The language version in front. A film dubbed into Hindi is a subject of
  // its own, so changing the audio means changing the film.
  const [currentId, setCurrentId] = useState(subject.id);
  const [switching, setSwitching] = useState(false);

  // Whether it has episodes is asked of the service, not guessed from the
  // type: a short drama and a long series are counted apart there. Until the
  // answer comes, nothing is offered, so a series is never mistaken for a
  // film.
  const isSeries = (seasons?.length ?? 0) > 0;
  const hasSeasons = seasons !== null;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const found = await subjectDetails(currentId);
        if (!alive) return;
        setDetails(found.subject);
        setCast(found.cast.slice(0, 12));
      } catch {
        if (alive) setError("Couldn't load the details. Check the internet connection.");
      } finally {
        if (alive) setSwitching(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [currentId]);

  // The seasons it has. A film has none, and is played as a whole.
  useEffect(() => {
    let alive = true;
    seasonList(currentId)
      .then((list) => {
        if (!alive) return;
        setSeasons(list);
        if (list.length > 0) setSeason(list[0].season);
      })
      .catch(() => {
        if (!alive) return;
        // A film that answers with nothing is still a film.
        setSeasons([]);
        setError("Couldn't load the seasons.");
      });
    return () => {
      alive = false;
    };
  }, [currentId]);

  // The episodes of the season in front. They are kept with the season they
  // came from, so the episodes of the season before are not on screen while
  // the new ones are on their way.
  useEffect(() => {
    if (!isSeries) return;
    let alive = true;
    const current = seasons?.find((s) => s.season === season);
    if (!current) return;
    seasonEpisodes(currentId, season, current.episodes)
      .then((list) => alive && setEpisodes({ season, list }))
      .catch(() => alive && setError("Couldn't load the episodes."));
    return () => {
      alive = false;
    };
  }, [isSeries, season, seasons, currentId]);

  // The releases the film's name has on the torrent indexes.
  useEffect(() => {
    const name = plainTitle(subject.title);
    if (name.length < 2) return;
    let alive = true;
    searchTorrents(name)
      .then((list) => alive && setReleases(list))
      .catch(() => alive && setReleases([]));
    return () => {
      alive = false;
    };
  }, [subject.title]);

  // A film is played as a whole, so its file is found first. The player does
  // the same thing again, but doing it here means a film that cannot be
  // played says so before the player opens.
  const playFilm = async () => {
    setPreparing(true);
    setError(null);
    try {
      const rows = await playableRows(currentId, 0, 0);
      if (rows.length === 0) throw new Error('This film has no file to play.');
      onPlay({
        kind: 'moviebox',
        subjectId: currentId,
        season: 0,
        episode: 0,
        title: details?.title ?? subject.title,
        poster: details?.poster ?? subject.poster,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "This film can't be played.");
    } finally {
      setPreparing(false);
    }
  };

  const playEpisode = (episode: MovieboxEpisode) => {
    onPlay({
      kind: 'moviebox',
      subjectId: currentId,
      season: episode.season,
      episode: episode.episode,
      title: `${details?.title ?? subject.title} · Episode ${episode.episode}`,
      poster: details?.poster ?? subject.poster,
    });
  };

  // The language versions of this film, as the service lists them.
  const dubs = details?.dubs ?? [];

  // A film opened as its own entry carries no list of versions, but the same
  // film is on the service as "[Hindi]" too. It is looked up when asked for.
  const [hindiLookup, setHindiLookup] = useState<'idle' | 'busy' | 'none'>('idle');
  // Nothing to look up when the film is already the Hindi one.
  const alreadyHindi = /\[hindi\]/i.test(details?.title ?? subject.title);

  const findHindi = async () => {
    const base = plainTitle(details?.title ?? subject.title);
    if (base.length < 2) return;
    setHindiLookup('busy');
    try {
      const found = await searchSubjects(`${base} [Hindi]`, 1);
      const match = found.subjects.find(
        (entry) =>
          /\[hindi\]/i.test(entry.title) &&
          plainTitle(entry.title).toLowerCase() === base.toLowerCase(),
      );
      if (!match) {
        setHindiLookup('none');
        return;
      }
      setHindiLookup('idle');
      switchDub(match.id);
    } catch {
      setHindiLookup('none');
    }
  };

  const switchDub = (id: string) => {
    if (id === currentId) return;
    setSwitching(true);
    setCurrentId(id);
    setEpisodes(null);
    setError(null);
  };

  const shown = details ?? subject;

  return (
    <View style={styles.screen}>
      {shown.backdrop ? (
        <Image source={{ uri: shown.backdrop }} style={styles.backdrop} resizeMode="cover" />
      ) : null}
      <LinearGradient colors={SCRIM} style={styles.scrim} pointerEvents="none" />

      <View style={[styles.top, { paddingTop: insets.top + (isTV ? 18 : 10) }]}>
        <Pressable onPress={onClose} style={styles.back} hitSlop={12}>
          <Ionicons name="chevron-back" size={isTV ? 28 : 24} color={colors.text} />
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          {shown.title}
        </Text>
        {!isTV && (
          <Pressable
            onPress={() => shareMoviebox({ id: currentId, title: shown.title, poster: shown.poster })}
            style={styles.topShare}
            hitSlop={12}
          >
            <Ionicons name="paper-plane-outline" size={20} color={colors.text} />
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.head}>
          {shown.poster ? (
            <Image source={{ uri: shown.poster }} style={styles.poster} resizeMode="cover" />
          ) : null}
          <View style={styles.headText}>
            <Text style={styles.title}>{shown.title}</Text>
            <Text style={styles.meta}>
              {[
                shown.year,
                shown.duration,
                shown.contentRating,
                shown.rating ? `★ ${shown.rating}` : undefined,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            {shown.genre ? <Text style={styles.meta}>{shown.genre}</Text> : null}
            {shown.country ? <Text style={styles.meta}>{shown.country}</Text> : null}
          </View>
        </View>

        {(dubs.length > 1 || !alreadyHindi) && (
          <View style={styles.dubs}>
            <View style={styles.dubsHead}>
              <Text style={styles.dubsLabel}>Audio</Text>
              {switching ? <ActivityIndicator size="small" color={colors.accent} /> : null}
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dubRow}
            >
              {dubs.map((dub) => {
                const active = dub.id === currentId;
                return (
                  <Pressable
                    key={dub.id}
                    onPress={() => switchDub(dub.id)}
                    style={({ focused, pressed }) => [
                      styles.dub,
                      active && styles.dubActive,
                      (focused || pressed) && styles.dubFocused,
                    ]}
                  >
                    <Text style={[styles.dubText, active && styles.dubTextActive]}>
                      {dubLabel(dub)}
                    </Text>
                  </Pressable>
                );
              })}
              {dubs.length <= 1 && hindiLookup !== 'none' && (
                <Pressable
                  onPress={findHindi}
                  disabled={hindiLookup === 'busy'}
                  style={({ focused, pressed }) => [
                    styles.dub,
                    (focused || pressed) && styles.dubFocused,
                  ]}
                >
                  {hindiLookup === 'busy' ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <Text style={styles.dubText}>Hindi</Text>
                  )}
                </Pressable>
              )}
            </ScrollView>
            {hindiLookup === 'none' ? (
              <Text style={styles.note}>No Hindi audio for this film.</Text>
            ) : null}
          </View>
        )}

        {shown.description ? <Text style={styles.description}>{shown.description}</Text> : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.actionRow}>
          {hasSeasons && !isSeries && (
            <Pressable
              onPress={playFilm}
              disabled={preparing}
              style={({ focused, pressed }) => [
                styles.play,
                (focused || pressed) && styles.playActive,
                preparing && styles.playBusy,
              ]}
            >
              {preparing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Ionicons name="play-circle" size={isTV ? 30 : 24} color="#fff" />
              )}
              <Text style={styles.playText}>Play now</Text>
            </Pressable>
          )}

          {!isTV && (
            <Pressable
              onPress={() => shareMoviebox({ id: currentId, title: shown.title, poster: shown.poster })}
              style={({ pressed }) => [styles.shareBtn, pressed && styles.shareBtnPressed]}
            >
              <Ionicons name="paper-plane-outline" size={18} color={colors.text} />
              <Text style={styles.shareBtnText}>Send to a friend</Text>
            </Pressable>
          )}
        </View>

        {cast.length > 0 && (
          <View style={styles.block}>
            <Text style={styles.sectionTitle}>Cast</Text>
            <Text style={styles.cast}>{cast.map((person) => person.name).join(' · ')}</Text>
          </View>
        )}

        {isSeries && (
          <View style={styles.block}>
            <Text style={styles.sectionTitle}>Episodes</Text>
            {(seasons?.length ?? 0) > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.seasons}
              >
                {(seasons ?? []).map((entry) => (
                  <Pressable
                    key={entry.season}
                    onPress={() => setSeason(entry.season)}
                    style={({ focused, pressed }) => [
                      styles.season,
                      season === entry.season && styles.seasonActive,
                      (focused || pressed) && styles.seasonFocused,
                    ]}
                  >
                    <Text
                      style={[styles.seasonText, season === entry.season && styles.seasonTextActive]}
                    >
                      S{entry.season}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            {episodes === null || episodes.season !== season ? (
              <ActivityIndicator color={colors.accent} style={styles.spinner} />
            ) : episodes.list.length === 0 ? (
              <Text style={styles.note}>No episodes in this season.</Text>
            ) : (
              <FlatList
                data={episodes.list}
                keyExtractor={(episode) => `${episode.season}-${episode.episode}`}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => playEpisode(item)}
                    style={({ focused, pressed }) => [
                      styles.episode,
                      (focused || pressed) && styles.episodeActive,
                    ]}
                  >
                    <View style={styles.episodeMain}>
                      <Text style={styles.episodeName} numberOfLines={1}>
                        {item.title || `Episode ${item.episode}`}
                      </Text>
                      <Text style={styles.episodeMeta}>
                        {[
                          `Episode ${item.episode}`,
                          item.resolution ? `${item.resolution}p` : undefined,
                          item.duration ? `${Math.round(item.duration / 60)} min` : undefined,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                    <Ionicons name="play-circle-outline" size={24} color={colors.accent} />
                  </Pressable>
                )}
              />
            )}
          </View>
        )}

        <View style={styles.block}>
          <Text style={styles.sectionTitle}>Send to TorBox</Text>
          <Text style={styles.note}>
            The same film as a downloadable release, sent to your TorBox and played from there.
          </Text>
          {plainTitle(subject.title).length < 2 ? (
            <Text style={styles.note}>There is nothing to look up by name.</Text>
          ) : (
            <ReleaseList
              releases={releases}
              onSend={onSendRelease}
              emptyText="No releases found for this film."
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, height: isTV ? 420 : 300 },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, height: isTV ? 420 : 300 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: GUTTER,
    paddingBottom: 8,
  },
  back: {
    width: isTV ? 44 : 38,
    height: isTV ? 44 : 38,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  topTitle: { flex: 1, color: colors.text, fontSize: isTV ? 20 : 17, fontWeight: '800' },
  topShare: {
    width: isTV ? 44 : 38,
    height: isTV ? 44 : 38,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  content: { paddingHorizontal: GUTTER, paddingBottom: 120 },
  head: { flexDirection: 'row', gap: 18, marginTop: 10, marginBottom: 14 },
  poster: {
    width: isTV ? 150 : 116,
    aspectRatio: 2 / 3,
    borderRadius: RADIUS,
    backgroundColor: colors.surface,
  },
  headText: { flex: 1, justifyContent: 'center' },
  title: { color: colors.text, fontSize: isTV ? 28 : 22, fontWeight: '900' },
  meta: { color: colors.muted, fontSize: isTV ? 15 : 13, marginTop: 6 },
  description: { color: colors.muted, fontSize: isTV ? 16 : 14, lineHeight: isTV ? 24 : 20, marginBottom: 16 },
  error: { color: colors.live, fontSize: isTV ? 15 : 13, fontWeight: '600', marginBottom: 12 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 18,
  },
  play: {
    flex: 1,
    minWidth: 140,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: isTV ? 15 : 12,
    borderRadius: RADIUS,
    backgroundColor: colors.accent,
  },
  playActive: { backgroundColor: colors.accentDeep },
  playBusy: { opacity: 0.7 },
  playText: { color: '#fff', fontSize: isTV ? 18 : 15, fontWeight: '800' },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: isTV ? 15 : 12,
    paddingHorizontal: 16,
    borderRadius: RADIUS,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  shareBtnPressed: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: colors.text,
  },
  shareBtnText: {
    color: colors.text,
    fontSize: isTV ? 16 : 14,
    fontWeight: '700',
  },
  block: { marginBottom: 22 },
  sectionTitle: {
    color: colors.text,
    fontSize: isTV ? 20 : 17,
    fontWeight: '800',
    marginBottom: 8,
  },
  cast: { color: colors.muted, fontSize: isTV ? 15 : 13, lineHeight: isTV ? 23 : 20 },
  dubs: { marginBottom: 16 },
  dubsHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  dubsLabel: {
    color: colors.muted,
    fontSize: isTV ? 15 : 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  dubRow: { gap: 8, paddingRight: GUTTER },
  dub: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  dubActive: { backgroundColor: colors.accent },
  dubFocused: { borderColor: colors.text },
  dubText: { color: colors.muted, fontSize: isTV ? 15 : 13, fontWeight: '800' },
  dubTextActive: { color: '#fff' },
  seasons: { gap: 8, paddingVertical: 8, paddingRight: GUTTER },
  season: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  seasonActive: { backgroundColor: colors.accent },
  seasonFocused: { borderColor: colors.text },
  seasonText: { color: colors.muted, fontSize: isTV ? 15 : 13, fontWeight: '800' },
  seasonTextActive: { color: '#fff' },
  episode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: isTV ? 13 : 10,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderRadius: RADIUS,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  episodeActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  episodeMain: { flex: 1 },
  episodeName: { color: colors.text, fontSize: isTV ? 15 : 13.5, fontWeight: '700' },
  episodeMeta: { color: colors.muted, fontSize: isTV ? 13 : 12, marginTop: 3 },
  note: { color: colors.muted, fontSize: isTV ? 15 : 13, marginTop: 10, marginBottom: 8 },
  spinner: { marginTop: 24 },
});
