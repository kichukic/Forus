// A small notice that slides in when a release is sent to TorBox, or when one
// that was sent earlier finishes. It never blocks the screen.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { onNotice, type Transfer } from '../data/transfers';
import { GUTTER, colors, isTV } from '../theme';

type Props = {
  // Plays a transfer once it is ready.
  onPlay: (transfer: Transfer) => void;
  // Opens the TorBox settings, when a transfer needs the key.
  onOpenTorbox: () => void;
};

type Notice = { text: string; icon: string; action?: { label: string; onPress: () => void } };

export function TransferToast({ onPlay, onOpenTorbox }: Props) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const [slide] = useState(() => new Animated.Value(30));
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((next: Notice, ms = 4000) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setNotice(next);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start();
    hideTimer.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(slide, { toValue: 30, duration: 180, useNativeDriver: true }),
      ]).start(() => setNotice(null));
    }, ms);
  }, [opacity, slide]);

  useEffect(() => {
    const off = onNotice((n) => {
      if (n.kind === 'added') {
        show({ text: `${n.transfer.title} will be added to your TorBox — it plays here when it's ready.`, icon: 'cloud-upload-outline' }, 4000);
      } else if (n.kind === 'ready') {
        show({ text: `${n.transfer.title} is ready in your TorBox.`, icon: 'checkmark-circle', action: { label: 'Play', onPress: () => onPlay(n.transfer) } }, 6000);
      } else if (n.kind === 'error') {
        show({ text: n.transfer.message ?? 'Something went wrong with that transfer.', icon: 'alert-circle' }, 5000);
      } else if (n.kind === 'needsKey') {
        show({ text: 'Connect your TorBox to add releases to it.', icon: 'key-outline', action: { label: 'Connect', onPress: onOpenTorbox } }, 6000);
      }
    });
    return off;
  }, [onPlay, onOpenTorbox, show]);

  if (!notice) return null;

  return (
    <Animated.View style={[styles.toast, { opacity, transform: [{ translateY: slide }] }]}>
      <Ionicons name={notice.icon as any} size={isTV ? 22 : 18} color={colors.accent} />
      <Text style={styles.text} numberOfLines={2}>
        {notice.text}
      </Text>
      {notice.action && (
        <Pressable onPress={() => { if (hideTimer.current) clearTimeout(hideTimer.current); setNotice(null); notice.action!.onPress(); }} style={styles.action}>
          <Text style={styles.actionText}>{notice.action.label}</Text>
        </Pressable>
      )}
      <Pressable onPress={() => { if (hideTimer.current) clearTimeout(hideTimer.current); Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => setNotice(null)); }} hitSlop={8}>
        <Ionicons name="close" size={isTV ? 20 : 16} color={colors.muted} />
      </Pressable>
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
