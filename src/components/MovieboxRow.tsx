// A row of films from MovieBox, for the home page. It brings the same films
// the MovieBox tab shows, so the home page is a mix of everything.
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { browseShelves, type MovieboxSubject } from '../api/moviebox';
import { FocusCard } from './FocusCard';
import { FocusRow } from './FocusRow';
import { MovieboxPoster, POSTER_ROW_HEIGHT, POSTER_ROW_PROPS, POSTER_WIDTH } from './MovieboxPoster';
import { SectionHeader } from './Section';
import { SkeletonLoader } from './SkeletonLoader';
import { GUTTER, isTV, sz } from '../theme';

type Props = {
  onOpen: (subject: MovieboxSubject) => void;
  // Which section of MovieBox the row comes from.
  tabId?: number;
  // Bumped when the row should fetch again.
  version?: number;
};

// How many rows of films the home page takes. One is enough to show what
// MovieBox has, and keeps the page light on a phone with little memory.
const MAX_SHELVES = 1;

export function MovieboxRow({ onOpen, tabId = 1, version = 0 }: Props) {
  const [shelves, setShelves] = useState<{ title: string; subjects: MovieboxSubject[] }[] | null>(
    null,
  );

  useEffect(() => {
    let alive = true;
    browseShelves(tabId)
      .then((rows) => alive && setShelves(rows.slice(0, MAX_SHELVES)))
      // A row that cannot be fetched is simply left out: the home page must
      // not fail because one service is down.
      .catch(() => alive && setShelves([]));
    return () => {
      alive = false;
    };
  }, [tabId, version]);

  if (shelves === null) {
    return (
      <View style={styles.row}>
        <SectionHeader title="Trending Movies" subtitle="From MovieBox" />
        <SkeletonLoader columns={isTV ? 7 : 3} cardWidth={POSTER_WIDTH} rows={1} style={styles.loading} />
      </View>
    );
  }

  if (shelves.length === 0) return null;

  return (
    <View style={styles.row}>
      {shelves.map((shelf) => (
        <View key={shelf.title}>
          <SectionHeader title={shelf.title} subtitle="From MovieBox" />
          <FocusRow>
            <FlatList
              horizontal
              data={shelf.subjects}
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
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: sz(22, 28) },
  list: { paddingHorizontal: GUTTER, paddingVertical: sz(2, 8) },
  loading: { paddingLeft: GUTTER, paddingVertical: sz(2, 8), overflow: 'hidden' },
});
