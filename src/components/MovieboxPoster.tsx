// A film in a row or a grid: its poster with the name and year underneath.
import { Platform, Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { MovieboxSubject } from '../api/moviebox';
import { RADIUS, colors, isTV } from '../theme';

// The width of a poster in a row, which is taller than it is wide.
export const POSTER_WIDTH = isTV ? 190 : 132;
// The height of the poster itself, and of the row of names under it.
export const POSTER_HEIGHT = Math.round((POSTER_WIDTH * 3) / 2);
export const POSTER_ROW_HEIGHT = POSTER_HEIGHT + 52;
// Only a few posters are built at a time. A phone with little memory cannot
// hold fifty of them at once, and the ones it does hold are the ones that
// make it lag.
export const POSTER_ROW_PROPS = {
  initialNumToRender: 6,
  maxToRenderPerBatch: 6,
  windowSize: 3,
  // Android keeps what it draws out of view; letting go of it saves memory.
  removeClippedSubviews: Platform.OS === 'android' && !isTV,
};

export function MovieboxPoster({ subject }: { subject: MovieboxSubject }) {
  return (
    <View>
      <View style={styles.poster}>
        {subject.poster ? (
          <Image source={{ uri: subject.poster }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.posterBlank]}>
            <Text style={styles.posterBlankText} numberOfLines={3}>
              {subject.title}
            </Text>
          </View>
        )}
        {subject.rating ? (
          <View style={styles.rating}>
            <Ionicons name="star" size={isTV ? 13 : 11} color="#ffd166" />
            <Text style={styles.ratingText}>{subject.rating}</Text>
          </View>
        ) : null}
        {subject.kind === 'series' ? (
          <View style={styles.series}>
            <Text style={styles.seriesText}>
              {subject.seasons ? `${subject.seasons} seasons` : 'Series'}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {subject.title}
      </Text>
      <Text style={styles.subtitle} numberOfLines={1}>
        {[subject.year, subject.genre?.split(',')[0]].filter(Boolean).join(' · ')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  poster: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: RADIUS,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  posterBlank: { justifyContent: 'center', padding: 12 },
  posterBlankText: { color: colors.text, fontSize: isTV ? 17 : 14, fontWeight: '700' },
  rating: {
    position: 'absolute',
    left: 6,
    top: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(12,10,18,0.78)',
  },
  ratingText: { color: '#fff', fontSize: isTV ? 12 : 10.5, fontWeight: '800' },
  series: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(12,10,18,0.78)',
  },
  seriesText: { color: colors.text, fontSize: isTV ? 12 : 10.5, fontWeight: '700' },
  title: {
    color: colors.text,
    fontSize: isTV ? 15 : 13,
    fontWeight: '700',
    marginTop: 6,
    paddingHorizontal: 2,
  },
  subtitle: { color: colors.muted, fontSize: isTV ? 12.5 : 11.5, marginTop: 2, paddingHorizontal: 2 },
});
