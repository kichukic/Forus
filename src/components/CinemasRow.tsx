import { memo, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import {
  fetchMovieDbDetails,
  fetchMovieDbNowPlaying,
  fetchMovieDbTrending,
  type MovieDbItem,
} from '../api/moviedbbox';
import type { CatalogMovie } from '../api/catalog';
import { FocusCard } from './FocusCard';
import { FocusRow } from './FocusRow';
import { FavoriteHeart } from './FavoriteHeart';
import { SectionHeader } from './Section';
import { SkeletonLoader } from './SkeletonLoader';
import { showToast } from '../data/toasts';
import { shareOnLongPress } from '../chat/share';
import { GUTTER, RADIUS, colors, isTV, sz } from '../theme';
import { POSTER_HEIGHT, POSTER_ROW_HEIGHT, POSTER_ROW_PROPS, POSTER_WIDTH, posterColour } from './MovieboxPoster';

type Props = {
  title?: string;
  subtitle?: string;
  onOpenMovie: (movie: CatalogMovie) => void;
  version?: number;
};

export const CinemasRow = memo(function CinemasRow({
  title = 'In Cinemas Now',
  subtitle = 'Latest theatrical releases',
  onOpenMovie,
  version = 0,
}: Props) {
  const [items, setItems] = useState<MovieDbItem[] | null>(null);
  const [resolvingId, setResolvingId] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const nowPlaying = await fetchMovieDbNowPlaying(1);
        if (nowPlaying && nowPlaying.length > 0) {
          if (alive) setItems(nowPlaying);
          return;
        }
        const trending = await fetchMovieDbTrending('movie', 1);
        if (alive) setItems(trending ?? []);
      } catch {
        if (alive) setItems([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [version]);

  const handlePress = async (item: MovieDbItem) => {
    if (resolvingId) return;
    setResolvingId(item.id);
    try {
      const details = await fetchMovieDbDetails(item).catch(() => null);
      const resolvedId = details?.imdbId || `moviedb:${item.id}`;
      const movie: CatalogMovie = {
        id: resolvedId,
        title: item.title,
        year: item.year,
        poster: item.poster,
        background: item.backdrop,
        genres: details?.genres,
        description: details?.overview || item.overview,
        runtime: details?.runtime ? `${details.runtime} min` : undefined,
      };
      onOpenMovie(movie);
    } catch {
      showToast({ text: 'Could not load cinema details' });
    } finally {
      setResolvingId(null);
    }
  };

  if (items === null) {
    return (
      <View style={styles.row}>
        <SectionHeader title={title} subtitle={subtitle} />
        <SkeletonLoader columns={isTV ? 7 : 3} cardWidth={POSTER_WIDTH} rows={1} style={styles.loading} />
      </View>
    );
  }

  if (items.length === 0) return null;

  return (
    <View style={styles.row}>
      <SectionHeader title={title} subtitle={subtitle} />
      <FocusRow>
        <FlatList
          horizontal
          data={items}
          keyExtractor={(item) => String(item.id)}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.list}
          style={{ height: POSTER_ROW_HEIGHT }}
          {...POSTER_ROW_PROPS}
          renderItem={({ item }) => {
            const isResolving = resolvingId === item.id;
            return (
              <FocusCard
                onPress={() => handlePress(item)}
                onLongPress={shareOnLongPress({
                  kind: 'movie',
                  id: String(item.id),
                  title: item.title,
                  poster: item.poster,
                  year: item.year,
                })}
                width={POSTER_WIDTH}
              >
                <View style={styles.cardContainer}>
                  <View style={styles.poster}>
                    {item.poster ? (
                      <Image source={{ uri: item.poster }} style={StyleSheet.absoluteFill} contentFit="cover" />
                    ) : (
                      <View style={[StyleSheet.absoluteFill, styles.posterBlank, { backgroundColor: posterColour(item.title) }]}>
                        <Text style={styles.posterBlankText} numberOfLines={3}>
                          {item.title}
                        </Text>
                      </View>
                    )}

                    {/* Cinema / Year Tag */}
                    <View style={styles.cinemaBadge}>
                      <Text style={styles.cinemaBadgeText}>{item.year ?? 'Cinema'}</Text>
                    </View>

                    {/* Rating Pill */}
                    {item.rating ? (
                      <View style={styles.ratingBadge}>
                        <Ionicons name="star" size={sz(10, 12)} color="#ffd166" />
                        <Text style={styles.ratingText}>{item.rating}</Text>
                      </View>
                    ) : null}

                    {/* Favorite Heart */}
                    <View style={styles.heartBtn}>
                      <FavoriteHeart
                        item={{
                          id: `cinema:${item.id}`,
                          kind: 'movie',
                          title: item.title,
                          poster: item.poster,
                          year: item.year,
                          rating: item.rating,
                        }}
                        size={isTV ? 18 : 15}
                      />
                    </View>

                    {/* Loading Overlay */}
                    {isResolving && (
                      <View style={styles.resolvingOverlay}>
                        <ActivityIndicator size="small" color="#fff" />
                      </View>
                    )}
                  </View>

                  <Text style={styles.title} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {[item.year, item.rating ? `Rating ${item.rating}` : null].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </FocusCard>
            );
          }}
        />
      </FocusRow>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { marginBottom: sz(22, 28) },
  list: { paddingHorizontal: GUTTER, paddingVertical: sz(2, 8) },
  loading: { paddingLeft: GUTTER, paddingVertical: sz(2, 8), overflow: 'hidden' },
  cardContainer: { width: POSTER_WIDTH },
  poster: {
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    borderRadius: RADIUS,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  posterBlank: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  posterBlankText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  cinemaBadge: {
    position: 'absolute',
    top: 7,
    left: 7,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  cinemaBadgeText: {
    color: colors.accent,
    fontSize: sz(10, 11),
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  ratingBadge: {
    position: 'absolute',
    bottom: 7,
    left: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  ratingText: {
    color: '#fff',
    fontSize: sz(10.5, 12),
    fontWeight: '700',
  },
  heartBtn: {
    position: 'absolute',
    top: 5,
    right: 5,
    zIndex: 10,
  },
  resolvingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.text,
    fontSize: sz(13, 15),
    fontWeight: '700',
    marginTop: 8,
    lineHeight: sz(17, 20),
  },
  meta: {
    color: colors.muted,
    fontSize: sz(11.5, 13),
    marginTop: 2,
    fontWeight: '600',
  },
});
