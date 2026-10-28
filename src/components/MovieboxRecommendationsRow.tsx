import { memo, useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { recommendations, type MovieboxSubject } from '../api/moviebox';
import { FocusCard } from './FocusCard';
import { FocusRow } from './FocusRow';
import { MovieboxPoster, POSTER_ROW_HEIGHT, POSTER_ROW_PROPS, POSTER_WIDTH } from './MovieboxPoster';
import { SectionHeader } from './Section';
import { SkeletonLoader } from './SkeletonLoader';
import { GUTTER, isTV, sz } from '../theme';
import type { Playable } from '../types';

type Props = {
  history: Playable[];
  onOpen: (subject: MovieboxSubject) => void;
};

export const MovieboxRecommendationsRow = memo(function MovieboxRecommendationsRow({ history, onOpen }: Props) {
  const last = [...history].reverse().find((h) => h.kind === 'moviebox');
  const [subjects, setSubjects] = useState<MovieboxSubject[] | null>(null);

  useEffect(() => {
    if (!last || last.kind !== 'moviebox') {
      setSubjects([]);
      return;
    }
    let alive = true;
    recommendations({ id: last.subjectId, genre: undefined })
      .then((list) => {
        if (alive) setSubjects(list.slice(0, 12));
      })
      .catch(() => {
        if (alive) setSubjects([]);
      });
    return () => {
      alive = false;
    };
  }, [last?.subjectId]);

  if (subjects === null) {
    return (
      <View style={styles.row}>
        <SectionHeader title="Because you watched" subtitle="From MovieBox" />
        <SkeletonLoader columns={isTV ? 7 : 3} cardWidth={POSTER_WIDTH} rows={1} style={styles.loading} />
      </View>
    );
  }
  if (subjects.length === 0) return null;

  return (
    <View style={styles.row}>
      <SectionHeader title="Because you watched" subtitle="From MovieBox" />
      <FocusRow>
        <FlatList
          horizontal
          data={subjects}
          keyExtractor={(subject) => subject.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.list}
          style={{ height: POSTER_ROW_HEIGHT }}
          {...POSTER_ROW_PROPS}
          renderItem={({ item }) => (
            <FocusCard onPress={() => onOpen(item)} width={POSTER_WIDTH}>
              <MovieboxPoster subject={item} />
            </FocusCard>
          )}
        />
      </FocusRow>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { marginBottom: sz(22, 28) },
  list: { paddingHorizontal: GUTTER, paddingVertical: sz(2, 8) },
  loading: { paddingLeft: GUTTER, paddingVertical: sz(2, 8), overflow: 'hidden' },
});
