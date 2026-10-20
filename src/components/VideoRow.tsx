import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, View } from 'react-native';
import { loadVideos, type Video } from '../api/youtube';
import { MOVIES, SHOWS, type VideoSource } from '../data/channels';
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

  return <VideoList title={source.name} videos={videos} failed={failed} onPlay={onPlay} />;
}

const NEW_ROW_SIZE = 24;

// The newest uploads across every show and movie channel, newest first.
export function NewRow({ onPlay }: { onPlay: (video: Video) => void }) {
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const sources = [...SHOWS, ...MOVIES];
    Promise.all(sources.map((s) => loadVideos(s).catch(() => [] as Video[])))
      .then((lists) => {
        const all = lists.flatMap((list, i) => list.map((v) => ({ ...v, channel: sources[i].name })));
        if (all.length === 0) return setFailed(true);
        all.sort((a, b) => b.published.localeCompare(a.published));
        setVideos(all.slice(0, NEW_ROW_SIZE));
      })
      .catch(() => setFailed(true));
  }, []);

  return <VideoList title="New today" videos={videos} failed={failed} onPlay={onPlay} />;
}

type ListProps = {
  title: string;
  videos: (Video & { channel?: string })[] | null;
  failed: boolean;
  onPlay: (video: Video) => void;
};

function VideoList({ title, videos, failed, onPlay }: ListProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.heading}>{title}</Text>
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
                {item.channel ? <Text style={styles.channel}>{item.channel} · </Text> : null}
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
  channel: { color: colors.accent, fontWeight: '700' },
  note: { color: colors.muted, fontSize: isTV ? 16 : 14, marginLeft: GUTTER },
  loading: { alignSelf: 'flex-start', marginLeft: GUTTER },
});
