import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Source } from '../api/sources';
import { colors, sz } from '../theme';

type Props = {
  sources: Source[];
  currentId: string;
  onPick: (source: Source) => void;
  onClose: () => void;
};

/** Lets the viewer pick which source to play when the first one fails. */
export function SourcePicker({ sources, currentId, onPick, onClose }: Props) {
  return (
    <View style={styles.backdrop}>
      <Text style={styles.title}>Sources</Text>
      <FlatList
        data={sources}
        keyExtractor={(s) => s.id}
        style={styles.list}
        renderItem={({ item, index }) => (
          <Pressable
            hasTVPreferredFocus={index === 0}
            onPress={() => onPick(item)}
            style={({ focused, pressed }) => [
              styles.row,
              focused && styles.rowFocused,
              pressed && styles.rowPressed,
            ]}
          >
            <Text style={styles.label}>{item.label}</Text>
            <Text style={styles.state}>
              {item.id === currentId ? 'playing' : ''}
            </Text>
          </Pressable>
        )}
      />
      <Pressable hasTVPreferredFocus={sources.length === 0} onPress={onClose} style={styles.close}>
        <Text style={styles.closeText}>Close</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.92)',
    padding: sz(20, 48),
  },
  title: {
    color: colors.accent,
    fontSize: sz(22, 30),
    fontWeight: '800',
    marginBottom: sz(12, 20),
  },
  list: { flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: sz(10, 14),
    paddingHorizontal: sz(14, 20),
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: 'transparent',
    backgroundColor: colors.surface,
  },
  rowFocused: { borderColor: colors.accent },
  rowPressed: { opacity: 0.7 },
  label: { color: colors.text, fontSize: sz(16, 20), fontWeight: '700' },
  state: { color: colors.muted, fontSize: sz(13, 16) },
  close: {
    marginTop: sz(16, 24),
    alignSelf: 'flex-start',
    paddingHorizontal: sz(18, 28),
    paddingVertical: sz(10, 12),
    borderRadius: 8,
    borderWidth: 3,
    borderColor: 'transparent',
    backgroundColor: colors.surface,
  },
  closeText: { color: colors.text, fontSize: sz(16, 20), fontWeight: '700' },
});
