import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { TorboxTorrent } from '../api/torbox';
import { colors, isTV } from '../theme';

type Props = {
  title: string;
  torrent: TorboxTorrent | null;
  sending: boolean;
  onCancel: () => void;
};

// The wait screen shown while TorBox fetches a release.
export function TorboxSendCard({ title, torrent, sending, onCancel }: Props) {
  const progress = torrent?.progress ?? 0;
  const ready = torrent?.downloadState === 'cached' || torrent?.downloadState === 'completed';

  return (
    <View style={styles.wrap}>
      <LinearGradient colors={[colors.surfaceRaised, colors.surface]} style={styles.icon}>
        <Ionicons name="cloud-download-outline" size={isTV ? 46 : 38} color={colors.accent} />
      </LinearGradient>

      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>

      <Text style={styles.state}>
        {sending
          ? 'Sending to TorBox…'
          : ready
            ? 'Ready in TorBox'
            : progress > 0
              ? `Downloading — ${progress}%`
              : 'Checking TorBox…'}
      </Text>

      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${progress}%` }]} />
      </View>

      <Text style={styles.note}>
        {torrent?.downloadSpeed ? `${formatSpeed(torrent.downloadSpeed)} · ` : ''}
        {torrent?.eta ? `about ${formatEta(torrent.eta)} left` : 'TorBox is fetching it now'}
      </Text>

      {!ready && !sending && (
        <ActivityIndicator color={colors.accent} style={styles.spinner} />
      )}

      <Pressable
        onPress={onCancel}
        style={({ focused, pressed }) => [styles.cancel, (focused || pressed) && styles.cancelActive]}
      >
        <Text style={styles.cancelText}>Stop waiting</Text>
      </Pressable>
    </View>
  );
}

function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond >= 1e6) return `${(bytesPerSecond / 1e6).toFixed(1)} MB/s`;
  return `${Math.max(1, Math.round(bytesPerSecond / 1000))} KB/s`;
}

function formatEta(seconds: number): string {
  if (seconds <= 60) return `${Math.round(seconds)}s`;
  if (seconds <= 3600) return `${Math.round(seconds / 60)} min`;
  return `${(seconds / 3600).toFixed(1)} h`;
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  icon: {
    width: isTV ? 104 : 86,
    height: isTV ? 104 : 86,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.text,
    fontSize: isTV ? 20 : 17,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 18,
    paddingHorizontal: 12,
  },
  state: { color: colors.accent, fontSize: isTV ? 16 : 14, fontWeight: '700', marginTop: 6 },
  bar: {
    width: '100%',
    maxWidth: 420,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.surfaceRaised,
    marginTop: 18,
    overflow: 'hidden',
  },
  barFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 5 },
  note: { color: colors.muted, fontSize: isTV ? 14 : 12.5, marginTop: 10, textAlign: 'center' },
  spinner: { marginTop: 16 },
  cancel: {
    marginTop: 26,
    paddingHorizontal: 26,
    paddingVertical: 12,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cancelActive: { borderColor: colors.accent },
  cancelText: { color: colors.text, fontSize: isTV ? 16 : 14, fontWeight: '700' },
});
