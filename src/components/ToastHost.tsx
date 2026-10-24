// The one place a toast is shown. Every feature pushes to the toast bus
// (src/data/toasts.ts) and this component renders whatever is current.
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { useToast, type Toast } from '../data/toasts';
import { GUTTER, colors, isTV } from '../theme';

type Props = Record<string, never>;

export function ToastHost(_props: Props) {
  const toast = useToast();
  const opacity = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(30)).current;
  const shown = useRef<Toast | null>(null);

  useEffect(() => {
    if (!toast) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }),
        Animated.timing(slide, { toValue: 30, duration: 160, useNativeDriver: true }),
      ]).start();
      return;
    }
    shown.current = toast;
    opacity.setValue(0);
    slide.setValue(30);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [opacity, slide, toast]);

  if (!toast && !shown.current) return null;
  const current = toast ?? shown.current!;

  return (
    <Animated.View style={[styles.toast, { opacity, transform: [{ translateY: slide }] }]}>
      {current.icon && <Ionicons name={current.icon as any} size={isTV ? 22 : 18} color={colors.accent} />}
      <Text style={styles.text} numberOfLines={2}>
        {current.text}
      </Text>
      {current.action && (
        <Pressable
          onPress={() => {
            current.action!.onPress();
          }}
          style={styles.action}
        >
          <Text style={styles.actionText}>{current.action.label}</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: GUTTER,
    right: GUTTER,
    bottom: isTV ? 24 : 96,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 50,
  },
  text: { flex: 1, color: colors.text, fontSize: isTV ? 15 : 13, fontWeight: '600' },
  action: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: colors.accent },
  actionText: { color: '#fff', fontSize: isTV ? 14 : 12.5, fontWeight: '800' },
});
