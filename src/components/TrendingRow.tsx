// The titles people have been watching most this week, from the account
// server. The list is kept on the phone too, so the row fills in straight away
// on the next launch and still shows something while a slow request is out.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { memo, useEffect, useState } from 'react';
import { AppState, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { getTrending, type RemoteTrendingEntry } from '../chat/api';
import { FocusRow } from './FocusRow';
import { SectionHeader } from './Section';
import { SkeletonLoader } from './SkeletonLoader';
import { GUTTER, colors, isTV } from '../theme';
import type { Playable } from '../types';

const CACHE_KEY = 'trending-cache-v1';
const LIMIT = 20;
const CARD_WIDTH = isTV ? 232 : 184;
const CARD_HEIGHT = Math.round((CARD_WIDTH * 9) / 16);
const ROW_HEIGHT = CARD_HEIGHT + (isTV ? 46 : 44);

type Props = {
  onPlay: (item: Playable) => void;
  onOpenMoviebox: (subject: { id: string; title: string; poster?: string }) => void;
  version?: number;
};

// A picture for the card: the film's poster when there is one, the video's
// own still otherwise.
function pictureFor(item: Playable): string | undefined {
  if (item.kind === 'video') return `https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`;
  if ('poster' in item && item.poster) return item.poster;
  return undefined;
}

function titleFor(item: Playable): string {
  return item.title || 'Untitled';
}

// A stable key for an entry, even if the server's key is missing.
function entryKey(entry: RemoteTrendingEntry): string {
  if (entry.key) return entry.key;
  const item = entry.item as Playable | undefined;
  if (!item) return Math.random().toString(36).slice(2);
  if (item.kind === 'video') return `video:${item.videoId}`;
  if (item.kind === 'live') return `live:${item.channelId}`;
  if (item.kind === 'moviebox') return `moviebox:${item.subjectId}:${item.season}:${item.episode}`;
  return `${item.kind}:${titleFor(item)}`;
}

async function readCache(): Promise<RemoteTrendingEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { rows?: RemoteTrendingEntry[] };
    return Array.isArray(parsed.rows) ? parsed.rows : [];
  } catch {
    return [];
  }
}

function writeCache(rows: RemoteTrendingEntry[]) {
  AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ rows, at: Date.now() })).catch(() => {});
}

export const TrendingRow = memo(function TrendingRow({ onPlay, onOpenMoviebox, version = 0 }: Props) {
  const [entries, setEntries] = useState<RemoteTrendingEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      // The last good answer, so the row is never blank on a cold start.
      if (attempt === 0) {
        const cached = await readCache();
        if (alive && cached.length > 0) setEntries(cached);
      }
      try {
        const fresh = (await getTrending(LIMIT)).filter((row) => row.item && titleFor(row.item));
        if (!alive) return;
        console.log('[trending] loaded', fresh.length);
        setEntries(fresh);
        setFailed(false);
        if (fresh.length > 0) writeCache(fresh);
      } catch (e) {
        if (!alive) return;
        console.warn('[trending] failed', (e as Error)?.message);
        setFailed(true);
        // Keep whatever the cache gave us; otherwise the row says so below.
        setEntries((prev) => prev ?? []);
      }
    })();
    return () => {
      alive = false;
    };
  }, [version, attempt]);

  // A cold server can be slow to wake. Try again a few times by itself before
  // leaving the retry button with the person.
  useEffect(() => {
    if (!failed || attempt >= 3) return;
    const timer = setTimeout(() => setAttempt((n) => n + 1), 5000 * (attempt + 1));
    return () => clearTimeout(timer);
  }, [failed, attempt]);

  // Coming back to the app after a failed load is a good moment to try again.
  useEffect(() => {
    if (!failed) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setAttempt((n) => n + 1);
    });
    return () => sub.remove();
  }, [failed]);

  const retryNow = () => {
    setFailed(false);
    setAttempt((n) => n + 1);
  };

  if (entries === null) {
    return (
      <View style={styles.row}>
        <SectionHeader title="Trending now" subtitle="Most-watched this week" />
        <SkeletonLoader columns={isTV ? 6 : 2} cardWidth={CARD_WIDTH} rows={1} style={styles.loading} />
      </View>
    );
  }

  if (entries.length === 0) {
    return (
      <View style={styles.row}>
        <SectionHeader title="Trending now" subtitle="Most-watched this week" />
        <View style={styles.empty}>
          {failed ? (
            <>
              <Text style={styles.emptyText}>Could not reach the server.</Text>
              <Pressable onPress={retryNow} style={({ pressed }) => [styles.retry, pressed && styles.pressed]}>
                <Ionicons name="refresh" size={14} color="#fff" />
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Ionicons name="trending-up-outline" size={18} color={colors.muted} />
              <Text style={styles.emptyText}>Nothing watched yet this week.</Text>
            </>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <SectionHeader title="Trending now" subtitle="Most-watched this week" />
      <FocusRow>
        <FlatList
          horizontal
          data={entries}
          keyExtractor={entryKey}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.list}
          style={{ height: ROW_HEIGHT }}
          initialNumToRender={isTV ? 6 : 4}
          maxToRenderPerBatch={isTV ? 4 : 5}
          windowSize={3}
          renderItem={({ item }) => {
            const playable = item.item;
            const picture = pictureFor(playable);
            const open = () => {
              if (playable.kind === 'moviebox') {
                onOpenMoviebox({ id: playable.subjectId, title: playable.title, poster: playable.poster });
              } else {
                onPlay(playable);
              }
            };
            return (
              <Pressable onPress={open} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
                {picture ? (
                  <Image source={{ uri: picture }} style={styles.picture} contentFit="cover" transition={150} />
                ) : (
                  <View style={[styles.picture, styles.pictureFallback]}>
                    <Ionicons name="play-circle-outline" size={28} color={colors.muted} />
                  </View>
                )}
                <View style={styles.badge}>
                  <Ionicons name="flame" size={10} color="#fff" />
                  <Text style={styles.badgeText}>{item.count}×</Text>
                </View>
                <Text style={styles.title} numberOfLines={2}>
                  {titleFor(playable)}
                </Text>
              </Pressable>
            );
          }}
        />
      </FocusRow>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { marginBottom: 16 },
  loading: { paddingHorizontal: GUTTER },
  list: { paddingHorizontal: GUTTER, gap: 12 },
  card: { width: CARD_WIDTH },
  picture: { width: CARD_WIDTH, height: CARD_HEIGHT, borderRadius: 12, backgroundColor: '#222' },
  pictureFallback: { alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  badgeText: { color: '#fff', fontSize: 9.5, fontWeight: '800' },
  title: {
    color: colors.text,
    fontSize: isTV ? 13 : 11.5,
    fontWeight: '600',
    marginTop: 4,
    paddingHorizontal: 2,
  },
  pressed: { opacity: 0.7 },
  empty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: GUTTER,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: { color: colors.muted, fontSize: 12.5, flexShrink: 1 },
  retry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: colors.accent,
  },
  retryText: { color: '#fff', fontSize: 11.5, fontWeight: '800' },
});
