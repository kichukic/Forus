import { memo, useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { loadVideoPage, loadVideos, searchVideoPage, stripEmoji, type Video } from '../api/youtube';
import { FULL_MOVIE, MOVIES, SHOWS, TRUSTED_CHANNELS, type VideoSource } from '../data/channels';
import { shareOnLongPress } from '../chat/share';
import { recallRow, rememberRow } from '../data/rowMemory';
import type { Theme } from '../data/themes';
import { CARD_GAP, CARD_WIDTH, GUTTER, ROW_PAD, colors, isTV, sz } from '../theme';
import { VideoCardContent } from './Cards';
import { FocusCard } from './FocusCard';
import { FocusRow } from './FocusRow';
import { rowListProps } from './rowList';
import { SectionHeader } from './Section';
import { SkeletonLoader } from './SkeletonLoader';

type Props = {
  source: VideoSource;
  onPlay: (video: Video) => void;
};

// A channel's row. It starts with the newest uploads and keeps loading older
// ones as it is scrolled sideways, for as long as the channel has any.
export const VideoRow = memo(function VideoRow({ source, onPlay }: Props) {
  const memoryKey = `channel:${source.channelId}`;
  // A row built again picks up where it was: same cards, same place to go on.
  const [recalled] = useState(() => recallRow<Video>(memoryKey));
  const [videos, setVideos] = useState<Video[] | null>(recalled?.videos ?? null);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const continuation = useRef<string | undefined>(recalled?.continuation);
  const busy = useRef(false);

  useEffect(() => {
    if (videos) rememberRow(memoryKey, { videos, continuation: continuation.current });
  }, [videos, memoryKey]);

  useEffect(() => {
    if (recalled) return;
    loadVideoPage(source)
      .then((page) => {
        continuation.current = page.continuation;
        setVideos(page.videos);
      })
      .catch(() => setFailed(true));
  }, [source, recalled]);

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
});

const NEW_ROW_SIZE = 24;
const NEW_ROW_SOURCES = [...SHOWS, ...MOVIES];

type ChannelVideo = Video & { channel: string };
type NewRowMemory = { pool: ChannelVideo[]; older: (string | undefined | null)[] };

// The newest uploads across every show and movie channel, newest first. It
// shows a batch at a time as it is scrolled, and once the newest are all out
// it goes on to older uploads, taking turns between the channels.
export const NewRow = memo(function NewRow({ onPlay }: { onPlay: (video: Video) => void }) {
  const [recalled] = useState(() => recallRow<ChannelVideo, NewRowMemory>('new'));
  const [videos, setVideos] = useState<ChannelVideo[] | null>(recalled?.videos ?? null);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Everything found so far; the row shows the front of it.
  const pool = useRef<ChannelVideo[]>(recalled?.extra?.pool ?? []);
  // Where each channel's older uploads carry on; null once a channel has no more.
  const older = useRef<(string | undefined | null)[]>(recalled?.extra?.older ?? NEW_ROW_SOURCES.map(() => undefined));
  const busy = useRef(false);

  useEffect(() => {
    if (videos) rememberRow<ChannelVideo, NewRowMemory>('new', { videos, extra: { pool: pool.current, older: older.current } });
  }, [videos]);

  useEffect(() => {
    if (recalled) return;
    Promise.all(NEW_ROW_SOURCES.map((s) => loadVideos(s).catch(() => [] as Video[])))
      .then((lists) => {
        const all = lists.flatMap((list, i) => list.map((v) => ({ ...v, channel: NEW_ROW_SOURCES[i].name })));
        if (all.length === 0) return setFailed(true);
        all.sort((a, b) => b.published.localeCompare(a.published));
        pool.current = all;
        setVideos(all.slice(0, NEW_ROW_SIZE));
      })
      .catch(() => setFailed(true));
  }, [recalled]);

  const loadMore = () => {
    const shown = videos?.length ?? 0;
    if (busy.current || !shown) return;
    if (shown < pool.current.length) {
      setVideos(pool.current.slice(0, shown + NEW_ROW_SIZE));
      return;
    }
    const open = NEW_ROW_SOURCES.map((_, i) => i).filter((i) => older.current[i] !== null);
    if (!open.length) return;

    busy.current = true;
    setLoadingMore(true);
    Promise.all(
      open.map((i) =>
        loadVideoPage(NEW_ROW_SOURCES[i], older.current[i] ?? undefined)
          .then((page) => {
            older.current[i] = page.continuation ?? null;
            return page.videos.map((v) => ({ ...v, channel: NEW_ROW_SOURCES[i].name }));
          })
          .catch(() => [] as ChannelVideo[]),
      ),
    )
      .then((lists) => {
        // One from each channel in turn, so no channel floods the row.
        const seen = new Set(pool.current.map((v) => v.id));
        const longest = Math.max(0, ...lists.map((l) => l.length));
        for (let n = 0; n < longest; n++) {
          for (const list of lists) {
            const v = list[n];
            if (v && !seen.has(v.id)) {
              seen.add(v.id);
              pool.current.push(v);
            }
          }
        }
        setVideos(pool.current.slice(0, shown + NEW_ROW_SIZE));
      })
      .finally(() => {
        busy.current = false;
        setLoadingMore(false);
      });
  };

  return (
    <VideoList
      title="New today"
      subtitle="Fresh uploads from every channel"
      videos={videos}
      failed={failed}
      onPlay={onPlay}
      onEndReached={loadMore}
      loadingMore={loadingMore}
    />
  );
});

// A row of one or two cards looks broken; such themes are left out.
const MIN_THEME_RESULTS = 3;

// A themed row ("Mohanlal movies") filled by a search of the trusted channels,
// reading further into the search as it is scrolled. It disappears if the
// search finds too little.
export const ThemeRow = memo(function ThemeRow({ theme, onPlay }: { theme: Theme; onPlay: (video: Video) => void }) {
  const memoryKey = `theme:${theme.query}`;
  const [recalled] = useState(() => recallRow<Video>(memoryKey));
  const [videos, setVideos] = useState<Video[] | null>(recalled?.videos ?? null);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const continuation = useRef<string | undefined>(recalled?.continuation);
  const busy = useRef(false);
  // Film themes would otherwise pick up the channels' scenes and trailers.
  const moviesOnly = FULL_MOVIE.test(theme.query);
  const keep = (r: Video & { live: boolean }) => !r.live && (!moviesOnly || FULL_MOVIE.test(r.title));

  useEffect(() => {
    if (videos) rememberRow(memoryKey, { videos, continuation: continuation.current });
  }, [videos, memoryKey]);

  useEffect(() => {
    if (recalled) return;
    searchVideoPage(theme.query, TRUSTED_CHANNELS)
      .then((page) => {
        continuation.current = page.continuation;
        setVideos(page.results.filter(keep));
      })
      .catch(() => setFailed(true));
    // keep only depends on the theme.
  }, [theme, recalled]);

  const loadMore = () => {
    if (busy.current || !continuation.current) return;
    busy.current = true;
    setLoadingMore(true);
    searchVideoPage(theme.query, TRUSTED_CHANNELS, continuation.current)
      .then((page) => {
        continuation.current = page.continuation;
        setVideos((old) => {
          const seen = new Set(old?.map((v) => v.id));
          return [...(old ?? []), ...page.results.filter((r) => keep(r) && !seen.has(r.id))];
        });
      })
      // A failed batch ends the row rather than retrying on every scroll.
      .catch(() => (continuation.current = undefined))
      .finally(() => {
        busy.current = false;
        setLoadingMore(false);
      });
  };

  if (failed || (videos && videos.length < MIN_THEME_RESULTS)) return null;
  return (
    <VideoList
      title={theme.title}
      subtitle="Picked from official channels"
      videos={videos}
      failed={false}
      onPlay={onPlay}
      onEndReached={loadMore}
      loadingMore={loadingMore}
    />
  );
});

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
        <Text style={styles.note}>{"Couldn't load. Check the internet connection."}</Text>
      ) : !videos ? (
        <SkeletonLoader columns={isTV ? 7 : 3} cardWidth={CARD_WIDTH} rows={1} style={styles.loading} />
      ) : videos.length === 0 ? (
        <Text style={styles.note}>Nothing new right now.</Text>
      ) : (
        <FocusRow>
          <FlatList
            {...rowListProps}
            horizontal
            data={videos}
            keyExtractor={(v) => v.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.list}
            // Start fetching while a couple of screens of cards are still ahead.
            onEndReached={onEndReached}
            onEndReachedThreshold={2}
            ListFooterComponent={
              // Only there while more is really loading, so it can move.
              loadingMore ? <SkeletonLoader columns={2} cardWidth={CARD_WIDTH} rows={1} style={styles.more} /> : null
            }
            renderItem={({ item }) => (
              <FocusCard onPress={() => onPlay(item)} onLongPress={shareOnLongPress(item.id, item.title)}>
                <VideoCardContent
                  image={item.thumbnail}
                  title={cleanTitle(item.title)}
                  subtitle={item.channel}
                  duration={item.duration}
                  favoriteItem={{
                    id: `yt:${item.id}`,
                    kind: 'video',
                    title: cleanTitle(item.title),
                    poster: item.thumbnail,
                    channel: item.channel,
                    duration: item.duration,
                    videoId: item.id,
                  }}
                />
              </FocusCard>
            )}
          />
        </FocusRow>
      )}
    </View>
  );
}

const GENERIC_PREFIX =
  /^(new|superhit|latest|super hit|blockbuster|classic)\s+(malayalam|hindi|action|comedy|romantic|full|hd|\d{4})*\s*(movie|movies|cinema|film|full movie|full length)?$/i;

// YouTube titles pile up "| Actor | Actor | Channel"; the part before the
// first bar is usually the actual name unless it is generic channel boilerplate.
export function cleanTitle(title: string): string {
  // Titles saved before emoji were stripped (history) still carry them.
  const plain = stripEmoji(title);
  const parts = plain.split('|').map((p) => p.trim()).filter(Boolean);
  let head = parts[0] || plain;
  if (parts.length > 1 && GENERIC_PREFIX.test(head)) {
    head = parts[1];
  }
  return head.length >= 4 ? head : plain;
}

const styles = StyleSheet.create({
  row: { marginBottom: sz(24, 30) },
  list: { paddingHorizontal: GUTTER, paddingVertical: ROW_PAD },
  note: { color: colors.muted, fontSize: sz(14, 16), marginLeft: GUTTER },
  // The cards run off the right edge, as a real row's do.
  loading: { paddingLeft: GUTTER, paddingVertical: ROW_PAD, overflow: 'hidden' },
  more: { alignSelf: 'flex-start', marginLeft: CARD_GAP },
});
