// ForUs Wrapped: an annual & monthly streaming recap that computes each user's
// total screen time, titles explored, favorite gems, and assigns a streaming persona.
import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChat } from '../chat/store';
import { loadHistory, type HistoryEntry } from '../data/history';
import { useFavorites } from '../data/favorites';
import { showToast } from '../data/toasts';
import { colors, sz } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function ForUsWrappedModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const chat = useChat();
  const user = chat.me;
  const favorites = useFavorites();
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    if (visible) {
      loadHistory().then(setHistory);
    }
  }, [visible]);

  const stats = useMemo(() => {
    const totalSec =
      user?.screenTimeSeconds && user.screenTimeSeconds > 0
        ? user.screenTimeSeconds
        : Math.max(history.length * 1500, 3600);

    const hours = (totalSec / 3600).toFixed(1);
    const titlesCount = history.length;
    const favsCount = favorites.length;

    let persona = 'The Trendsetter';
    let personaEmoji = '✨';
    let personaTagline = 'Curating the finest streams on ForUs with immaculate taste.';

    const nightWatches = history.filter((h) => {
      if (!h.watchedAt) return false;
      const hr = new Date(h.watchedAt).getHours();
      return hr >= 22 || hr <= 4;
    }).length;

    const movieboxCount = history.filter((h) => h.kind === 'moviebox').length;
    const fileCount = history.filter((h) => h.kind === 'file').length;

    if (nightWatches >= 2 || (titlesCount > 0 && nightWatches / titlesCount >= 0.35)) {
      persona = 'The Midnight Binger';
      personaEmoji = '🦉';
      personaTagline = 'You only sleep when the credits finish rolling.';
    } else if (fileCount >= 2 || (titlesCount > 0 && fileCount / titlesCount >= 0.35)) {
      persona = 'The Torrent Titan';
      personaEmoji = '⚡';
      personaTagline = 'Ultra-high bitrate, 4K HDR streams, zero compromises.';
    } else if (movieboxCount >= 2 || (titlesCount > 0 && movieboxCount / titlesCount >= 0.35)) {
      persona = 'The Cinephile';
      personaEmoji = '🍿';
      personaTagline = 'Blockbusters, cinematic masterpieces, and endless popcorn.';
    }

    const topTitle = history[0]?.title ?? 'Exploration in Progress';

    return {
      hours,
      titlesCount,
      favsCount,
      persona,
      personaEmoji,
      personaTagline,
      topTitle,
    };
  }, [user, history, favorites]);

  const handleShare = async () => {
    try {
      await Share.share({
        message: `🎁 My ForUs Wrapped 2026:\n\n${stats.personaEmoji} Persona: ${stats.persona}\n⏱️ Streaming Time: ${stats.hours} Hours\n🎬 Titles Watched: ${stats.titlesCount}\n❤️ Favorites Pinned: ${stats.favsCount}\n\nStream with me on ForUs!`,
      });
    } catch {
      showToast({ text: 'Could not open share menu' });
    }
  };

  return (
    <Modal visible={visible} onRequestClose={onClose} animationType="slide" transparent>
      <View style={styles.backdrop}>
        <LinearGradient
          colors={['#180033', '#3b0764', '#0c0a14']}
          style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}
        >
          {/* Top Bar */}
          <View style={styles.topBar}>
            <View style={styles.wrappedLogoRow}>
              <Ionicons name="sparkles" size={sz(18, 22)} color="#ffd166" />
              <Text style={styles.wrappedLogoText}>FORUS WRAPPED</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
              <Ionicons name="close" size={sz(22, 26)} color="#fff" />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Persona Hero Card */}
            <View style={styles.heroCard}>
              <LinearGradient
                colors={['rgba(217, 70, 239, 0.25)', 'rgba(124, 58, 237, 0.1)']}
                style={StyleSheet.absoluteFill}
              />
              <Text style={styles.heroSubtitle}>YOUR STREAMING PERSONA</Text>
              <Text style={styles.heroEmoji}>{stats.personaEmoji}</Text>
              <Text style={styles.heroTitle}>{stats.persona}</Text>
              <Text style={styles.heroTagline}>{stats.personaTagline}</Text>
            </View>

            {/* Metrics Grid */}
            <View style={styles.metricsRow}>
              <View style={styles.metricCard}>
                <Ionicons name="time" size={sz(20, 24)} color="#f59e0b" />
                <Text style={styles.metricValue}>{stats.hours}h</Text>
                <Text style={styles.metricLabel}>Time Streamed</Text>
              </View>

              <View style={styles.metricCard}>
                <Ionicons name="film" size={sz(20, 24)} color={colors.accent} />
                <Text style={styles.metricValue}>{stats.titlesCount}</Text>
                <Text style={styles.metricLabel}>Titles Explored</Text>
              </View>

              <View style={styles.metricCard}>
                <Ionicons name="heart" size={sz(20, 24)} color="#ef4444" />
                <Text style={styles.metricValue}>{stats.favsCount}</Text>
                <Text style={styles.metricLabel}>Favorites Saved</Text>
              </View>
            </View>

            {/* Top Title Spotlight */}
            <View style={styles.spotlightCard}>
              <View style={styles.spotlightHeader}>
                <Ionicons name="trophy" size={sz(16, 18)} color="#ffd166" />
                <Text style={styles.spotlightHeaderTitle}>MOST RECENT HIGHLIGHT</Text>
              </View>
              <Text style={styles.spotlightTitle} numberOfLines={2}>
                {stats.topTitle}
              </Text>
            </View>

            {/* User Greeting */}
            <Text style={styles.userNote}>
              Stats crafted for {user?.name || 'You'} · Keep streaming on ForUs!
            </Text>

            {/* Action Buttons */}
            <View style={styles.actionRow}>
              <Pressable onPress={handleShare} style={styles.shareBtn}>
                <Ionicons name="share-social" size={sz(17, 20)} color="#0c0a12" />
                <Text style={styles.shareBtnText}>Share My Wrapped</Text>
              </Pressable>

              <Pressable onPress={onClose} style={styles.doneBtn}>
                <Text style={styles.doneBtnText}>Done</Text>
              </Pressable>
            </View>
          </ScrollView>
        </LinearGradient>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  wrappedLogoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  wrappedLogoText: {
    color: '#fff',
    fontSize: sz(16, 20),
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  closeBtn: {
    width: sz(36, 40),
    height: sz(36, 40),
    borderRadius: sz(18, 20),
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingBottom: 40,
    gap: 16,
  },
  heroCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(217, 70, 239, 0.4)',
    overflow: 'hidden',
    padding: 24,
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(24, 0, 51, 0.6)',
  },
  heroSubtitle: {
    color: '#d946ef',
    fontSize: sz(11, 13),
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  heroEmoji: {
    fontSize: sz(56, 72),
    marginVertical: 4,
  },
  heroTitle: {
    color: '#fff',
    fontSize: sz(24, 30),
    fontWeight: '900',
    textAlign: 'center',
  },
  heroTagline: {
    color: colors.muted,
    fontSize: sz(13, 15),
    textAlign: 'center',
    lineHeight: sz(18, 22),
    paddingHorizontal: 12,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metricCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: sz(12, 16),
    alignItems: 'center',
    gap: 6,
  },
  metricValue: {
    color: '#fff',
    fontSize: sz(18, 22),
    fontWeight: '900',
  },
  metricLabel: {
    color: colors.muted,
    fontSize: sz(10, 11),
    fontWeight: '600',
    textAlign: 'center',
  },
  spotlightCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: sz(14, 18),
    gap: 8,
  },
  spotlightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  spotlightHeaderTitle: {
    color: '#ffd166',
    fontSize: sz(11, 12),
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  spotlightTitle: {
    color: '#fff',
    fontSize: sz(15, 18),
    fontWeight: '800',
  },
  userNote: {
    color: colors.muted,
    fontSize: sz(12, 13),
    textAlign: 'center',
    marginTop: 4,
  },
  actionRow: {
    marginTop: 10,
    gap: 10,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 22,
  },
  shareBtnText: {
    color: '#0c0a12',
    fontSize: sz(15, 17),
    fontWeight: '800',
  },
  doneBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  doneBtnText: {
    color: '#fff',
    fontSize: sz(14, 16),
    fontWeight: '700',
  },
});
