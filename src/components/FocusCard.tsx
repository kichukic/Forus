import { memo, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { CARD_GAP, CARD_HEIGHT, CARD_WIDTH, RADIUS, colors, isTV, sz } from '../theme';

type Props = {
  onPress: () => void;
  // Press and hold, e.g. to send the video to a friend.
  onLongPress?: () => void;
  children: ReactNode;
  preferredFocus?: boolean;
  width?: number;
  style?: ViewStyle;
};

// A card the TV remote can land on: it grows smoothly and gets a purple ring
// when focused. On a phone it is tapped, and shrinks slightly while pressed.
export const FocusCard = memo(function FocusCard({
  onPress,
  onLongPress,
  children,
  preferredFocus,
  width = CARD_WIDTH,
  style,
}: Props) {
  const [focused, setFocused] = useState(false);
  const scale = useState(() => new Animated.Value(1))[0];

  const animate = (to: number) => {
    if (isTV) {
      Animated.timing(scale, {
        toValue: to,
        duration: 110,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 30, bounciness: 4 }).start();
    }
  };

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onFocus={() => {
        setFocused(true);
        animate(isTV ? 1.08 : 1.05);
      }}
      onBlur={() => {
        setFocused(false);
        animate(1);
      }}
      onPressIn={() => !isTV && animate(0.96)}
      onPressOut={() => !isTV && animate(1)}
      hasTVPreferredFocus={preferredFocus}
      // A focused card grows, so it is drawn above its neighbours.
      style={[{ width, marginRight: CARD_GAP }, focused && styles.raised, style]}
    >
      <Animated.View style={[styles.card, focused && styles.focused, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS + 4,
    borderWidth: sz(0, 3),
    borderColor: 'transparent',
    padding: sz(0, 4),
  },
  focused: {
    borderColor: '#ffffff',
    backgroundColor: isTV ? 'rgba(155, 92, 255, 0.28)' : colors.accentSoft,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: isTV ? 0.95 : 0,
    shadowRadius: isTV ? 16 : 0,
  },
  raised: { zIndex: 10, elevation: isTV ? 10 : 2 },
});

export const cardImageStyle = { width: '100%' as const, height: CARD_HEIGHT, borderRadius: RADIUS };
