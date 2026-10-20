import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatSize, getApiKey, listVideoFiles, type TorboxFile } from '../api/torbox';
import { searchVideos, type SearchResult } from '../api/youtube';
import { FileCardContent } from '../components/FileCardContent';
import { FocusCard, cardImageStyle } from '../components/FocusCard';
import { TRUSTED_CHANNELS } from '../data/channels';
import { GUTTER, colors, isTV } from '../theme';
import type { Playable } from '../types';

type Props = {
  onPlay: (item: Playable) => void;
};

type Result = { type: 'youtube'; video: SearchResult } | { type: 'torbox'; file: TorboxFile };

// Typing on a TV remote is slow, so a search runs once typing pauses.
const DEBOUNCE_MS = 600;

export function SearchScreen({ onPlay }: Props) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const torboxFiles = useRef<TorboxFile[] | null>(null);
  const latest = useRef('');

  // TorBox files are matched locally, so the list is fetched once per visit.
  useEffect(() => {
    getApiKey()
      .then((key) => (key ? listVideoFiles(key) : []))
      .then((files) => (torboxFiles.current = files))
      .catch(() => (torboxFiles.current = []));
  }, []);

  useEffect(() => {
    const q = query.trim();
    latest.current = q;
    if (q.length < 2) {
      setResults(null);
      setError(null);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const words = q.toLowerCase().split(/\s+/);
        const files = (torboxFiles.current ?? []).filter((f) =>
          words.every((w) => f.name.toLowerCase().replace(/[._]/g, ' ').includes(w)),
        );
        const videos = await searchVideos(q, TRUSTED_CHANNELS);
        if (latest.current !== q) return;
        setResults([
          ...files.map((file) => ({ type: 'torbox' as const, file })),
          ...videos.map((video) => ({ type: 'youtube' as const, video })),
        ]);
      } catch {
        if (latest.current === q) setError("Couldn't search. Check the internet connection.");
      } finally {
        if (latest.current === q) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const play = (r: Result) =>
    r.type === 'torbox'
      ? onPlay({ kind: 'file', source: r.file.source, itemId: r.file.itemId, fileId: r.file.fileId, title: r.file.name })
      : onPlay({ kind: 'video', videoId: r.video.id, title: r.video.title });

  // The grid reflows when the phone rotates.
  const { width } = useWindowDimensions();
  const columns = Math.max(1, Math.floor((width - GUTTER * 2) / (isTV ? 272 : 212)));

  return (
    <View style={[styles.screen, { paddingTop: insets.top + GUTTER }]}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search shows, movies, news…"
        placeholderTextColor={colors.muted}
        autoFocus
        autoCorrect={false}
        returnKeyType="search"
        style={styles.input}
        hasTVPreferredFocus
      />
      <Text style={styles.note}>Official channels only, plus files in your TorBox.</Text>

      {loading && <ActivityIndicator color={colors.accent} style={styles.spinner} />}
      {error && <Text style={styles.note}>{error}</Text>}
      {results && results.length === 0 && !loading && (
        <Text style={styles.note}>Nothing found on the official channels or in your TorBox.</Text>
      )}

      {results && results.length > 0 && (
        <FlatList
          key={columns}
          data={results}
          numColumns={columns}
          keyExtractor={(r) =>
            r.type === 'youtube' ? `yt:${r.video.id}` : `tb:${r.file.source}:${r.file.itemId}:${r.file.fileId}`
          }
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => (
            <View style={styles.cell}>
              <FocusCard onPress={() => play(item)}>
                {item.type === 'torbox' ? (
                  <FileCardContent fileName={item.file.name} detail={`TorBox · ${formatSize(item.file.size)}`} />
                ) : (
                  <>
                    <View>
                      <Image source={{ uri: item.video.thumbnail }} style={cardImageStyle} />
                      <Text style={[styles.badge, item.video.live && styles.liveBadge]}>
                        {item.video.live ? '● LIVE' : item.video.duration}
                      </Text>
                    </View>
                    <View style={styles.caption}>
                      <Text style={styles.title} numberOfLines={1}>
                        {item.video.title}
                      </Text>
                      <Text style={styles.detail} numberOfLines={1}>
                        {item.video.channel}
                        {item.video.published ? ` · ${item.video.published}` : ''}
                      </Text>
                    </View>
                  </>
                )}
              </FocusCard>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  input: {
    marginHorizontal: GUTTER,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: isTV ? 22 : 17,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
  },
  note: { color: colors.muted, fontSize: isTV ? 15 : 13, marginHorizontal: GUTTER, marginTop: 8 },
  spinner: { marginTop: 24 },
  grid: { paddingHorizontal: GUTTER - 4, paddingVertical: 16 },
  cell: { padding: 4, marginBottom: 8 },
  badge: {
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
  liveBadge: { backgroundColor: colors.live },
  caption: { padding: 8, height: isTV ? 52 : 50, justifyContent: 'center' },
  title: { color: colors.text, fontSize: isTV ? 14 : 13, fontWeight: '700' },
  detail: { color: colors.muted, fontSize: isTV ? 12 : 11, marginTop: 2 },
});
