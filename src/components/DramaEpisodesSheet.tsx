import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ReelDramaEpisode } from '../api/reels';
import { colors, isTV, RADIUS, sz } from '../theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type Props = {
  visible: boolean;
  onClose: () => void;
  dramaTitle: string;
  author: string;
  currentEpisode: number;
  episodes: ReelDramaEpisode[];
  loading: boolean;
  onSelectEpisode: (ep: ReelDramaEpisode) => void;
  onPlayFullMovie?: () => void;
};

export function DramaEpisodesSheet({
  visible,
  onClose,
  dramaTitle,
  author,
  currentEpisode,
  episodes,
  loading,
  onSelectEpisode,
  onPlayFullMovie,
}: Props) {
  const insets = useSafeAreaInsets();
  const numColumns = isTV ? 8 : 5;
  const sheetWidth = isTV ? Math.min(SCREEN_WIDTH * 0.7, 720) : SCREEN_WIDTH;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View
          style={[
            styles.sheet,
            {
              width: sheetWidth,
              paddingBottom: Math.max(insets.bottom, 16) + 8,
              maxHeight: isTV ? SCREEN_HEIGHT * 0.8 : SCREEN_HEIGHT * 0.65,
            },
          ]}
        >
          {/* Top Drag Pill */}
          <View style={styles.dragPillWrap}>
            <View style={styles.dragPill} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitles}>
              <Text style={styles.title} numberOfLines={1}>
                {dramaTitle}
              </Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {author} · {loading ? 'Loading...' : `${episodes.length} Episodes`}
              </Text>
            </View>

            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={10}>
              <Ionicons name="close-circle" size={26} color="rgba(255,255,255,0.6)" />
            </Pressable>
          </View>

          {/* Episode List / Grid */}
          {loading ? (
            <View style={styles.centerLoading}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={styles.loadingText}>Fetching episodes...</Text>
            </View>
          ) : episodes.length === 0 ? (
            <View style={styles.centerLoading}>
              <Text style={styles.emptyText}>No other episodes available for this reel</Text>
            </View>
          ) : (
            <FlatList
              data={episodes}
              keyExtractor={(item) => `ep-${item.episode}`}
              numColumns={numColumns}
              contentContainerStyle={styles.gridContent}
              renderItem={({ item }) => {
                const isActive = item.episode === currentEpisode;
                return (
                  <Pressable
                    style={({ pressed, focused }) => [
                      styles.epCard,
                      isActive && styles.epCardActive,
                      (pressed || focused) && styles.epCardPressed,
                    ]}
                    onPress={() => onSelectEpisode(item)}
                  >
                    <View style={styles.epCardInner}>
                      {isActive ? (
                        <Ionicons name="play" size={13} color="#ffffff" style={{ marginBottom: 2 }} />
                      ) : null}
                      <Text
                        style={[styles.epNumber, isActive && styles.epNumberActive]}
                        numberOfLines={1}
                      >
                        {item.episode}
                      </Text>
                      {item.duration ? (
                        <Text style={[styles.epDuration, isActive && styles.epDurationActive]}>
                          {Math.floor(item.duration / 60)}:
                          {String(item.duration % 60).padStart(2, '0')}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              }}
            />
          )}

          {/* Footer Option: Open Full Player */}
          {onPlayFullMovie && (
            <View style={styles.footer}>
              <Pressable
                onPress={() => {
                  onClose();
                  onPlayFullMovie();
                }}
                style={({ pressed, focused }) => [
                  styles.fullPlayerBtn,
                  (pressed || focused) && styles.fullPlayerBtnPressed,
                ]}
              >
                <Ionicons name="film-outline" size={18} color={colors.accent} />
                <Text style={styles.fullPlayerBtnText}>Watch in Full Player</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheet: {
    backgroundColor: '#161622',
    borderTopLeftRadius: RADIUS * 1.5,
    borderTopRightRadius: RADIUS * 1.5,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  dragPillWrap: {
    alignItems: 'center',
    marginBottom: 8,
  },
  dragPill: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  headerTitles: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    color: '#ffffff',
    fontSize: sz(16, 20),
    fontWeight: '700',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: sz(12, 15),
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  centerLoading: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: sz(13, 16),
  },
  emptyText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: sz(13, 16),
  },
  gridContent: {
    paddingVertical: 12,
    gap: 8,
  },
  epCard: {
    flex: 1,
    margin: 4,
    minHeight: 52,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  epCardActive: {
    backgroundColor: colors.accent,
    borderColor: '#ffffff',
  },
  epCardPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.96 }],
  },
  epCardInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  epNumber: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: sz(13, 16),
    fontWeight: '700',
  },
  epNumberActive: {
    color: '#ffffff',
    fontWeight: '800',
  },
  epDuration: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: sz(9, 12),
    marginTop: 2,
  },
  epDurationActive: {
    color: 'rgba(255,255,255,0.9)',
  },
  footer: {
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingTop: 8,
  },
  fullPlayerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: RADIUS,
    backgroundColor: 'rgba(155,92,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(155,92,255,0.3)',
  },
  fullPlayerBtnPressed: {
    backgroundColor: 'rgba(155,92,255,0.22)',
  },
  fullPlayerBtnText: {
    color: colors.accent,
    fontSize: sz(13, 16),
    fontWeight: '700',
  },
});
