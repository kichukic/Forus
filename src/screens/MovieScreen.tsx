import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CatalogMovie } from '../api/catalog';
import { findTorrents, type TorrentOption } from '../api/torrents';
import { TorboxSendCard } from '../components/TorboxSendCard';
import { useTorboxSend } from '../hooks/useTorboxSend';
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
  const [listError, setListError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<TorrentOption | null>(null);
  const { phase, start, cancel } = useTorboxSend({
    onPlay: (item) => {
      onPlay(item);
      onClose();
    },
  });

  useEffect(() => {
    let alive = true;
    findTorrents(movie.id)
      .then((list) => alive && setTorrents(list))
      .catch(() => alive && setListError("Couldn't look up releases. Check the internet connection."));
    return () => {
      alive = false;
    };
  }, [movie.id]);

  const busy = phase.kind === 'sending' || phase.kind === 'downloading';
  const error = phase.kind === 'error' ? phase : null;

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

      {busy ? (
        <TorboxSendCard
          title={chosen?.name || movie.title}
          torrent={phase.kind === 'downloading' ? phase.torrent : null}
          sending={phase.kind === 'sending'}
          onCancel={cancel}
        />
      ) : (
        <FlatList
          data={torrents ?? []}
          keyExtractor={(t) => t.hash}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View>
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
              {movie.description ? (
                <Text style={styles.description}>{movie.description}</Text>
              ) : null}

              {error && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error.message}</Text>
                  {error.needsKey && (
                    <Pressable
                      onPress={onOpenTorbox}
                      style={({ focused, pressed }) => [
                        styles.connect,
                        (focused || pressed) && styles.cancelActive,
                      ]}
                    >
                      <Text style={styles.connectText}>Connect TorBox</Text>
                    </Pressable>
                  )}
                </View>
              )}

              <Text style={styles.sectionTitle}>
                {torrents === null ? 'Looking for releases…' : 'Releases'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                setChosen(item);
                start(item);
              }}
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
              <Ionicons name="chevron-forward" size={20} color={colors.faint} />
            </Pressable>
          )}
          ListEmptyComponent={
            torrents === null ? (
              <ActivityIndicator color={colors.accent} style={styles.spinner} />
            ) : listError ? (
              <Text style={styles.note}>{listError}</Text>
            ) : (
              <Text style={styles.note}>No releases found for this film.</Text>
            )
          }
        />
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
  note: { color: colors.muted, fontSize: isTV ? 15 : 13, marginTop: 10 },
  spinner: { marginTop: 24 },
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
});
