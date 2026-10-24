import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { thumbnailUrl } from '../api/youtube';
import { LiveTileContent, VideoCardContent } from '../components/Cards';
import { FileCardContent } from '../components/FileCardContent';
import { FocusCard } from '../components/FocusCard';
import { ListFrame } from '../components/ListFrame';
import { cleanTitle } from '../components/VideoRow';
import { LIVE_NEWS } from '../data/channels';
import { playableKey } from '../data/history';
import { CARD_GAP, CARD_WIDTH, GUTTER, colors, isTV, sz } from '../theme';
import type { Playable } from '../types';

type Props = {
  history: Playable[];
  onPlay: (item: Playable) => void;
  onClear: () => void;
};

// Everything watched recently, as a grid, newest first.
export function HistoryScreen({ history, onPlay, onClear }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // On TV as many cards as fit at the usual card size.
  const columns = isTV
    ? Math.max(4, Math.floor((width - GUTTER * 2 + CARD_GAP) / (CARD_WIDTH + CARD_GAP)))
    : width > 600
      ? 3
      : 2;
  const cardWidth = (width - GUTTER * 2 - CARD_GAP * (columns - 1)) / columns;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + GUTTER }]}>
      <View style={styles.header}>
        <Text style={styles.title}>History</Text>
        {history.length > 0 && (
          <Pressable onPress={onClear} style={({ pressed }) => [styles.clear, pressed && styles.pressed]}>
            <Ionicons name="trash-outline" size={16} color={colors.muted} />
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
        )}
      </View>

      {history.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="time-outline" size={48} color={colors.faint} />
          <Text style={styles.emptyTitle}>Nothing watched yet</Text>
          <Text style={styles.emptyText}>Videos, live channels and TorBox files you play show up here.</Text>
        </View>
      ) : (
        <ListFrame>
          {(height) => (
            <FlatList
              key={columns}
              data={history}
              numColumns={columns}
              keyExtractor={playableKey}
              // An exact height on TV; see ListFrame.
              style={height ? { height } : styles.list}
              contentContainerStyle={styles.grid}
              renderItem={({ item, index }) => (
                <FocusCard
                  width={cardWidth}
                  // TV: the remote starts on the most recent item.
                  preferredFocus={index === 0}
                  onPress={() => onPlay(item)}
                  style={{ marginRight: (index + 1) % columns === 0 ? 0 : CARD_GAP, marginBottom: 18 }}
                >
                  <Card item={item} />
                </FocusCard>
              )}
            />
          )}
        </ListFrame>
      )}
    </View>
  );
}

function Card({ item }: { item: Playable }) {
  if (item.kind === 'live') {
    const color = LIVE_NEWS.find((c) => c.channelId === item.channelId)?.color ?? colors.live;
    return <LiveTileContent name={item.title} color={color} />;
  }
  if (item.kind === 'file') return <FileCardContent fileName={item.title} detail="TorBox" />;
  if (item.kind === 'moviebox') {
    return <VideoCardContent image={item.poster} title={item.title} subtitle="MovieBox" />;
  }
  if (item.kind === 'stream') {
    return <VideoCardContent image={item.poster} title={item.title} subtitle="Stream" />;
  }
  return <VideoCardContent image={thumbnailUrl(item.videoId)} title={cleanTitle(item.title)} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: GUTTER, marginBottom: 16 },
  title: { flex: 1, color: colors.text, fontSize: sz(26, 32), fontWeight: '900' },
  clear: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: colors.surface,
  },
  pressed: { opacity: 0.6 },
  clearText: { color: colors.muted, fontWeight: '700' },
  grid: { paddingHorizontal: GUTTER, paddingBottom: 120 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 10 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  emptyText: { color: colors.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
