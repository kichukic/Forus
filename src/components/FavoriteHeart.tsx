// A heart button for cards and details: pulses when tapped and saves or removes
// the item from the user's Favorites tab.
import { useState } from 'react';
import { Animated, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { toggleFavorite, useIsFavorite, type FavoriteItem } from '../data/favorites';
import { showToast } from '../data/toasts';
import { sz } from '../theme';

type Props = {
  item: FavoriteItem;
  size?: number;
  style?: StyleProp<ViewStyle>;
  onToggled?: (isFav: boolean) => void;
};

export function FavoriteHeart({ item, size = sz(18, 22), style, onToggled }: Props) {
  const isFav = useIsFavorite(item.id);
  const [scale] = useState(() => new Animated.Value(1));

  const handlePress = async (e: any) => {
    e?.stopPropagation?.();
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.35, duration: 110, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();

    const nowFav = await toggleFavorite(item);
    showToast({
      text: nowFav ? `Added "${item.title}" to Favorites` : `Removed from Favorites`,
    });
    onToggled?.(nowFav);
  };

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={10}
      style={({ pressed }) => [styles.btn, style, pressed && styles.pressed]}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons
          name={isFav ? 'heart' : 'heart-outline'}
          size={size}
          color={isFav ? '#ef4444' : '#ffffff'}
          style={styles.iconShadow}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  pressed: {
    opacity: 0.75,
  },
  iconShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.6,
    shadowRadius: 3,
  },
});
