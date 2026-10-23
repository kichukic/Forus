import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadMeta, type StreamioItem } from '../api/streamiobox';
import { searchTorrents, type TorrentOption } from '../api/torrents';
import { showToast } from '../data/toasts';
import { GUTTER, RADIUS, colors, isTV } from '../theme';

type Props = {
  item: StreamioItem;
  onClose: () => void;
  onSendRelease: (option: TorrentOption) => void;
};

export function StreamioBoxDetailScreen({ item, onClose, onSendRelease }: Props) {
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

  const sendEpisode = async (v: any) => {
    const key = v.id ?? `${v.season}:${v.episode}`;
    setSending(key);
    try {
      const q = `${item.title} S${String(v.season).padStart(2, '0')}E${String(v.episode).padStart(2, '0')}`;
      const list = await searchTorrents(q);
      if (list.length === 0) {
        showToast({ text: 'No releases found for this episode.' });
        return;
      }
      onSendRelease(list[0]);
      showToast({ text: `Sent ${list[0].name}` });
    } catch {
      showToast({ text: "Couldn't look up releases." });
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
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        <View style={styles.head}>
          {item.poster ? <Image source={{ uri: item.poster }} style={styles.poster} resizeMode="cover" /> : null}
          <View style={styles.headText}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.meta}>{[item.year, item.runtime, item.genres?.slice(0, 3).join(', ')].filter(Boolean).join(' · ')}</Text>
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
                    onPress={() => sendEpisode(v)}
                    disabled={sending === key}
                    style={({ focused, pressed }) => [styles.episode, (focused || pressed) && styles.episodeActive]}
                  >
                    <Text style={styles.episodeTitle} numberOfLines={1}>
                      {v.episode}. {v.name ?? `Episode ${v.episode}`}
                    </Text>
                    <Text style={styles.episodeMeta}>{sending === key ? 'Sending…' : 'Send to TorBox'}</Text>
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
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, height: isTV ? 420 : 300 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: GUTTER, paddingBottom: 8 },
  back: { width: isTV ? 44 : 38, height: isTV ? 44 : 38, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  topTitle: { flex: 1, color: colors.text, fontSize: isTV ? 20 : 17, fontWeight: '800' },
  list: { paddingHorizontal: GUTTER, paddingBottom: 120 },
  head: { flexDirection: 'row', gap: 18, marginTop: 10, marginBottom: 14 },
  poster: { width: isTV ? 150 : 116, aspectRatio: 2 / 3, borderRadius: RADIUS, backgroundColor: colors.surface },
  headText: { flex: 1, justifyContent: 'center' },
  title: { color: colors.text, fontSize: isTV ? 28 : 22, fontWeight: '900' },
  meta: { color: colors.muted, fontSize: isTV ? 15 : 13, marginTop: 6 },
  description: { color: colors.muted, fontSize: isTV ? 16 : 14, lineHeight: isTV ? 24 : 20, marginBottom: 18 },
  sectionTitle: { color: colors.text, fontSize: isTV ? 20 : 17, fontWeight: '800', marginTop: 14, marginBottom: 10 },
  note: { color: colors.muted, fontSize: isTV ? 15 : 13, marginTop: 10 },
  seasonBlock: { marginBottom: 8 },
  episode: { paddingVertical: isTV ? 12 : 10, paddingHorizontal: 14, marginBottom: 8, borderRadius: RADIUS, backgroundColor: colors.surface, borderWidth: 2, borderColor: 'transparent' },
  episodeActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  episodeTitle: { color: colors.text, fontSize: isTV ? 16 : 14, fontWeight: '700' },
  episodeMeta: { color: colors.muted, fontSize: isTV ? 13 : 12, marginTop: 3 },
});
