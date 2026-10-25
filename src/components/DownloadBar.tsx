// A slim strip above the bottom nav showing active offline downloads.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatBytes, useDownloads } from '../data/downloads';
import { GUTTER, colors, isTV } from '../theme';

type Props = {
  onOpen: () => void;
};

export function DownloadBar({ onOpen }: Props) {
  const downloads = useDownloads();
  const active = downloads.find((d) => d.status === 'downloading');
  const others = downloads.filter((d) => d !== active && d.status === 'downloading').length;

  if (isTV || !active) return null;

  const pct = active.progress;
  const progressText = pct > 0 ? `${pct}%` : 'Connecting…';

  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [styles.bar, pressed && styles.barPressed]}
    >
      <View style={styles.iconWrap}>
        <Ionicons name="arrow-down-circle" size={18} color={colors.accent} />
      </View>
      <View style={styles.main}>
        <View style={styles.topRow}>
          <Text style={styles.title} numberOfLines={1}>
            {active.title}
            {others > 0 ? ` (+${others})` : ''}
          </Text>
          <Text style={styles.pct}>{progressText}</Text>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.max(3, pct)}%` }]} />
        </View>
        <Text style={styles.meta}>
          {formatBytes(active.downloadedBytes)} / {formatBytes(active.totalBytes)} · Tap to view
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
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
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: 'rgba(155,92,255,0.3)',
  },
  barPressed: { opacity: 0.85 },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  main: { flex: 1, gap: 4 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.text, fontSize: 13, fontWeight: '700', flex: 1, marginRight: 8 },
  pct: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.surface, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.accent, borderRadius: 2 },
  meta: { color: colors.muted, fontSize: 11, fontWeight: '600' },
});
