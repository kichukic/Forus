import { useEffect, useState } from 'react';
import {
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
import type { CatalogMovie } from '../api/catalog';
import { findTorrents, magnetFor, type TorrentOption } from '../api/torrents';
import { getApiKey, createTorrent, getTorrent, getStreamUrl, mainVideoFile } from '../api/torbox';
import { getAllStreams, type StreamResult } from '../api/addons';
import { resolveDirectMovieStreams, type DirectStreamOption } from '../api/directStreams';
import { playableRows, directStream } from '../api/moviebox';
import { shareMovie } from '../chat/share';
import { startDownload } from '../data/downloads';
import { ReleaseList } from '../components/ReleaseList';
import { Loader } from '../components/Loader';
import { addTransfer } from '../data/transfers';
import { showToast } from '../data/toasts';
import { GUTTER, RADIUS, SCRIM, colors, isTV } from '../theme';
import type { Playable } from '../types';

type Props = {
  movie: CatalogMovie;
  onClose: () => void;
  onPlay: (item: Playable) => void;
  // Opens the TorBox settings, for when the app isn't connected yet.
  onOpenTorbox: () => void;
};

export function MovieScreen({ movie, onClose, onPlay, onOpenTorbox }: Props) {
  const insets = useSafeAreaInsets();
  const [torrents, setTorrents] = useState<TorrentOption[] | null>(null);
  const [addonStreams, setAddonStreams] = useState<{ addon: string; streams: StreamResult[] }[] | null>(null);
  const [directStreams, setDirectStreams] = useState<DirectStreamOption[] | null>(null);
  const [instantLoading, setInstantLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const primaryStream = directStreams?.[0];

  useEffect(() => {
    let alive = true;
    findTorrents(movie.id)
      .then((list) => alive && setTorrents(list))
      .catch(() => alive && setListError("Couldn't look up releases. Check the internet connection."));
    getAllStreams('movie', movie.id)
      .then((list) => alive && setAddonStreams(list))
      .catch(() => {});
    resolveDirectMovieStreams(movie.title, movie.year)
      .then((list) => alive && setDirectStreams(list))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [movie.id, movie.title, movie.year]);

  const instantPlay = async (hash: string, name: string, tracker: string | undefined, magnet: string) => {
    setInstantLoading(true);
    try {
      const key = await getApiKey();
      if (key) {
        const created = await createTorrent(key, magnet, name).catch(() => null);
        if (created) {
          let torrent = await getTorrent(key, created.torrentId);
          for (let i = 0; i < 10; i++) {
            if (torrent && (torrent.downloadFinished || torrent.downloadPresent)) break;
            await new Promise((r) => setTimeout(r, 1200));
            torrent = await getTorrent(key, created.torrentId);
          }
          if (torrent && (torrent.downloadFinished || torrent.downloadPresent)) {
            const file = mainVideoFile(torrent);
            if (file) {
              const url = await getStreamUrl(key, { source: 'torrents', itemId: torrent.id, fileId: file.id });
              setInstantLoading(false);
              onPlay({ kind: 'stream', url, title: name, poster: movie.poster ?? undefined });
              return;
            }
          }
        }
      }

      // If TorBox is not available or torrent is not cached in TorBox yet:
      // Fallback seamlessly to playing the movie in the native player!
      if (primaryStream) {
        setInstantLoading(false);
        showToast({ text: `Playing "${movie.title}" in player` });
        onPlay(primaryStream.playable);
        if (key) addTransfer({ hash, name, quality: '', size: undefined, seeders: undefined, tracker, magnet });
        return;
      }

      const fresh = await resolveDirectMovieStreams(movie.title, movie.year);
      if (fresh.length > 0) {
        setInstantLoading(false);
        showToast({ text: `Playing "${movie.title}" in player` });
        onPlay(fresh[0].playable);
        if (key) addTransfer({ hash, name, quality: '', size: undefined, seeders: undefined, tracker, magnet });
        return;
      }

      setInstantLoading(false);
      if (key) {
        addTransfer({ hash, name, quality: '', size: undefined, seeders: undefined, tracker, magnet });
        showToast({ text: 'Added release to TorBox downloads' });
      } else {
        showToast({
          text: 'No direct stream found. Connect TorBox to stream torrents directly.',
          action: { label: 'Connect', onPress: onOpenTorbox },
        });
      }
    } catch {
      setInstantLoading(false);
      if (primaryStream) {
        onPlay(primaryStream.playable);
      } else {
        showToast({ text: "Couldn't start playback." });
      }
    }
  };

  const [downloading, setDownloading] = useState(false);

  const downloadPrimaryMovie = async () => {
    if (downloading || !primaryStream) return;
    setDownloading(true);
    try {
      if (primaryStream.playable.kind === 'moviebox') {
        const mb = primaryStream.playable;
        const rows = await playableRows(mb.subjectId, mb.season, mb.episode);
        if (rows.length === 0) throw new Error('No stream available to download.');
        const best = rows.reduce((pick, row) => (row.resolution > pick.resolution ? row : pick));
        const stream = await directStream(mb.subjectId, best);
        await startDownload({
          id: `mb_${mb.subjectId}`,
          title: movie.title,
          poster: movie.poster,
          url: stream.url,
          kind: 'moviebox',
        });
      } else if (primaryStream.playable.kind === 'stream') {
        await startDownload({
          id: `stream_${movie.id}`,
          title: movie.title,
          poster: movie.poster,
          url: primaryStream.playable.url,
          kind: 'stream',
        });
      }
    } catch (e) {
      showToast({ text: (e as Error).message || 'Could not download movie.' });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <View style={styles.screen}>
      {movie.background ? (
        <Image source={{ uri: movie.background }} style={styles.backdrop} resizeMode="cover" />
      ) : null}
      <LinearGradient colors={SCRIM} style={styles.scrim} pointerEvents="none" />

      <View style={[styles.top, { paddingTop: insets.top + (isTV ? 18 : 10) }]}>
        <Pressable onPress={onClose} style={styles.back} hitSlop={12}>
          <Ionicons name="chevron-back" size={isTV ? 28 : 24} color={colors.text} />
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          {movie.title}
        </Text>
        {!isTV && (
          <Pressable
            onPress={() => shareMovie({ id: movie.id, title: movie.title, poster: movie.poster, year: movie.year })}
            style={styles.topShare}
            hitSlop={12}
          >
            <Ionicons name="paper-plane-outline" size={20} color={colors.text} />
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        <View style={styles.head}>
          {movie.poster ? (
            <Image source={{ uri: movie.poster }} style={styles.poster} resizeMode="cover" />
          ) : null}
          <View style={styles.headText}>
            <Text style={styles.title}>{movie.title}</Text>
            <Text style={styles.meta}>
              {[movie.year, movie.runtime, movie.genres?.slice(0, 3).join(', ')]
                .filter(Boolean)
                .join(' · ')}
            </Text>

            <View style={styles.actionsRow}>
              {primaryStream && (
                <Pressable
                  onPress={() => onPlay(primaryStream.playable)}
                  style={({ focused, pressed }) => [
                    styles.watchBtn,
                    (focused || pressed) && styles.watchBtnActive,
                  ]}
                >
                  <Ionicons name="play" size={isTV ? 22 : 18} color="#fff" />
                  <Text style={styles.watchBtnText}>
                    Watch Now ({primaryStream.quality})
                  </Text>
                </Pressable>
              )}
              {!isTV && (
                <Pressable
                  onPress={() => shareMovie({ id: movie.id, title: movie.title, poster: movie.poster, year: movie.year })}
                  style={({ focused, pressed }) => [
                    styles.shareBtn,
                    (focused || pressed) && styles.shareBtnActive,
                  ]}
                >
                  <Ionicons name="paper-plane-outline" size={16} color={colors.text} />
                  <Text style={styles.shareBtnText}>Send to a friend</Text>
                </Pressable>
              )}
              {!isTV && primaryStream && (
                <Pressable
                  onPress={downloadPrimaryMovie}
                  disabled={downloading}
                  style={({ focused, pressed }) => [
                    styles.shareBtn,
                    (focused || pressed) && styles.shareBtnActive,
                  ]}
                >
                  <Ionicons name="cloud-download-outline" size={16} color={colors.text} />
                  <Text style={styles.shareBtnText}>{downloading ? 'Preparing…' : 'Download'}</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>

        {movie.description ? <Text style={styles.description}>{movie.description}</Text> : null}

        {directStreams && directStreams.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <Text style={styles.sectionTitle}>Direct Streams (Play Now)</Text>
            {directStreams.map((st, i) => (
              <Pressable
                key={`direct-${i}`}
                onPress={() => onPlay(st.playable)}
                style={({ focused, pressed }) => [
                  styles.release,
                  styles.directRelease,
                  (focused || pressed) && styles.releaseActive,
                ]}
              >
                <View style={styles.releaseMain}>
                  <Text style={styles.releaseName} numberOfLines={2}>
                    {st.title}
                  </Text>
                  <Text style={styles.releaseMeta}>
                    {[st.quality, st.size, 'Instant Play · Fast CDN'].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Ionicons name="play-circle" size={24} color={colors.accent} />
              </Pressable>
            ))}
          </View>
        )}

        {addonStreams && addonStreams.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <Text style={styles.sectionTitle}>Streams (addons)</Text>
            {addonStreams.map((g, gi) =>
              g.streams.map((st, si) => (
                <Pressable
                  key={`${gi}-${si}`}
                  onPress={() => {
                    if (st.url) {
                      onPlay({
                        kind: 'stream',
                        url: st.url,
                        title: st.title || st.name || movie.title,
                        poster: movie.poster ?? undefined,
                      });
                    } else if (st.infoHash) {
                      const title = st.title || st.name || movie.title;
                      const magnet = magnetFor(st.infoHash, title);
                      instantPlay(st.infoHash, title, g.addon, magnet);
                    }
                  }}
                  style={({ focused, pressed }) => [styles.release, (focused || pressed) && styles.releaseActive]}
                >
                  <View style={styles.releaseMain}>
                    <Text style={styles.releaseName} numberOfLines={2}>
                      {st.title || st.name || 'Stream'}
                    </Text>
                    <Text style={styles.releaseMeta}>
                      {st.url ? 'Play now' : 'Play in Player'}
                    </Text>
                  </View>
                  <Ionicons
                    name="play-circle"
                    size={22}
                    color={colors.accent}
                  />
                </Pressable>
              )),
            )}
          </View>
        )}

        <Text style={styles.sectionTitle}>
          {torrents === null ? 'Looking for releases…' : 'Releases'}
        </Text>

        <ReleaseList
          releases={torrents}
          onSend={(item) => {
            instantPlay(item.hash, item.name, undefined, item.magnet);
          }}
          error={listError}
          emptyText="No releases found for this film."
        />
      </ScrollView>

      {instantLoading && (
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)' }]}>
          <Loader size="large" label="Starting player" icon="film-outline" />
        </View>
      )}
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
  list: { paddingHorizontal: GUTTER, paddingBottom: 120 },
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
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  watchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: colors.accent,
  },
  watchBtnActive: {
    backgroundColor: colors.accentDeep,
    transform: [{ scale: 1.03 }],
  },
  watchBtnText: {
    color: '#fff',
    fontSize: isTV ? 16 : 14,
    fontWeight: '800',
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: 'flex-start',
  },
  shareBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: colors.text,
  },
  shareBtnText: {
    color: colors.text,
    fontSize: isTV ? 15 : 13.5,
    fontWeight: '700',
  },
  description: { color: colors.muted, fontSize: isTV ? 16 : 14, lineHeight: isTV ? 24 : 20, marginBottom: 18 },
  sectionTitle: {
    color: colors.text,
    fontSize: isTV ? 20 : 17,
    fontWeight: '800',
    marginTop: 6,
    marginBottom: 10,
  },
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
  directRelease: {
    borderColor: 'rgba(155,92,255,0.3)',
    backgroundColor: 'rgba(155,92,255,0.08)',
  },
  releaseActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  releaseMain: { flex: 1 },
  releaseName: { color: colors.text, fontSize: isTV ? 16 : 14, fontWeight: '700' },
  releaseMeta: { color: colors.muted, fontSize: isTV ? 13 : 12, marginTop: 3 },
});
