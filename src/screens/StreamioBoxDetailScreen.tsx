import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadMeta, type StreamioItem } from '../api/streamiobox';
import { searchTorrents, type TorrentOption } from '../api/torrents';
import { resolveDirectSeriesEpisode } from '../api/directStreams';
import { shareMovie } from '../chat/share';
import { FavoriteHeart } from '../components/FavoriteHeart';
import { showToast } from '../data/toasts';
import { GUTTER, RADIUS, colors, isTV } from '../theme';
import type { Playable } from '../types';

type Props = {
  item: StreamioItem;
  onClose: () => void;
  onSendRelease: (option: TorrentOption) => void;
  onPlay?: (item: Playable) => void;
};

export function StreamioBoxDetailScreen({ item, onClose, onSendRelease, onPlay }: Props) {
  const insets = useSafeAreaInsets();
  const [meta, setMeta] = useState<{ item: StreamioItem; videos: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadMeta('series', item.id)
      .then((m) => {
        if (!alive) return;
        setMeta(m as any);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => { alive = false; };
  }, [item.id]);

  const playOrSendEpisode = async (v: any) => {
    const key = v.id ?? `${v.season}:${v.episode}`;
    setSending(key);
    try {
      // 1. Try playing direct stream straight in the player:
      if (onPlay && v.season != null && v.episode != null) {
        const direct = await resolveDirectSeriesEpisode(item.title, v.season, v.episode);
        if (direct?.playable) {
          showToast({ text: `Playing ${item.title} S${v.season}E${v.episode}` });
          onPlay(direct.playable);
          return;
        }
      }

      // 2. Fallback to torrent releases:
      const q = `${item.title} S${String(v.season).padStart(2, '0')}E${String(v.episode).padStart(2, '0')}`;
      const list = await searchTorrents(q);
      if (list.length === 0) {
        showToast({ text: 'No releases found for this episode.' });
        return;
      }
      onSendRelease(list[0]);
      showToast({ text: `Sent ${list[0].name} to TorBox` });
    } catch {
      showToast({ text: "Couldn't load stream for episode." });
    } finally {
      setSending(null);
    }
  };

  const videos = meta?.videos ?? [];
  const seasons = Array.from(new Set(videos.map((v) => v.season).filter((s) => s != null))).sort((a, b) => a - b);

  return (
    <View style={styles.screen}>
      {item.background ? <Image source={{ uri: item.background }} style={styles.backdrop} resizeMode="cover" /> : null}
      <View style={[styles.top, { paddingTop: insets.top + (isTV ? 18 : 10) }]}>
        <Pressable onPress={onClose} style={styles.back} hitSlop={12}>
          <Ionicons name="chevron-back" size={isTV ? 28 : 24} color={colors.text} />
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>{item.title}</Text>
        <View style={styles.topActions}>
          <FavoriteHeart
            item={{
              id: `streamio:${item.id}`,
              kind: 'movie',
              title: item.title,
              poster: item.poster,
              year: item.year,
              genre: item.genres?.[0],
            }}
            size={isTV ? 22 : 18}
          />
          {!isTV && (
            <Pressable
              onPress={() => shareMovie({ id: item.id, title: item.title, poster: item.poster, year: item.year })}
              style={styles.topShare}
              hitSlop={12}
            >
              <Ionicons name="paper-plane-outline" size={20} color={colors.text} />
            </Pressable>
          )}
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        <View style={styles.head}>
          {item.poster ? <Image source={{ uri: item.poster }} style={styles.poster} resizeMode="cover" /> : null}
          <View style={styles.headText}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.meta}>{[item.year, item.runtime, item.genres?.slice(0, 3).join(', ')].filter(Boolean).join(' · ')}</Text>
            {!isTV && (
              <Pressable
                onPress={() => shareMovie({ id: item.id, title: item.title, poster: item.poster, year: item.year })}
                style={({ pressed }) => [styles.shareBtn, pressed && styles.shareBtnPressed]}
              >
                <Ionicons name="paper-plane-outline" size={16} color={colors.text} />
                <Text style={styles.shareBtnText}>Send to a friend</Text>
              </Pressable>
            )}
          </View>
        </View>
        {item.description ? <Text style={styles.description}>{item.description}</Text> : null}
        {loading ? <Text style={styles.note}>Loading episodes…</Text> : null}
        {seasons.map((s) => (
          <View key={s} style={styles.seasonBlock}>
            <Text style={styles.sectionTitle}>Season {s}</Text>
            {videos
              .filter((v) => v.season === s)
              .sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0))
              .map((v) => {
                const key = v.id ?? `${v.season}:${v.episode}`;
                return (
                  <Pressable
                    key={key}
                    onPress={() => playOrSendEpisode(v)}
                    disabled={sending === key}
                    style={({ focused, pressed }) => [styles.episode, (focused || pressed) && styles.episodeActive]}
                  >
                    <View style={styles.episodeMain}>
                      <Text style={styles.episodeTitle} numberOfLines={1}>
                        {v.episode}. {v.name ?? `Episode ${v.episode}`}
                      </Text>
                      <Text style={styles.episodeMeta}>
                        {sending === key ? 'Starting…' : 'Play in Player'}
                      </Text>
                    </View>
                    <Ionicons
                      name="play-circle"
                      size={22}
                      color={colors.accent}
                    />
                  </Pressable>
                );
              })}
          </View>
        ))}
        {!loading && seasons.length === 0 ? <Text style={styles.note}>No episodes found.</Text> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, height: isTV ? 380 : 260 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: GUTTER, paddingBottom: 8 },
  back: { width: isTV ? 44 : 38, height: isTV ? 44 : 38, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  topTitle: { flex: 1, color: colors.text, fontSize: isTV ? 20 : 17, fontWeight: '800' },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topShare: { width: isTV ? 44 : 38, height: isTV ? 44 : 38, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  list: { paddingHorizontal: GUTTER, paddingBottom: 120 },
  head: { flexDirection: 'row', gap: 18, marginTop: 10, marginBottom: 14 },
  poster: { width: isTV ? 150 : 116, aspectRatio: 2 / 3, borderRadius: RADIUS, backgroundColor: colors.surface },
  headText: { flex: 1, justifyContent: 'center' },
  title: { color: colors.text, fontSize: isTV ? 28 : 22, fontWeight: '900' },
  meta: { color: colors.muted, fontSize: isTV ? 15 : 13, marginTop: 6 },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: 'flex-start',
  },
  shareBtnPressed: { backgroundColor: 'rgba(255,255,255,0.12)', borderColor: colors.text },
  shareBtnText: { color: colors.text, fontSize: isTV ? 15 : 13, fontWeight: '700' },
  description: { color: colors.muted, fontSize: isTV ? 16 : 14, lineHeight: isTV ? 24 : 20, marginBottom: 18 },
  sectionTitle: { color: colors.text, fontSize: isTV ? 20 : 17, fontWeight: '800', marginTop: 14, marginBottom: 10 },
  episode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: isTV ? 14 : 11,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderRadius: RADIUS,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  episodeActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  episodeMain: { flex: 1 },
  episodeTitle: { color: colors.text, fontSize: isTV ? 16 : 14, fontWeight: '700' },
  episodeMeta: { color: colors.muted, fontSize: isTV ? 13 : 12, marginTop: 3 },
  seasonBlock: { marginBottom: 12 },
  note: { color: colors.muted, fontSize: isTV ? 15 : 13, marginTop: 10 },
});
