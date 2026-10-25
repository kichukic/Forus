import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AudioTrack } from 'expo-video';
import { audioTrackLabel } from '../hooks/useAudioTracks';
import { colors, isTV, sz } from '../theme';

type Props = {
  visible: boolean;
  tracks: AudioTrack[];
  selected: AudioTrack | null;
  onSelect: (track: AudioTrack) => void;
  onClose: () => void;
};

export function AudioTrackPicker({ visible, tracks, selected, onSelect, onClose }: Props) {
  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Ionicons name="volume-high" size={isTV ? 24 : 20} color={colors.accent} />
              <Text style={styles.title}>Audio Track / Dub</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Ionicons name="close" size={isTV ? 24 : 20} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {tracks.map((track, i) => {
              const active =
                (track.id && track.id === selected?.id) ||
                (track.language && track.language === selected?.language) ||
                (!selected && i === 0);
              return (
                <Pressable
                  key={track.id || track.language || i}
                  hasTVPreferredFocus={active}
                  onPress={() => {
                    onSelect(track);
                    onClose();
                  }}
                  style={({ focused, pressed }) => [
                    styles.item,
                    active && styles.itemActive,
                    (focused || pressed) && styles.itemFocused,
                  ]}
                >
                  <View style={styles.itemInfo}>
                    <Text style={[styles.itemText, active && styles.itemTextActive]}>
                      {audioTrackLabel(track, i)}
                    </Text>
                    {track.name && track.name !== track.label ? (
                      <Text style={styles.itemSub}>{track.name}</Text>
                    ) : null}
                  </View>
                  {active && <Ionicons name="checkmark-circle" size={isTV ? 22 : 18} color={colors.accent} />}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: isTV ? 'center' : 'flex-end',
    alignItems: isTV ? 'center' : 'stretch',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: isTV ? 16 : 20,
    borderTopRightRadius: isTV ? 16 : 20,
    borderRadius: isTV ? 16 : undefined,
    width: isTV ? 480 : '100%',
    maxHeight: '60%',
    paddingBottom: isTV ? 20 : 32,
    borderWidth: isTV ? 1 : 0,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    color: colors.text,
    fontSize: isTV ? 18 : 16,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  list: {
    maxHeight: 320,
  },
  listContent: {
    padding: 12,
    gap: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  itemActive: {
    backgroundColor: 'rgba(229,9,20,0.12)',
    borderColor: colors.accent,
  },
  itemFocused: {
    borderColor: colors.text,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  itemInfo: {
    flex: 1,
    gap: 2,
  },
  itemText: {
    color: colors.text,
    fontSize: isTV ? 16 : 14,
    fontWeight: '600',
  },
  itemTextActive: {
    color: colors.accent,
    fontWeight: '700',
  },
  itemSub: {
    color: colors.muted,
    fontSize: isTV ? 13 : 11,
  },
});
