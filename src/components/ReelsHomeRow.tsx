import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { fetchReels, type ReelItem } from '../api/reels';
import { FocusCard } from './FocusCard';
import { FocusRow } from './FocusRow';
import { SectionHeader } from './Section';
import { SkeletonLoader } from './SkeletonLoader';
import { colors, GUTTER, isTV, RADIUS, sz } from '../theme';

const REEL_CARD_WIDTH = isTV ? 160 : 115;
const REEL_CARD_HEIGHT = Math.round((REEL_CARD_WIDTH * 16) / 9);

type Props = {
  onOpenReel: (item: ReelItem, index: number) => void;
};

export function ReelsHomeRow({ onOpenReel }: Props) {
  const [reels, setReels] = useState<ReelItem[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetchReels('all')
      .then((items) => {
        if (alive) setReels(items.slice(0, 16));
      })
      .catch(() => {
        if (alive) setReels([]);
      });

    return () => {
      alive = false;
    };
  }, []);

  if (reels === null) {
    return (
      <View style={styles.container}>
        <SectionHeader title="Reels & Shorts" subtitle="Trending quick clips" />
        <SkeletonLoader
          columns={isTV ? 7 : 4}
          cardWidth={REEL_CARD_WIDTH}
          rows={1}
          style={styles.skeleton}
        />
      </View>
    );
  }

  if (reels.length === 0) return null;

  return (
    <View style={styles.container}>
      <SectionHeader title="Reels & Shorts" subtitle="Trending quick clips" />
      <FocusRow>
        <FlatList
          data={reels}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => (
            <FocusCard
              onPress={() => onOpenReel(item, index)}
              width={REEL_CARD_WIDTH}
              style={styles.card}
            >
              <Image
                source={{ uri: item.thumbnailUrl }}
                style={styles.thumbnail}
                contentFit="cover"
              />
              <LinearGradient
                colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.85)']}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.topBadge}>
                <Ionicons name="film" size={11} color="#ffffff" />
                <Text style={styles.badgeText}>REEL</Text>
              </View>
              <View style={styles.bottomInfo}>
                <Text style={styles.author} numberOfLines={1}>
                  {item.author}
                </Text>
                <Text style={styles.title} numberOfLines={2}>
                  {item.title}
                </Text>
              </View>
            </FocusCard>
          )}
        />
      </FocusRow>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: sz(16, 20),
  },
  skeleton: {
    paddingHorizontal: GUTTER,
  },
  list: {
    paddingHorizontal: GUTTER,
    gap: sz(10, 14),
  },
  card: {
    width: REEL_CARD_WIDTH,
    height: REEL_CARD_HEIGHT,
    borderRadius: RADIUS,
    overflow: 'hidden',
    backgroundColor: '#1b1726',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  topBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  bottomInfo: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    right: 6,
  },
  author: {
    color: colors.accent,
    fontSize: 9,
    fontWeight: '700',
    marginBottom: 2,
  },
  title: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 13,
  },
});
