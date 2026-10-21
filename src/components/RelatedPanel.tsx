// The part under the video in portrait: the title block (which can be dragged
// down to shrink the player) and a scrolling list of what to watch next.
import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderHandlers,
} from 'react-native';
import { Image } from 'expo-image';
import { findArtwork } from '../api/artwork';
import { getRelated, type RelatedCard } from '../api/related';
import { colors } from '../theme';
import type { Playable } from '../types';

type Props = {
  item: Playable;
  onPlay: (item: Playable) => void;
  dragHandlers?: GestureResponderHandlers;
  // The title block for this player.
  children: ReactNode;
};

const THUMB_WIDTH = 160;
const THUMB_HEIGHT = 90;

export function RelatedPanel({ item, onPlay, dragHandlers, children }: Props) {
  const [cards, setCards] = useState<RelatedCard[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCards(null);
    getRelated(item)
      .then((c) => !cancelled && setCards(c))
      .catch(() => !cancelled && setCards([]));
    return () => {
      cancelled = true;
    };
  }, [item]);

  return (
    <View style={styles.panel}>
      {/* Only the title block drags; the list below scrolls instead. */}
      <View style={styles.header} {...dragHandlers}>
        <View style={styles.grabber} />
        {/* Leaves room for the player's ✕ in the top right. */}
        <View style={styles.titleBlock}>{children}</View>
      </View>

      <FlatList
        data={cards ?? []}
        keyExtractor={(c) => c.key}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Text style={styles.heading}>{item.kind === 'live' ? 'More live channels' : 'Up next'}</Text>
        }
        ListEmptyComponent={
          cards === null ? (
            <ActivityIndicator color={colors.accent} style={styles.loading} />
          ) : (
            <Text style={styles.empty}>Nothing related right now.</Text>
          )
        }
        renderItem={({ item: card }) => <RelatedRow card={card} onPress={() => onPlay(card.item)} />}
      />
    </View>
  );
}

function RelatedRow({ card, onPress }: { card: RelatedCard; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <Thumbnail card={card} />
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={3}>
          {card.title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {card.subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

function Thumbnail({ card }: { card: RelatedCard }) {
  const [art, setArt] = useState<string | null>(null);

  useEffect(() => {
    if (!card.fileName) return;
    let cancelled = false;
    findArtwork(card.fileName)
      .then((a) => !cancelled && setArt(a?.image ?? null))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [card.fileName]);

  if (card.liveColor) {
    return (
      <View style={[styles.thumb, styles.liveThumb, { backgroundColor: card.liveColor }]}>
        <Text style={styles.liveBadge}>● LIVE</Text>
      </View>
    );
  }
  const uri = card.thumbnail ?? art;
  return uri ? (
    <Image source={uri} style={styles.thumb} contentFit="cover" transition={150} cachePolicy="memory-disk" recyclingKey={uri} />
  ) : (
    <View style={[styles.thumb, styles.blank]} />
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.muted,
    opacity: 0.5,
    marginBottom: 12,
  },
  titleBlock: { paddingRight: 40 },
  list: { paddingBottom: 24 },
  heading: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginHorizontal: 16,
    marginBottom: 8,
  },
  loading: { marginTop: 24 },
  empty: { color: colors.muted, fontSize: 14, marginHorizontal: 16 },
  row: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 6 },
  pressed: { opacity: 0.6 },
  thumb: { width: THUMB_WIDTH, height: THUMB_HEIGHT, borderRadius: 8, backgroundColor: colors.surface },
  liveThumb: { padding: 8, justifyContent: 'flex-end' },
  liveBadge: { color: '#fff', fontSize: 12, fontWeight: '800' },
  blank: { backgroundColor: '#1f2533' },
  text: { flex: 1, marginLeft: 12 },
  title: { color: colors.text, fontSize: 14, fontWeight: '600', lineHeight: 19 },
  subtitle: { color: colors.muted, fontSize: 12, marginTop: 4 },
});
