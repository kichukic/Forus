// A slim strip that sits above the bottom nav, showing the transfer that is
// running right now. It never blocks the screen: tapping it opens the TorBox
// tab, and the cross hides the strip without stopping the transfer.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { subscribe, type Transfer } from '../data/transfers';
import { GUTTER, colors, isTV } from '../theme';
import { useEffect, useState } from 'react';

type Props = {
  // Opens the TorBox tab, so the user can see every transfer.
  onOpen: () => void;
};

export function TransferBar({ onOpen }: Props) {
  const [list, setList] = useState<Transfer[]>([]);
  useEffect(() => subscribe(setList), []);

  const active = list.find((t) => t.state === 'sending' || t.state === 'downloading');
  const others = list.filter((t) => t === active ? false : t.state === 'sending' || t.state === 'downloading').length;

  if (!active) return null;

  const progress = active.state === 'sending' ? 0 : active.progress;
  const stateText =
    active.state === 'sending'
      ? 'Sending to TorBox…'
      : progress > 0
        ? `Downloading — ${Math.round(progress)}%`
        : 'Checking TorBox…';

  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [styles.bar, pressed && styles.barPressed]}
    >
      <Ionicons name="cloud-download-outline" size={isTV ? 20 : 16} color={colors.accent} />
      <View style={styles.main}>
        <Text style={styles.title} numberOfLines={1}>
          {active.title}
          {others > 0 ? `  +${others}` : ''}
        </Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.max(2, progress)}%` }]} />
        </View>
        <Text style={styles.meta}>
          {stateText}
          {active.speed ? ` · ${Math.max(1, Math.round(active.speed / 1000))} KB/s` : ''}
          {active.eta ? ` · ${Math.round(active.eta / 60)} min left` : ''}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={isTV ? 20 : 16} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: GUTTER,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  barPressed: { opacity: 0.85 },
  main: { flex: 1, gap: 3 },
  title: { color: colors.text, fontSize: isTV ? 14 : 12.5, fontWeight: '700' },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.surface, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.accent, borderRadius: 2 },
  meta: { color: colors.muted, fontSize: isTV ? 12.5 : 11, fontWeight: '600' },
});
