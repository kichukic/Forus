import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { CARD_HEIGHT, CARD_WIDTH, colors, isTV } from '../theme';

type Props = {
  onPress: () => void;
  children: ReactNode;
  preferredFocus?: boolean;
};

// A card the TV remote can land on: it grows and gets a yellow outline when focused.
// On a phone it is simply tapped, and dims while pressed.
export function FocusCard({ onPress, children, preferredFocus }: Props) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      hasTVPreferredFocus={preferredFocus}
      style={({ pressed }) => [styles.card, focused && styles.focused, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    marginRight: isTV ? 16 : 12,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: 'transparent',
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  focused: {
    borderColor: colors.accent,
    transform: [{ scale: 1.08 }],
  },
  pressed: { opacity: 0.7 },
});

export const cardImageStyle = { width: '100%' as const, height: CARD_HEIGHT };
