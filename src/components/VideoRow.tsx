import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { loadVideoPage, loadVideos, searchVideos, type Video } from '../api/youtube';
import { MOVIES, SHOWS, TRUSTED_CHANNELS, type VideoSource } from '../data/channels';
import type { Theme } from '../data/themes';
import { CARD_HEIGHT, GUTTER, colors, isTV } from '../theme';
import { VideoCardContent } from './Cards';
import { FocusCard } from './FocusCard';
import { SectionHeader, SkeletonRow } from './Section';

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

  return (
    <VideoList title="New today" subtitle="Fresh uploads from every channel" videos={videos} failed={failed} onPlay={onPlay} />
  );
}

const FULL_MOVIE = /full movie|full length/i;
// A row of one or two cards looks broken; such themes are left out.
const MIN_THEME_RESULTS = 3;

// A themed row ("Mohanlal movies") filled by a search of the trusted channels.
// It disappears if the search finds too little.
export function ThemeRow({ theme, onPlay }: { theme: Theme; onPlay: (video: Video) => void }) {
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Film themes would otherwise pick up the channels' scenes and trailers.
    const moviesOnly = FULL_MOVIE.test(theme.query);
    searchVideos(theme.query, TRUSTED_CHANNELS)
      .then((results) => setVideos(results.filter((r) => !r.live && (!moviesOnly || FULL_MOVIE.test(r.title)))))
      .catch(() => setFailed(true));
  }, [theme]);

  if (failed || (videos && videos.length < MIN_THEME_RESULTS)) return null;
  return <VideoList title={theme.title} subtitle="Picked from official channels" videos={videos} failed={false} onPlay={onPlay} />;
}

type ListProps = {
  title: string;
  subtitle?: string;
  videos: (Video & { channel?: string })[] | null;
  failed: boolean;
  onPlay: (video: Video) => void;
  onEndReached?: () => void;
  loadingMore?: boolean;
};

function VideoList({ title, subtitle, videos, failed, onPlay, onEndReached, loadingMore }: ListProps) {
  return (
    <View style={styles.row}>
      <SectionHeader title={title} subtitle={subtitle} />
      {failed ? (
        <Text style={styles.note}>Couldn't load. Check the internet connection.</Text>
      ) : !videos ? (
        <SkeletonRow />
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
              <VideoCardContent
                image={item.thumbnail}
                title={cleanTitle(item.title)}
                subtitle={item.channel}
                duration={item.duration}
              />
            </FocusCard>
          )}
        />
      )}
    </View>
  );
}

// YouTube titles pile up "| Actor | Actor | Channel"; the part before the
// first bar is the actual name.
export function cleanTitle(title: string): string {
  const head = title.split('|')[0].trim();
  return head.length >= 4 ? head : title;
}

const styles = StyleSheet.create({
  row: { marginBottom: isTV ? 30 : 24 },
  list: { paddingHorizontal: GUTTER, paddingVertical: isTV ? 8 : 2 },
  note: { color: colors.muted, fontSize: isTV ? 16 : 14, marginLeft: GUTTER },
  more: { alignSelf: 'center', marginHorizontal: 24, height: CARD_HEIGHT },
});
