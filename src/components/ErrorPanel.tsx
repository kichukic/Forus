import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GUTTER, RADIUS, colors, isTV } from '../theme';

type Props = {
  title: string;
  // Says where it happened, e.g. "Movie Catalog".
  label?: string;
  // What went wrong, in the app's own words.
  message?: string;
  // The text on the button.
  action: string;
  onAction: () => void;
};

// The screen shown when something goes wrong, so the app stays open and says
// what happened instead of closing.
export function ErrorPanel({ title, label, message, action, onAction }: Props) {
  return (
    <View style={styles.screen}>
      <Ionicons name="alert-circle-outline" size={isTV ? 52 : 42} color={colors.live} />
      <Text style={styles.title}>{title}</Text>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      {message ? (
        <Text style={styles.message} numberOfLines={4}>
          {message}
        </Text>
      ) : null}
      <Pressable
        onPress={onAction}
        hasTVPreferredFocus
        style={({ focused, pressed }) => [
          styles.button,
          (focused || pressed) && styles.buttonActive,
        ]}
      >
        <Text style={styles.buttonText}>{action}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: GUTTER,
    backgroundColor: colors.background,
  },
  title: {
    color: colors.text,
    fontSize: isTV ? 28 : 21,
    fontWeight: '900',
    marginTop: 14,
    textAlign: 'center',
  },
  label: {
    color: colors.accent,
    fontSize: isTV ? 16 : 13,
    fontWeight: '700',
    marginTop: 6,
    textAlign: 'center',
  },
  message: {
    color: colors.muted,
    fontSize: isTV ? 16 : 13,
    marginTop: 10,
    textAlign: 'center',
  },
  button: {
    marginTop: 22,
    paddingHorizontal: 26,
    paddingVertical: isTV ? 14 : 11,
    borderRadius: RADIUS,
    backgroundColor: colors.accent,
  },
  buttonActive: { backgroundColor: colors.accentDeep },
  buttonText: { color: '#fff', fontSize: isTV ? 17 : 15, fontWeight: '800' },
});
