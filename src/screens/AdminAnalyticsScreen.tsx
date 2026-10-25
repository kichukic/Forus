// Admin Analytics Screen: provides the platform admin with real-time visibility
// into who's currently online, active sessions, and cumulative screen time.
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAdminAnalytics, type AdminAnalyticsData, type AdminUserAnalytics } from '../chat/api';
import { useNavScrollHide } from '../data/navChrome';
import { GUTTER, colors, sz } from '../theme';

type Props = {
  onBack: () => void;
};

type ViewMode = 'online' | 'all';

function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${Math.max(0, Math.floor(totalSeconds))}s`;
  const mins = Math.floor(totalSeconds / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
}

function formatRelativeTime(isoString?: string): string {
  if (!isoString) return 'Never';
  const diffMs = Date.now() - new Date(isoString).getTime();
  if (diffMs < 60000) return 'Just now';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function AdminAnalyticsScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const navScroll = useNavScrollHide();
  const [data, setData] = useState<AdminAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>('online');

  const fetchStats = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError(null);
    try {
      const res = await getAdminAnalytics();
      setData(res);
    } catch (e) {
      setError((e as Error).message || 'Failed to load admin analytics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    getAdminAnalytics()
      .then((res) => {
        if (active) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (active) {
          setError((e as Error).message || 'Failed to load admin analytics');
          setLoading(false);
        }
      });

    // Auto-refresh stats every 20 seconds while on screen
    const interval = setInterval(() => {
      fetchStats();
    }, 20000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [fetchStats]);

  const listData = mode === 'online' ? data?.onlineUsers ?? [] : data?.users ?? [];

  return (
    <View style={[styles.screen, { paddingTop: insets.top + sz(10, 16) }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.heading}>Analytics</Text>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>
        <Pressable onPress={() => fetchStats(true)} hitSlop={10} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={sz(18, 20)} color={colors.accent} />
        </Pressable>
      </View>

      {/* Overview Metric Cards */}
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <View style={styles.statHeader}>
            <View style={[styles.statDot, { backgroundColor: '#10b981' }]} />
            <Text style={styles.statLabel}>Online Now</Text>
          </View>
          <Text style={[styles.statValue, { color: '#10b981' }]}>
            {data?.onlineCount ?? 0}
          </Text>
        </View>

        <View style={styles.statCard}>
          <View style={styles.statHeader}>
            <Ionicons name="people" size={sz(14, 16)} color={colors.accent} />
            <Text style={styles.statLabel}>Total Users</Text>
          </View>
          <Text style={styles.statValue}>{data?.totalUsers ?? 0}</Text>
        </View>

        <View style={styles.statCard}>
          <View style={styles.statHeader}>
            <Ionicons name="time" size={sz(14, 16)} color="#f59e0b" />
            <Text style={styles.statLabel}>Screen Time</Text>
          </View>
          <Text style={[styles.statValue, { color: '#f59e0b', fontSize: sz(16, 20) }]}>
            {formatDuration(data?.totalScreenTimeSeconds ?? 0)}
          </Text>
        </View>
      </View>

      {/* Segment Switch */}
      <View style={styles.segmentRow}>
        <Pressable
          onPress={() => setMode('online')}
          style={[styles.segmentBtn, mode === 'online' && styles.segmentBtnActive]}
        >
          <Text style={[styles.segmentText, mode === 'online' && styles.segmentTextActive]}>
            🟢 Online Now ({data?.onlineCount ?? 0})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setMode('all')}
          style={[styles.segmentBtn, mode === 'all' && styles.segmentBtnActive]}
        >
          <Text style={[styles.segmentText, mode === 'all' && styles.segmentTextActive]}>
            🏆 Screen Time ({data?.totalUsers ?? 0})
          </Text>
        </Pressable>
      </View>

      {/* Loading state */}
      {loading && !data && (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading analytics…</Text>
        </View>
      )}

      {/* Error state */}
      {error && !data && (
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle-outline" size={sz(40, 48)} color="#ef4444" />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => fetchStats(true)} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {/* User list */}
      {data && (
        <FlatList
          data={listData}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 110 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchStats(true)}
              tintColor={colors.accent}
            />
          }
          onScroll={(e) => navScroll(e.nativeEvent.contentOffset.y)}
          scrollEventThrottle={48}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>
                {mode === 'online' ? 'No other users online right now.' : 'No users found.'}
              </Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <UserRow item={item} rank={mode === 'all' ? index + 1 : undefined} />
          )}
        />
      )}
    </View>
  );
}

function UserRow({ item, rank }: { item: AdminUserAnalytics; rank?: number }) {
  return (
    <View style={styles.userCard}>
      {rank !== undefined && (
        <View style={styles.rankBadge}>
          <Text style={styles.rankText}>#{rank}</Text>
        </View>
      )}
      <View style={styles.avatarWrap}>
        <Text style={styles.avatarLetter}>
          {item.name ? item.name.charAt(0).toUpperCase() : '?'}
        </Text>
        {item.online && <View style={styles.onlineBadgeDot} />}
      </View>

      <View style={styles.userInfo}>
        <View style={styles.userNameRow}>
          <Text style={styles.userName}>{item.name}</Text>
          {item.isAdmin && (
            <View style={styles.adminBadge}>
              <Text style={styles.adminBadgeText}>ADMIN</Text>
            </View>
          )}
        </View>

        <Text style={styles.userContact} numberOfLines={1}>
          {item.email || (item.phone ? `+${item.phone}` : 'Anonymous')}
        </Text>

        <View style={styles.userStatusRow}>
          {item.online ? (
            <Text style={styles.statusOnline}>
              Active now ({formatDuration(item.currentSessionSeconds)} this session)
            </Text>
          ) : (
            <Text style={styles.statusOffline}>
              Last seen: {formatRelativeTime(item.lastActiveAt)}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.screenTimeCol}>
        <Text style={styles.screenTimeValue}>
          {formatDuration(item.totalScreenTimeSeconds)}
        </Text>
        <Text style={styles.screenTimeLabel}>Total Screen Time</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: GUTTER,
    marginBottom: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  heading: {
    color: colors.text,
    fontSize: sz(26, 32),
    fontWeight: '900',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
  },
  liveText: {
    color: '#10b981',
    fontSize: sz(10, 11),
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  refreshBtn: {
    width: sz(36, 40),
    height: sz(36, 40),
    borderRadius: sz(18, 20),
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: GUTTER,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: sz(10, 14),
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statLabel: {
    color: colors.muted,
    fontSize: sz(11, 12),
    fontWeight: '600',
  },
  statValue: {
    color: colors.text,
    fontSize: sz(18, 22),
    fontWeight: '900',
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: GUTTER,
    marginBottom: 12,
  },
  segmentBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingVertical: sz(8, 10),
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentBtnActive: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.accent,
  },
  segmentText: {
    color: colors.muted,
    fontSize: sz(12, 14),
    fontWeight: '700',
  },
  segmentTextActive: {
    color: colors.accent,
    fontWeight: '800',
  },
  listContent: {
    paddingHorizontal: GUTTER,
    paddingTop: 4,
    gap: 10,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: sz(12, 14),
    gap: 10,
  },
  rankBadge: {
    width: sz(24, 28),
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    color: colors.muted,
    fontSize: sz(12, 14),
    fontWeight: '800',
  },
  avatarWrap: {
    width: sz(40, 46),
    height: sz(40, 46),
    borderRadius: sz(20, 23),
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarLetter: {
    color: colors.accent,
    fontSize: sz(16, 20),
    fontWeight: '800',
  },
  onlineBadgeDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10b981',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  userInfo: {
    flex: 1,
    gap: 2,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  userName: {
    color: colors.text,
    fontSize: sz(14, 16),
    fontWeight: '800',
  },
  adminBadge: {
    backgroundColor: 'rgba(155, 92, 255, 0.2)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  adminBadgeText: {
    color: colors.accent,
    fontSize: sz(9, 10),
    fontWeight: '900',
  },
  userContact: {
    color: colors.muted,
    fontSize: sz(12, 13),
  },
  userStatusRow: {
    marginTop: 2,
  },
  statusOnline: {
    color: '#10b981',
    fontSize: sz(11, 12),
    fontWeight: '600',
  },
  statusOffline: {
    color: colors.muted,
    fontSize: sz(11, 12),
  },
  screenTimeCol: {
    alignItems: 'flex-end',
    gap: 2,
  },
  screenTimeValue: {
    color: colors.text,
    fontSize: sz(14, 16),
    fontWeight: '800',
  },
  screenTimeLabel: {
    color: colors.muted,
    fontSize: sz(10, 11),
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  loadingText: {
    color: colors.muted,
    fontSize: sz(13, 15),
  },
  errorText: {
    color: colors.muted,
    fontSize: sz(13, 15),
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 14,
  },
  retryBtnText: {
    color: '#0c0a12',
    fontWeight: '800',
    fontSize: sz(13, 14),
  },
  emptyWrap: {
    padding: 30,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.muted,
    fontSize: sz(13, 15),
  },
});
