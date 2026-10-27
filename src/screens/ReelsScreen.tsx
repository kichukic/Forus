import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useTVEventHandler,
  useWindowDimensions,
  View,
  type ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchReels, type ReelCategory, type ReelItem as ReelItemType } from '../api/reels';
import { ReelItem } from '../components/ReelItem';
import type { Playable } from '../types';
import { colors, isTV } from '../theme';

const CATEGORIES: { id: ReelCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'cinema', label: 'Cinema' },
  { id: 'comedy', label: 'Comedy' },
  { id: 'trailer', label: 'Trailers' },
  { id: 'scenes', label: 'Scenes' },
];

const VIEWABILITY_CONFIG = {
  itemVisiblePercentThreshold: 65,
};

const useRemote: typeof useTVEventHandler = useTVEventHandler ?? (() => {});

type Props = {
  initialIndex?: number;
  onPlayFullMovie?: (item: Playable) => void;
  onClose?: () => void;
};

export function ReelsScreen({ initialIndex = 0, onPlayFullMovie, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const [category, setCategory] = useState<ReelCategory>('all');
  const [reels, setReels] = useState<ReelItemType[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [muted, setMuted] = useState(false);

  const listRef = useRef<FlatList<ReelItemType>>(null);

  // Load reels for the active category
  useEffect(() => {
    let alive = true;

    fetchReels(category)
      .then((items) => {
        if (!alive) return;
        setReels(items);
        setLoading(false);
        setActiveIndex(0);
      })
      .catch(() => {
        if (!alive) return;
        setReels([]);
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [category]);

  const selectCategory = (newCat: ReelCategory) => {
    setCategory(newCat);
    setLoading(true);
  };

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && typeof viewableItems[0].index === 'number') {
        setActiveIndex(viewableItems[0].index);
      }
    },
    [],
  );

  const onRemote = useCallback(
    (evt: { eventType?: string } | null) => {
      if (!isTV || !evt) return;
      if (evt.eventType === 'down') {
        const next = Math.min(reels.length - 1, activeIndex + 1);
        if (next !== activeIndex) {
          listRef.current?.scrollToIndex({ index: next, animated: true });
        }
      } else if (evt.eventType === 'up') {
        const prev = Math.max(0, activeIndex - 1);
        if (prev !== activeIndex) {
          listRef.current?.scrollToIndex({ index: prev, animated: true });
        }
      }
    },
    [activeIndex, reels.length],
  );

  useRemote(onRemote);

  return (
    <View style={styles.screen}>
      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading reels...</Text>
        </View>
      ) : reels.length === 0 ? (
        <View style={styles.centerLoading}>
          <Text style={styles.emptyTitle}>No reels found</Text>
          <Text style={styles.emptySubtitle}>Check your internet connection and try again</Text>
          <Pressable
            style={styles.retryBtn}
            onPress={() => {
              setLoading(true);
              fetchReels(category).then((it) => {
                setReels(it);
                setLoading(false);
              });
            }}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={reels}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <View style={{ height: windowHeight }}>
              <ReelItem
                item={item}
                isActive={index === activeIndex}
                shouldLoad={Math.abs(index - activeIndex) <= 1}
                muted={muted}
                onToggleMute={() => setMuted((m) => !m)}
                onPlayFullMovie={
                  item.relatedPlayable && onPlayFullMovie
                    ? () => onPlayFullMovie(item.relatedPlayable!)
                    : undefined
                }
                onBack={onClose}
              />
            </View>
          )}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          snapToInterval={windowHeight}
          snapToAlignment="start"
          decelerationRate="fast"
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={VIEWABILITY_CONFIG}
          initialScrollIndex={initialIndex > 0 && initialIndex < reels.length ? initialIndex : undefined}
          getItemLayout={(_, index) => ({
            length: windowHeight,
            offset: windowHeight * index,
            index,
          })}
        />
      )}

      {/* Floating Category Pills at Top */}
      {!loading && reels.length > 0 && (
        <View style={[styles.categoryBar, { top: insets.top + (onClose ? 48 : 10) }]}>
          {CATEGORIES.map((cat) => {
            const active = cat.id === category;
            return (
              <Pressable
                key={cat.id}
                onPress={() => selectCategory(cat.id)}
                style={[styles.catPill, active && styles.catPillActive]}
                hitSlop={6}
              >
                <Text style={[styles.catText, active && styles.catTextActive]}>
                  {cat.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0c0a12',
    gap: 12,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '500',
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    marginTop: 4,
  },
  retryBtn: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 22,
    backgroundColor: colors.accent,
    borderRadius: 20,
  },
  retryText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  categoryBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    zIndex: 20,
  },
  catPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  catPillActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  catText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
  },
  catTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
});
