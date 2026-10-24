// The releases a name has on the torrent indexes, as a list to pick from.
// Both the catalog's film screen and the MovieBox screen use it.
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { TorrentOption } from '../api/torrents';
import { RADIUS, colors, isTV } from '../theme';

type Props = {
  /** The releases found. Null while they are still being looked for. */
  releases: TorrentOption[] | null;
  // Starts a release that was picked.
  onSend: (option: TorrentOption) => void;
  // Shown when there is nothing to pick from.
  error?: string | null;
  emptyText?: string;
};

export function ReleaseList({ releases, onSend, error, emptyText }: Props) {
  if (releases === null) {
    return <ActivityIndicator color={colors.accent} style={styles.spinner} />;
  }
  if (releases.length === 0) {
    return <Text style={styles.note}>{error ?? emptyText ?? 'No releases found.'}</Text>;
  }

  return (
    <View>
      {releases.map((item) => (
        <Pressable
          key={item.hash}
          onPress={() => onSend(item)}
          style={({ focused, pressed }) => [
            styles.release,
            (focused || pressed) && styles.releaseActive,
          ]}
        >
          <View style={styles.releaseMain}>
            <Text style={styles.releaseName} numberOfLines={2}>
              {item.name}
            </Text>
            <Text style={styles.releaseMeta}>
              {[item.quality, item.size, item.seeders !== undefined ? `${item.seeders} seeds` : null, 'Play in Player']
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          {item.tracker ? <Text style={styles.tracker}>{item.tracker}</Text> : null}
          <Ionicons name="play-circle-outline" size={22} color={colors.accent} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  release: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: isTV ? 14 : 11,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderRadius: RADIUS,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  releaseActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  releaseMain: { flex: 1 },
  releaseName: { color: colors.text, fontSize: isTV ? 16 : 14, fontWeight: '700' },
  releaseMeta: { color: colors.muted, fontSize: isTV ? 13 : 12, marginTop: 3 },
  tracker: { color: colors.faint, fontSize: isTV ? 12 : 11, maxWidth: 120 },
  note: { color: colors.muted, fontSize: isTV ? 15 : 13, marginTop: 10 },
  spinner: { marginTop: 24 },
});
