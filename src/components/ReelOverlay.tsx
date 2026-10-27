import { useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ReelItem } from '../api/reels';
import { shareTitle } from '../chat/share';
import { colors, isTV } from '../theme';

type Props = {
  item: ReelItem;
  muted: boolean;
  onToggleMute: () => void;
  onPlayFullMovie?: () => void;
  onBack?: () => void;
};

export function ReelOverlay({
  item,
  muted,
  onToggleMute,
  onPlayFullMovie,
  onBack,
}: Props) {
  const insets = useSafeAreaInsets();
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(item.likesCount);
  const [scaleAnim] = useState(() => new Animated.Value(1));

  const toggleLike = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.35, duration: 120, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 3, useNativeDriver: true }),
    ]).start();

    if (liked) {
      setLiked(false);
      setLikeCount((c) => Math.max(0, c - 1));
    } else {
      setLiked(true);
      setLikeCount((c) => c + 1);
    }
  };

  const handleShare = () => {
    if (item.source.type === 'youtube') {
      shareTitle({ kind: 'video', videoId: item.source.videoId, title: item.title });
    } else {
      shareTitle({ kind: 'stream', url: item.source.url, title: item.title });
    }
  };

  const formatLikes = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Top and bottom subtle gradients for text readability */}
      <LinearGradient
        colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0)']}
        style={[styles.topGradient, { height: insets.top + 60 }]}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.85)']}
        style={[styles.bottomGradient, { height: insets.bottom + 160 }]}
        pointerEvents="none"
      />

      {/* Top back button if navigated from Home */}
      {onBack && (
        <View style={[styles.topBar, { top: insets.top + 8 }]}>
          <Pressable onPress={onBack} style={styles.backBtn} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color="#ffffff" />
          </Pressable>
        </View>
      )}

      {/* Right Column Action Buttons */}
      <View style={[styles.rightCol, { bottom: insets.bottom + 90 }]}>
        {/* Like */}
        <Pressable onPress={toggleLike} style={styles.actionBtn} hitSlop={8}>
          <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            <Ionicons
              name={liked ? 'heart' : 'heart-outline'}
              size={34}
              color={liked ? '#ff3b30' : '#ffffff'}
            />
          </Animated.View>
          <Text style={styles.actionText}>{formatLikes(likeCount)}</Text>
        </Pressable>

        {/* Share to chat friend */}
        {!isTV && (
          <Pressable onPress={handleShare} style={styles.actionBtn} hitSlop={8}>
            <Ionicons name="paper-plane-outline" size={30} color="#ffffff" />
            <Text style={styles.actionText}>Share</Text>
          </Pressable>
        )}

        {/* Mute toggle */}
        <Pressable onPress={onToggleMute} style={styles.actionBtn} hitSlop={8}>
          <Ionicons
            name={muted ? 'volume-mute-outline' : 'volume-high-outline'}
            size={30}
            color="#ffffff"
          />
          <Text style={styles.actionText}>{muted ? 'Muted' : 'Audio'}</Text>
        </Pressable>

        {/* Watch full movie or drama series shortcut */}
        {onPlayFullMovie && (
          <Pressable onPress={onPlayFullMovie} style={styles.movieBtn} hitSlop={8}>
            <Ionicons name="film" size={24} color={colors.accent} />
            <Text style={styles.movieBtnText}>
              {item.category === 'drama' ? 'Drama' : 'Watch'}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Bottom Info Section */}
      <View style={[styles.bottomInfo, { bottom: insets.bottom + 74 }]}>
        <View style={styles.authorRow}>
          <View style={styles.avatar}>
            <Ionicons name="videocam" size={14} color="#ffffff" />
          </View>
          <Text style={styles.authorName} numberOfLines={1}>
            {item.author}
          </Text>
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryBadgeText}>
              {item.category === 'drama' ? 'SHORT DRAMA' : item.category.toUpperCase()}
            </Text>
          </View>
        </View>

        <Text style={styles.titleText} numberOfLines={2}>
          {item.title}
        </Text>

        <View style={styles.audioRow}>
          <Ionicons name="musical-notes" size={13} color="rgba(255,255,255,0.7)" />
          <Text style={styles.audioText} numberOfLines={1}>
            {item.author} - Original Audio
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  topBar: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightCol: {
    position: 'absolute',
    right: 12,
    alignItems: 'center',
    gap: 16,
    zIndex: 10,
  },
  actionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 48,
  },
  actionText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  movieBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(155,92,255,0.25)',
    borderColor: colors.accent,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginTop: 4,
  },
  movieBtnText: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  bottomInfo: {
    position: 'absolute',
    left: 16,
    right: 84,
    gap: 6,
    zIndex: 10,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authorName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    maxWidth: 160,
  },
  categoryBadge: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  categoryBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  titleText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 19,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  audioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  audioText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '400',
  },
});
