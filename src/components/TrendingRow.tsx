// A row of the most-watched titles in the last week, from the backend.
import { memo, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { getTrending, type RemoteTrendingEntry } from '../chat/api';
import { FocusRow } from './FocusRow';
import { SectionHeader } from './Section';
import { SkeletonLoader } from './SkeletonLoader';
import { GUTTER, colors, isTV } from '../theme';
import { POSTER_ROW_HEIGHT, POSTER_ROW_PROPS, POSTER_WIDTH } from './MovieboxPoster';

type Props = {
  onOpenMoviebox: (subject: { id: string; title: string; poster?: string }) => void;
  version?: number;
};

export const TrendingRow = memo(function TrendingRow({ onOpenMoviebox, version = 0 }: Props) {
  const [entries, setEntries] = useState<RemoteTrendingEntry[] | null>(null);

  useEffect(() => {
    let alive = true;
    getTrending(15)
      .then((rows) => alive && setEntries(rows))
      .catch(() => alive && setEntries([]));
    return () => {
      alive = false;
    };
  }, [version]);

  if (entries === null) {
    return (
      <View style={styles.row}>
        <SectionHeader title="Trending now" subtitle="Most-watched this week" />
        <SkeletonLoader columns={isTV ? 8 : 3} cardWidth={POSTER_WIDTH} rows={1} poster style={styles.loading} />
      </View>
    );
  }
  if (entries.length === 0) return null;

  return (
    <View style={styles.row}>
      <SectionHeader title="Trending now" subtitle="Most-watched this week" />
      <FocusRow>
        <FlatList
          horizontal
          data={entries}
          keyExtractor={(e) => e.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.list}
          style={{ height: POSTER_ROW_HEIGHT }}
          {...POSTER_ROW_PROPS}
          renderItem={({ item }) => {
            const e = item.item as { kind: string; subjectId?: string; title: string; poster?: string };
            const subject = { id: e.subjectId ?? item.key, title: e.title, poster: e.poster };
            return (
              <Pressable onPress={() => onOpenMoviebox(subject as any)} style={{ width: POSTER_WIDTH }}>
                {e.poster ? (
                  <Image source={{ uri: e.poster }} style={styles.poster} contentFit="cover" />
                ) : (
                  <View style={[styles.poster, styles.posterFallback]} />
                )}
                <Text style={styles.title} numberOfLines={2}>
                  {e.title}
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
  list: { paddingHorizontal: GUTTER, gap: 12 },
  loading: { paddingHorizontal: GUTTER },
  poster: { width: POSTER_WIDTH, height: Math.round(POSTER_WIDTH * 1.5), borderRadius: 12, backgroundColor: '#222' },
  posterFallback: { alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: isTV ? 13 : 11.5, fontWeight: '600', marginTop: 4, paddingHorizontal: 2 },
});
