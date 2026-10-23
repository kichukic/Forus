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
import { ReleaseList } from '../components/ReleaseList';
import { Loader } from '../components/Loader';
import { addTransfer } from '../data/transfers';
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
  const [instantLoading, setInstantLoading] = useState(false);
  const instantPlay = async (hash: string, name: string, tracker: string | undefined, magnet: string) => {
    setInstantLoading(true);
    try {
      const key = await getApiKey();
      if (!key) {
        setInstantLoading(false);
        addTransfer({ hash, name, quality: '', size: undefined, seeders: undefined, tracker, magnet });
        return;
      }
      const created = await createTorrent(key, magnet, name);
      let torrent = await getTorrent(key, created.torrentId);
      for (let i = 0; i < 20; i++) {
        if (torrent && (torrent.downloadFinished || torrent.downloadPresent)) break;
        await new Promise((r) => setTimeout(r, 1500));
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
      setInstantLoading(false);
      addTransfer({ hash, name, quality: '', size: undefined, seeders: undefined, tracker, magnet });
    } catch {
      setInstantLoading(false);
      addTransfer({ hash, name, quality: '', size: undefined, seeders: undefined, tracker, magnet });
    }
  };
  const [listError, setListError] = useState<string | null>(null);
  // Sending now runs in the background, so this screen never blocks on it.

  useEffect(() => {
    let alive = true;
    findTorrents(movie.id)
      .then((list) => alive && setTorrents(list))
      .catch(() => alive && setListError("Couldn't look up releases. Check the internet connection."));
    getAllStreams('movie', movie.id)
      .then((list) => alive && setAddonStreams(list))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [movie.id]);


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
            </View>
          </View>
          {movie.description ? <Text style={styles.description}>{movie.description}</Text> : null}

          {addonStreams && addonStreams.length > 0 && (
            <View style={{ marginBottom: 16 }}>
              <Text style={styles.sectionTitle}>Streams (addons)</Text>
              {addonStreams.map((g, gi) =>
                g.streams.map((st, si) => (
                  <Pressable
                    key={`${gi}-${si}`}
                    onPress={() => {
                      if (st.url) {
                        onPlay({ kind: 'stream', url: st.url, title: st.title || st.name || movie.title, poster: movie.poster ?? undefined });
                      } else if (st.infoHash) {
                        const title = st.title || st.name || movie.title;
                        const magnet = magnetFor(st.infoHash, title);
                        instantPlay(st.infoHash, title, g.addon, magnet);
                      }
                    }}
                    style={({ focused, pressed }) => [styles.release, (focused || pressed) && styles.releaseActive]}
                  >
                    <View style={styles.releaseMain}>
                      <Text style={styles.releaseName} numberOfLines={2}>{st.title || st.name || 'Stream'}</Text>
                      <Text style={styles.releaseMeta}>{st.url ? 'Play now' : st.infoHash ? 'Send to TorBox' : ''}</Text>
                    </View>
                    <Ionicons
                      name={st.url ? 'play' : 'cloud-download-outline'}
                      size={20}
                      color={st.url ? colors.accent : colors.faint}
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
          <Loader size="large" label="Loading movie" icon="film-outline" />
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
  description: { color: colors.muted, fontSize: isTV ? 16 : 14, lineHeight: isTV ? 24 : 20, marginBottom: 18 },
  sectionTitle: {
    color: colors.text,
    fontSize: isTV ? 20 : 17,
    fontWeight: '800',
    marginTop: 6,
    marginBottom: 10,
  },
  errorBox: {
    backgroundColor: colors.surface,
    borderRadius: RADIUS,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  errorText: { color: colors.live, fontSize: isTV ? 15 : 13, fontWeight: '600' },
  connect: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: colors.accent,
  },
  connectText: { color: '#fff', fontSize: isTV ? 15 : 13, fontWeight: '800' },
  cancelActive: { borderColor: colors.accent },
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
});
