// The Favorites screen: a dedicated sanctuary for all movies, series,
// TorBox files, and videos the user has hearted across the app.
import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFavorites, type FavoriteItem } from '../data/favorites';
import { FavoriteHeart } from '../components/FavoriteHeart';
import { useNavScrollHide } from '../data/navChrome';
import { posterColour } from '../components/MovieboxPoster';
import { CARD_GAP, GUTTER, colors, sz, RADIUS } from '../theme';
import type { Playable } from '../types';
import type { MovieboxSubject } from '../api/moviebox';

type Props = {
  onPlay: (item: Playable) => void;
  onOpenMoviebox: (subject: MovieboxSubject) => void;
  onGoHome: () => void;
};

type FilterCategory = 'all' | 'movies' | 'torbox' | 'videos';

export function FavoritesScreen({ onPlay, onOpenMoviebox, onGoHome }: Props) {
  const insets = useSafeAreaInsets();
  const navScroll = useNavScrollHide();
  const allFavorites = useFavorites();
  const [filter, setFilter] = useState<FilterCategory>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let list = allFavorites;
    if (filter === 'movies') {
      list = list.filter((f) => f.kind === 'moviebox' || f.kind === 'movie');
    } else if (filter === 'torbox') {
      list = list.filter((f) => f.kind === 'file');
    } else if (filter === 'videos') {
      list = list.filter((f) => f.kind === 'video');
    }

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((f) => f.title.toLowerCase().includes(q));
    }
    return list;
  }, [allFavorites, filter, search]);

  const handleOpen = (item: FavoriteItem) => {
    if (item.kind === 'moviebox') {
      if (item.subjectId) {
        onOpenMoviebox({
          id: item.subjectId,
          title: item.title,
          kind: 'movie',
          poster: item.poster,
          year: item.year,
          genre: item.genre,
          rating: item.rating,
          hasResource: true,
          membersOnly: false,
          dubs: [],
        });
      } else {
        onPlay({
          kind: 'moviebox',
          subjectId: item.subjectId || item.id.replace('moviebox:', ''),
          season: item.season ?? 0,
          episode: item.episode ?? 0,
          title: item.title,
          poster: item.poster,
        });
      }
    } else if (item.kind === 'file') {
      onPlay({
        kind: 'file',
        source: (item.source as any) || 'torrents',
        itemId: item.itemId ?? 0,
        fileId: item.fileId ?? 0,
        title: item.title,
      });
    } else if (item.kind === 'video') {
      onPlay({
        kind: 'video',
        videoId: item.videoId || item.id.replace('yt:', ''),
        title: item.title,
      });
    } else if (item.kind === 'stream') {
      onPlay({
        kind: 'stream',
        url: item.url || '',
        title: item.title,
        poster: item.poster,
      });
    }
  };

  const { width } = useWindowDimensions();
  const columns = Math.max(2, Math.floor((width - GUTTER * 2 + CARD_GAP) / (sz(150, 190) + CARD_GAP)));
  const cardWidth = (width - GUTTER * 2 - CARD_GAP * (columns - 1)) / columns;

  const counts = useMemo(
    () => ({
      all: allFavorites.length,
      movies: allFavorites.filter((f) => f.kind === 'moviebox' || f.kind === 'movie').length,
      torbox: allFavorites.filter((f) => f.kind === 'file').length,
      videos: allFavorites.filter((f) => f.kind === 'video').length,
    }),
    [allFavorites],
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + GUTTER }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleWrap}>
          <Text style={styles.heading}>Favorites</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{allFavorites.length}</Text>
          </View>
        </View>
      </View>

      {/* Search Filter */}
      {allFavorites.length > 3 && (
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={sz(16, 19)} color={colors.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Filter your favorites…"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={10}>
              <Ionicons name="close-circle" size={sz(17, 20)} color={colors.muted} />
            </Pressable>
          )}
        </View>
      )}

      {/* Category Pills */}
      <View style={styles.filterRow}>
        <Pressable
          onPress={() => setFilter('all')}
          style={[styles.filterChip, filter === 'all' && styles.filterChipActive]}
        >
          <Text style={[styles.filterChipText, filter === 'all' && styles.filterChipTextActive]}>
            All ({counts.all})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setFilter('movies')}
          style={[styles.filterChip, filter === 'movies' && styles.filterChipActive]}
        >
          <Text style={[styles.filterChipText, filter === 'movies' && styles.filterChipTextActive]}>
            Movies & Shows ({counts.movies})
          </Text>
        </Pressable>
        {counts.torbox > 0 && (
          <Pressable
            onPress={() => setFilter('torbox')}
            style={[styles.filterChip, filter === 'torbox' && styles.filterChipActive]}
          >
            <Text style={[styles.filterChipText, filter === 'torbox' && styles.filterChipTextActive]}>
              TorBox ({counts.torbox})
            </Text>
          </Pressable>
        )}
        {counts.videos > 0 && (
          <Pressable
            onPress={() => setFilter('videos')}
            style={[styles.filterChip, filter === 'videos' && styles.filterChipActive]}
          >
            <Text style={[styles.filterChipText, filter === 'videos' && styles.filterChipTextActive]}>
              Videos ({counts.videos})
            </Text>
          </Pressable>
        )}
      </View>

      {/* List / Grid */}
      {filtered.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="heart" size={sz(36, 44)} color="rgba(239, 68, 68, 0.7)" />
          </View>
          <Text style={styles.emptyTitle}>
            {allFavorites.length === 0 ? 'No favorites yet' : 'No items match your filter'}
          </Text>
          <Text style={styles.emptySub}>
            {allFavorites.length === 0
              ? 'Tap the heart icon on any movie, show, or video to save it here for fast 1-tap watching.'
              : 'Try clearing your search keyword or switching categories.'}
          </Text>
          {allFavorites.length === 0 && (
            <Pressable onPress={onGoHome} style={styles.emptyBtn}>
              <Ionicons name="compass-outline" size={sz(17, 20)} color="#0c0a12" />
              <Text style={styles.emptyBtnText}>Explore Movies & Shows</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <FlatList
          key={columns}
          data={filtered}
          numColumns={columns}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + 110 }]}
          onScroll={(e) => navScroll(e.nativeEvent.contentOffset.y)}
          scrollEventThrottle={48}
          renderItem={({ item, index }) => (
            <FavoriteCard
              item={item}
              width={cardWidth}
              onPress={() => handleOpen(item)}
              isEndColumn={(index + 1) % columns === 0}
            />
          )}
        />
      )}
    </View>
  );
}

function FavoriteCard({
  item,
  width,
  onPress,
  isEndColumn,
}: {
  item: FavoriteItem;
  width: number;
  onPress: () => void;
  isEndColumn: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  const showFallback = !item.poster || imgError;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.cardWrap,
        { width, marginRight: isEndColumn ? 0 : CARD_GAP },
        pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
      ]}
    >
      <View style={styles.cardPoster}>
        {showFallback ? (
          <View
            style={[
              StyleSheet.absoluteFill,
              styles.posterFallback,
              { backgroundColor: posterColour(item.title) },
            ]}
          >
            <Ionicons
              name={item.kind === 'file' ? 'folder-outline' : item.kind === 'video' ? 'logo-youtube' : 'film-outline'}
              size={sz(28, 34)}
              color="rgba(255,255,255,0.7)"
            />
            <Text style={styles.fallbackText} numberOfLines={2}>
              {item.title}
            </Text>
          </View>
        ) : (
          <Image
            source={{ uri: item.poster }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
            onError={() => setImgError(true)}
          />
        )}

        {/* Rating */}
        {item.rating ? (
          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={sz(10, 11)} color="#ffd166" />
            <Text style={styles.ratingText}>{item.rating}</Text>
          </View>
        ) : null}

        {/* Heart action */}
        <View style={styles.heartContainer}>
          <FavoriteHeart item={item} size={sz(16, 18)} />
        </View>

        {/* Kind badge */}
        <View style={styles.kindBadge}>
          <Text style={styles.kindBadgeText}>
            {item.kind === 'moviebox' ? 'MovieBox' : item.kind === 'file' ? 'TorBox' : 'Video'}
          </Text>
        </View>
      </View>

      <Text style={styles.cardTitle} numberOfLines={2}>
        {item.title}
      </Text>
      <Text style={styles.cardSub} numberOfLines={1}>
        {[item.year, item.genre?.split(',')[0], item.channel].filter(Boolean).join(' · ')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: GUTTER,
    marginBottom: 12,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  heading: {
    color: colors.text,
    fontSize: sz(26, 32),
    fontWeight: '900',
  },
  countBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  countBadgeText: {
    color: '#ef4444',
    fontSize: sz(12, 14),
    fontWeight: '800',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: GUTTER,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: sz(8, 10),
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: sz(14, 16),
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginHorizontal: GUTTER,
    marginBottom: 14,
  },
  filterChip: {
    backgroundColor: colors.surface,
    paddingHorizontal: sz(12, 14),
    paddingVertical: sz(6, 8),
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  filterChipText: {
    color: colors.muted,
    fontSize: sz(12, 14),
    fontWeight: '700',
  },
  filterChipTextActive: {
    color: '#0c0a12',
    fontWeight: '800',
  },
  grid: {
    paddingHorizontal: GUTTER,
    paddingTop: 6,
  },
  cardWrap: {
    marginBottom: 16,
  },
  cardPoster: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: RADIUS,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    position: 'relative',
    marginBottom: 8,
  },
  posterFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    gap: 6,
  },
  fallbackText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: sz(11, 13),
    fontWeight: '700',
    textAlign: 'center',
  },
  ratingBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  ratingText: {
    color: '#ffd166',
    fontSize: sz(10, 11),
    fontWeight: '800',
  },
  heartContainer: {
    position: 'absolute',
    top: 6,
    right: 6,
  },
  kindBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  kindBadgeText: {
    color: colors.muted,
    fontSize: sz(9, 10),
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  cardTitle: {
    color: colors.text,
    fontSize: sz(13, 15),
    fontWeight: '700',
    lineHeight: sz(17, 20),
  },
  cardSub: {
    color: colors.muted,
    fontSize: sz(11, 13),
    marginTop: 2,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyIconCircle: {
    width: sz(72, 88),
    height: sz(72, 88),
    borderRadius: sz(36, 44),
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  emptyTitle: {
    color: colors.text,
    fontSize: sz(18, 22),
    fontWeight: '800',
    textAlign: 'center',
  },
  emptySub: {
    color: colors.muted,
    fontSize: sz(13, 15),
    textAlign: 'center',
    lineHeight: sz(18, 22),
  },
  emptyBtn: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 22,
  },
  emptyBtnText: {
    color: '#0c0a12',
    fontSize: sz(14, 16),
    fontWeight: '800',
  },
});
