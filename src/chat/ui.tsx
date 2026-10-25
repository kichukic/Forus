// Small pieces the chat screens share: a person's avatar, the screen header,
// a text field and buttons, in the app's dark style.
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { GUTTER, colors } from '../theme';

const AVATAR_COLOURS: [string, string][] = [
  ['#9b5cff', '#5b2fd0'],
  ['#ff5c8a', '#c2185b'],
  ['#3ec7ff', '#1565c0'],
  ['#ffb74d', '#e65100'],
  ['#4cd6a0', '#00796b'],
  ['#ff7a59', '#bf360c'],
];

/** A round badge with someone's first letter, in a colour that stays theirs. */
export function Avatar({ name, id, size = 44 }: { name: string; id: string; size?: number }) {
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) | 0;
  const pair = AVATAR_COLOURS[Math.abs(hash) % AVATAR_COLOURS.length];
  return (
    <LinearGradient colors={pair} style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.42 }]}>{(name.trim()[0] ?? '?').toUpperCase()}</Text>
    </LinearGradient>
  );
}

export function Header({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      {onBack && <IconButton icon="chevron-back" label="Back" onPress={onBack} />}
      <View style={styles.headerText}>
        <Text style={[styles.title, onBack && styles.titleSmall]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  badge,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  badge?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={21} color={colors.text} />
      {badge ? <Badge count={badge} style={styles.iconBadge} /> : null}
    </Pressable>
  );
}

export function Badge({ count, style }: { count: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.badge, style]}>
      <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

export function Field(props: ComponentProps<typeof TextInput>) {
  return <TextInput placeholderTextColor={colors.faint} {...props} style={[styles.field, props.style]} />;
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'plain' | 'danger';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        kind === 'primary' && styles.buttonPrimary,
        kind === 'danger' && styles.buttonDanger,
        (pressed || disabled) && styles.pressed,
        style,
      ]}
    >
      <Text style={[styles.buttonText, kind === 'danger' && styles.buttonTextDanger]}>{label}</Text>
    </Pressable>
  );
}

/** "14:05" today, "Tue" this week, otherwise "12 Mar". */
export function shortTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (now.getTime() - d.getTime() < 6 * 864e5) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export const chatStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  note: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  error: { color: colors.live, fontSize: 14, marginTop: 10 },
});

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '900' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: GUTTER, paddingBottom: 12 },
  headerText: { flex: 1 },
  title: { color: colors.text, fontSize: 26, fontWeight: '900' },
  titleSmall: { fontSize: 19, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 12.5, marginTop: 1 },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  iconBadge: { position: 'absolute', top: -3, right: -3 },
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: colors.live,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10.5, fontWeight: '900' },
  field: {
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 15.5,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  buttonPrimary: { backgroundColor: colors.accent },
  buttonDanger: { backgroundColor: 'rgba(255,59,92,0.12)' },
  buttonText: { color: colors.text, fontSize: 15, fontWeight: '800' },
  buttonTextDanger: { color: colors.live },
  pressed: { opacity: 0.6 },
});
