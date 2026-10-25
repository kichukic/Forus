import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { deleteDownload, formatBytes, useDownloads, type DownloadItem } from '../data/downloads';
import { useNavScrollHide } from '../data/navChrome';
import { colors, isTV } from '../theme';
import type { Playable } from '../types';

type Props = {
  onBack?: () => void;
  onPlay: (item: Playable) => void;
};

export function DownloadsScreen({ onBack, onPlay }: Props) {
  const insets = useSafeAreaInsets();
  const downloads = useDownloads();
  // Scrolling the download list down tucks the bottom bar away.
  const navScroll = useNavScrollHide();

  const handlePlayOffline = (item: DownloadItem) => {
    onPlay({
      kind: 'stream',
      url: item.localUri,
      title: `${item.title} (Offline)`,
      poster: item.poster,
    });
  };

  const renderItem = ({ item }: { item: DownloadItem }) => {
    const isCompleted = item.status === 'completed';
    const isDownloading = item.status === 'downloading';
    const isFailed = item.status === 'failed';

    return (
      <View style={styles.card}>
        <View style={styles.thumbBox}>
          {item.poster ? (
            <Image source={{ uri: item.poster }} style={styles.poster} contentFit="cover" />
          ) : (
            <View style={styles.posterFallback}>
              <Ionicons name="film-outline" size={28} color={colors.muted} />
            </View>
          )}
          {isCompleted && (
            <Pressable
              onPress={() => handlePlayOffline(item)}
              style={({ pressed }) => [styles.playOverlay, pressed && styles.playPressed]}
            >
              <Ionicons name="play" size={24} color="#fff" />
            </Pressable>
          )}
        </View>

        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>

          {isCompleted && (
            <View style={styles.metaRow}>
              <View style={styles.badgeCompleted}>
                <Ionicons name="checkmark-circle" size={14} color="#4ade80" />
                <Text style={styles.badgeCompletedText}>Downloaded</Text>
              </View>
              <Text style={styles.sizeText}>{formatBytes(item.size)}</Text>
            </View>
          )}

          {isDownloading && (
            <View style={styles.progressWrap}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${item.progress}%` }]} />
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.progressText}>{item.progress}%</Text>
                <Text style={styles.sizeText}>
                  {formatBytes(item.downloadedBytes)} / {formatBytes(item.totalBytes)}
                </Text>
              </View>
            </View>
          )}

          {isFailed && (
            <View style={styles.metaRow}>
              <View style={styles.badgeFailed}>
                <Ionicons name="alert-circle" size={14} color="#f87171" />
                <Text style={styles.badgeFailedText}>Failed</Text>
              </View>
              {item.error ? (
                <Text style={styles.errorText} numberOfLines={1}>
                  {item.error}
                </Text>
              ) : null}
            </View>
          )}
        </View>

        <View style={styles.actions}>
          {isCompleted ? (
            <Pressable
              onPress={() => handlePlayOffline(item)}
              style={({ pressed }) => [styles.btnPlay, pressed && styles.btnPressed]}
            >
              <Ionicons name="play-circle" size={24} color={colors.accent} />
            </Pressable>
          ) : null}

          <Pressable
            onPress={() => deleteDownload(item.id)}
            hitSlop={10}
            style={({ pressed }) => [styles.btnDelete, pressed && styles.btnPressed]}
          >
            <Ionicons name="trash-outline" size={20} color={colors.muted} />
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Offline Downloads</Text>
          {downloads.length > 0 && (
            <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
              {downloads.length} {downloads.length === 1 ? 'item' : 'items'}
              {downloads.some((d) => d.status === 'downloading') ? ' · Downloading…' : ' · Ready for offline'}
            </Text>
          )}
        </View>
      </View>

      {downloads.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="cloud-download-outline" size={64} color={colors.muted} />
          <Text style={styles.emptyTitle}>No offline downloads</Text>
          <Text style={styles.emptySub}>
            Movies and episodes you download will appear here so you can watch them without internet.
          </Text>
        </View>
      ) : (
        <FlatList
          data={downloads}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          onScroll={(e) => navScroll(e.nativeEvent.contentOffset.y)}
          scrollEventThrottle={48}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    gap: 16,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    color: colors.text,
    fontSize: isTV ? 22 : 18,
    fontWeight: '800',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 8,
  },
  emptySub: {
    color: colors.muted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 110,
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  thumbBox: {
    width: 64,
    height: 96,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
    position: 'relative',
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  posterFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playPressed: {
    backgroundColor: 'rgba(229,9,20,0.6)',
  },
  info: {
    flex: 1,
    gap: 6,
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 2,
  },
  badgeCompleted: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badgeCompletedText: {
    color: '#4ade80',
    fontSize: 12,
    fontWeight: '700',
  },
  badgeFailed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badgeFailedText: {
    color: '#f87171',
    fontSize: 12,
    fontWeight: '700',
  },
  sizeText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  errorText: {
    color: '#f87171',
    fontSize: 11,
    flex: 1,
  },
  progressWrap: {
    gap: 4,
  },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  progressText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
  },
  actions: {
    alignItems: 'center',
    gap: 12,
  },
  btnPlay: {
    padding: 4,
  },
  btnDelete: {
    padding: 6,
  },
  btnPressed: {
    opacity: 0.6,
  },
});
