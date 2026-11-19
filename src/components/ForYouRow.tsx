// A personalized row: scores MovieBox subjects by the user's activity profile.
import { memo, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { browseShelves, browseTabs, type MovieboxSubject } from '../api/moviebox';
import { FocusRow } from './FocusRow';
import { MovieboxPoster, POSTER_ROW_HEIGHT, POSTER_ROW_PROPS, POSTER_WIDTH } from './MovieboxPoster';
import { SectionHeader } from './Section';
import { SkeletonLoader } from './SkeletonLoader';
import { buildProfile, rankSubjects } from '../data/profile';
import { getStore } from '../data/activity';
import { GUTTER, isTV } from '../theme';

type Props = {
  onOpen: (subject: MovieboxSubject) => void;
  version?: number;
};

export const ForYouRow = memo(function ForYouRow({ onOpen, version = 0 }: Props) {
  const [subjects, setSubjects] = useState<MovieboxSubject[] | null>(null);

  const watchCount = getStore().watches.length;
  const favoriteCount = getStore().favorites.length;
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const tabs = await browseTabs();
        const movieTab = tabs.find((t) => /movie|film/i.test(t.name)) ?? tabs[0];
        const shelves = await browseShelves(movieTab ? movieTab.id : 1);
        if (!alive) return;
        const all = shelves.flatMap((s) => s.subjects ?? []).filter((s) => s.kind === 'movie');
        const profile = buildProfile();
        const ranked = rankSubjects(all, profile).slice(0, isTV ? 14 : 10);
        setSubjects(ranked);
      } catch {
        if (alive) setSubjects([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [version, watchCount, favoriteCount]);

  if (subjects === null) {
    return (
      <View style={styles.row}>
        <SectionHeader title="For You" subtitle="Picked from what you watch" />
        <SkeletonLoader columns={isTV ? 8 : 3} cardWidth={POSTER_WIDTH} rows={1} poster style={styles.loading} />
      </View>
    );
  }

  if (subjects.length === 0) return null;

  return (
    <View style={styles.row}>
      <SectionHeader title="For You" subtitle="Picked from what you watch" />
      <FocusRow>
        <FlatList
          horizontal
          data={subjects}
          keyExtractor={(s) => s.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.list}
          style={{ height: POSTER_ROW_HEIGHT }}
          {...POSTER_ROW_PROPS}
          renderItem={({ item }) => (
            <Pressable onPress={() => onOpen(item)} style={{ width: POSTER_WIDTH }}>
              <MovieboxPoster subject={item} />
            </Pressable>
          )}
        />
      </FocusRow>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { marginBottom: 16 },
  list: { paddingHorizontal: GUTTER, gap: 12 },
  loading: { paddingHorizontal: GUTTER },
});
