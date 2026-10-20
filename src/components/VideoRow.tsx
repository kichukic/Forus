import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, View } from 'react-native';
import { loadVideos, type Video } from '../api/youtube';
import type { VideoSource } from '../data/channels';
import { GUTTER, colors, isTV } from '../theme';
import { FocusCard, cardImageStyle } from './FocusCard';

type Props = {
  source: VideoSource;
  onPlay: (video: Video) => void;
};

export function VideoRow({ source, onPlay }: Props) {
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    loadVideos(source)
      .then(setVideos)
      .catch(() => setFailed(true));
  }, [source]);

  return (
    <View style={styles.row}>
      <Text style={styles.heading}>{source.name}</Text>
      {failed ? (
        <Text style={styles.note}>Couldn't load. Check the internet connection.</Text>
      ) : !videos ? (
        <ActivityIndicator color={colors.accent} style={styles.loading} />
      ) : videos.length === 0 ? (
        <Text style={styles.note}>Nothing new right now.</Text>
      ) : (
        <FlatList
          horizontal
          data={videos}
          keyExtractor={(v) => v.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <FocusCard onPress={() => onPlay(item)}>
              <Image source={{ uri: item.thumbnail }} style={cardImageStyle} />
              <Text style={styles.title} numberOfLines={2}>
                {item.title}
              </Text>
            </FocusCard>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: isTV ? 28 : 20 },
  heading: {
    color: colors.text,
    fontSize: isTV ? 22 : 18,
    fontWeight: '700',
    marginBottom: isTV ? 10 : 4,
    marginLeft: GUTTER,
  },
  list: { paddingHorizontal: GUTTER, paddingVertical: 10 },
  title: { color: colors.text, fontSize: isTV ? 14 : 13, padding: 8, height: isTV ? 52 : 50 },
  note: { color: colors.muted, fontSize: isTV ? 16 : 14, marginLeft: GUTTER },
  loading: { alignSelf: 'flex-start', marginLeft: GUTTER },
});
