import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, View } from 'react-native';
import { loadVideoPage, loadVideos, type Video } from '../api/youtube';
import { MOVIES, SHOWS, type VideoSource } from '../data/channels';
import { GUTTER, colors, isTV } from '../theme';
import { FocusCard, cardImageStyle } from './FocusCard';

type Props = {
  source: VideoSource;
  onPlay: (video: Video) => void;
};

// A channel's row. It starts with the newest uploads and keeps loading older
// ones as it is scrolled sideways, for as long as the channel has any.
export function VideoRow({ source, onPlay }: Props) {
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const continuation = useRef<string | undefined>(undefined);
  const busy = useRef(false);

  useEffect(() => {
    loadVideoPage(source)
      .then((page) => {
        continuation.current = page.continuation;
        setVideos(page.videos);
      })
      .catch(() => setFailed(true));
  }, [source]);

  const loadMore = () => {
    if (busy.current || !continuation.current) return;
    busy.current = true;
    setLoadingMore(true);
    loadVideoPage(source, continuation.current)
      .then((page) => {
        continuation.current = page.continuation;
        // Pages can overlap when the channel uploads in the meantime.
        setVideos((old) => {
          const seen = new Set(old?.map((v) => v.id));
          return [...(old ?? []), ...page.videos.filter((v) => !seen.has(v.id))];
        });
      })
      .catch(() => {})
      .finally(() => {
        busy.current = false;
        setLoadingMore(false);
      });
  };

  return (
    <VideoList
      title={source.name}
      videos={videos}
      failed={failed}
      onPlay={onPlay}
      onEndReached={loadMore}
      loadingMore={loadingMore}
    />
  );
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
  onEndReached?: () => void;
  loadingMore?: boolean;
};

function VideoList({ title, videos, failed, onPlay, onEndReached, loadingMore }: ListProps) {
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
          // Start fetching while a couple of screens of cards are still ahead.
          onEndReached={onEndReached}
          onEndReachedThreshold={2}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color={colors.accent} style={styles.more} /> : null
          }
          renderItem={({ item }) => (
            <FocusCard onPress={() => onPlay(item)}>
              <View>
                <Image source={{ uri: item.thumbnail }} style={cardImageStyle} />
                {item.duration ? <Text style={styles.duration}>{item.duration}</Text> : null}
              </View>
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
  more: { alignSelf: 'center', marginHorizontal: 24 },
  duration: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
});
