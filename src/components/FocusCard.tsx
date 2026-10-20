import { useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { CARD_GAP, CARD_HEIGHT, CARD_WIDTH, RADIUS, colors, isTV } from '../theme';

type Props = {
  onPress: () => void;
  children: ReactNode;
  preferredFocus?: boolean;
  width?: number;
  style?: ViewStyle;
};

// A card the TV remote can land on: it grows smoothly and gets a purple ring
// when focused. On a phone it is tapped, and shrinks slightly while pressed.
export function FocusCard({ onPress, children, preferredFocus, width = CARD_WIDTH, style }: Props) {
  const [focused, setFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const animate = (to: number) =>
    Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 30, bounciness: 4 }).start();

  return (
    <Pressable
      onPress={onPress}
      onFocus={() => {
        setFocused(true);
        animate(1.07);
      }}
      onBlur={() => {
        setFocused(false);
        animate(1);
      }}
      onPressIn={() => !isTV && animate(0.96)}
      onPressOut={() => !isTV && animate(1)}
      hasTVPreferredFocus={preferredFocus}
      style={[{ width, marginRight: CARD_GAP }, style]}
    >
      <Animated.View style={[styles.card, focused && styles.focused, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS + 4,
    borderWidth: isTV ? 3 : 0,
    borderColor: 'transparent',
    padding: isTV ? 4 : 0,
  },
  focused: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
});

export const cardImageStyle = { width: '100%' as const, height: CARD_HEIGHT, borderRadius: RADIUS };
