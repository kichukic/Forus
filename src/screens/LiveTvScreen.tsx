// Live TV: M3U playlists, their channel groups, and a guide when the playlist
// points at one. Playback goes through the same player shell as everything else.
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { File } from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  addPlaylistFromFile,
  addPlaylistFromUrl,
  loadIptv,
  refreshPlaylist,
  removePlaylist,
  type IptvChannel,
  type IptvData,
  type IptvPlaylist,
} from '../api/iptv';
import { programmeAt } from '../api/xmltv';
import { BOTTOM_NAV_HEIGHT } from '../components/BottomNav';
import { useNavScrollHide } from '../data/navChrome';
import { showToast } from '../data/toasts';
import { colors, isTV, sz } from '../theme';
import type { Playable } from '../types';

type Props = {
  onPlay: (item: Playable) => void;
  onBack: () => void;
};

const ALL = 'All';

// Free public playlists that work out of the box, so the Live tab is never
// empty on a fresh install. Failures are silent: the manual add UI stays.
const FEATURED_PLAYLISTS: { name: string; url: string }[] = [
  { name: 'iptv-org · News', url: 'https://iptv-org.github.io/iptv/categories/news.m3u' },
  { name: 'iptv-org · Sports', url: 'https://iptv-org.github.io/iptv/categories/sports.m3u' },
  { name: 'iptv-org · Movies', url: 'https://iptv-org.github.io/iptv/categories/movies.m3u' },
  { name: 'iptv-org · Entertainment', url: 'https://iptv-org.github.io/iptv/categories/entertainment.m3u' },
  { name: 'iptv-org · General', url: 'https://iptv-org.github.io/iptv/categories/general.m3u' },
  { name: 'iptv-org · Music', url: 'https://iptv-org.github.io/iptv/categories/music.m3u' },
  { name: 'iptv-org · Kids', url: 'https://iptv-org.github.io/iptv/categories/kids.m3u' },
  { name: 'iptv-org · Documentary', url: 'https://iptv-org.github.io/iptv/categories/documentary.m3u' },
  { name: 'iptv-org · Animation', url: 'https://iptv-org.github.io/iptv/categories/animation.m3u' },
  { name: 'iptv-org · Comedy', url: 'https://iptv-org.github.io/iptv/categories/comedy.m3u' },
];

function updatedLabel(ms: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export function LiveTvScreen({ onPlay, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const navScroll = useNavScrollHide();
  const [data, setData] = useState<IptvData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState(ALL);
  const [manageOpen, setManageOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addUrl, setAddUrl] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [busyPlaylist, setBusyPlaylist] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [settingUp, setSettingUp] = useState(false);

  const setupFeatured = async () => {
    setSettingUp(true);
    for (const featured of FEATURED_PLAYLISTS) {
      try {
        await addPlaylistFromUrl(featured.url, featured.name);
      } catch {
        // A bad or unreachable playlist must not stop the rest.
      }
      try {
        const next = await loadIptv();
        setData(next);
      } catch {
        // ignore
      }
    }
    setSettingUp(false);
  };

  useEffect(() => {
    let alive = true;
    loadIptv()
      .then((next) => {
        if (!alive) return;
        setData(next);
        // First run on a fresh install: pull in the featured playlists so the
        // tab is useful without any manual configuration.
        if (next.playlists.length === 0) {
          void setupFeatured();
        }
      })
      .catch(() => alive && setData({ playlists: [], channels: [], guide: {} }))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  // The guide's "on now" line moves on without a reload.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    // Kick off the first tick without a synchronous setState in the effect body.
    const first = setTimeout(() => setNow(Date.now()), 0);
    return () => {
      clearInterval(timer);
      clearTimeout(first);
    };
  }, []);

  const reload = async () => {
    const next = await loadIptv();
    setData(next);
  };

  const groups = useMemo(() => {
    const channels = data?.channels ?? [];
    const counts = new Map<string, number>();
    for (const channel of channels) {
      const name = channel.group || 'Ungrouped';
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [
      { name: ALL, count: channels.length },
      ...[...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([name, count]) => ({ name, count })),
    ];
  }, [data?.channels]);

  const activeGroup = groups.some((entry) => entry.name === group) ? group : ALL;

  const channels = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data?.channels ?? []).filter((channel) => {
      if (activeGroup !== ALL && channel.group !== activeGroup) return false;
      if (!needle) return true;
      return (
        channel.name.toLowerCase().includes(needle) ||
        channel.group.toLowerCase().includes(needle)
      );
    });
  }, [activeGroup, data?.channels, query]);

  const refreshAll = async () => {
    if (!data || data.playlists.length === 0) {
      await reload();
      return;
    }
    setRefreshing(true);
    let failed = 0;
    for (const playlist of data.playlists) {
      try {
        await refreshPlaylist(playlist.id);
      } catch {
        failed += 1;
      }
    }
    await reload();
    setRefreshing(false);
    showToast({
      text: failed > 0 ? `Refreshed · ${failed} playlist(s) failed` : 'Playlists refreshed',
    });
  };

  const refreshOne = async (playlist: IptvPlaylist) => {
    if (busyPlaylist) return;
    setBusyPlaylist(playlist.id);
    try {
      const count = await refreshPlaylist(playlist.id);
      await reload();
      showToast({ text: `${playlist.name}: ${count} channels` });
    } catch (e) {
      showToast({ text: (e as Error).message || 'Could not refresh the playlist.' });
    } finally {
      setBusyPlaylist(null);
    }
  };

  const removeOne = (playlist: IptvPlaylist) => {
    Alert.alert('Remove playlist?', playlist.name, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await removePlaylist(playlist.id);
          await reload();
          showToast({ text: 'Playlist removed' });
        },
      },
    ]);
  };

  const openAdd = () => {
    setAddError(null);
    setAddUrl('');
    setAddName('');
    setAddOpen(true);
  };

  const addFromUrl = async () => {
    if (addBusy) return;
    const url = addUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      setAddError('Paste a full http:// or https:// playlist address.');
      return;
    }
    setAddBusy(true);
    setAddError(null);
    try {
      const added = await addPlaylistFromUrl(url, addName.trim() || undefined);
      setAddOpen(false);
      await reload();
      showToast({ text: `Added ${added.playlist.name} · ${added.channels} channels` });
    } catch (e) {
      setAddError((e as Error).message || 'Could not read that playlist.');
    } finally {
      setAddBusy(false);
    }
  };

  const addFromFile = async () => {
    if (addBusy) return;
    setAddError(null);
    try {
      const picked = await File.pickFileAsync({ mimeTypes: ['*/*'] });
      if (picked.canceled) return;
      setAddBusy(true);
      const added = await addPlaylistFromFile(picked.result, addName.trim() || undefined);
      setAddOpen(false);
      await reload();
      showToast({ text: `Added ${added.playlist.name} · ${added.channels} channels` });
    } catch (e) {
      setAddError((e as Error).message || 'Could not read that file.');
    } finally {
      setAddBusy(false);
    }
  };

  const playChannel = (channel: IptvChannel) => {
    onPlay({
      kind: 'stream',
      url: channel.url,
      title: channel.name,
      poster: channel.logo || undefined,
      live: true,
      headers: channel.headers,
    });
  };

  const renderChannel = ({ item, index }: { item: IptvChannel; index: number }) => {
    const programme = data ? programmeAt(data.guide, item.id, now) : null;
    const onNow = programme ? programme.start <= now && programme.stop > now : false;
    return (
      <Pressable
        onPress={() => playChannel(item)}
        hasTVPreferredFocus={isTV && index === 0}
        style={({ focused, pressed }) => [
          styles.channel,
          (focused || pressed) && styles.channelActive,
        ]}
      >
        <View style={styles.logoWrap}>
          {item.logo ? (
            <Image source={{ uri: item.logo }} style={styles.logo} contentFit="contain" />
          ) : (
            <Ionicons name="tv-outline" size={isTV ? 26 : 22} color={colors.muted} />
          )}
        </View>
        <Text style={styles.channelName} numberOfLines={2}>
          {item.name}
        </Text>
        {programme ? (
          <Text style={[styles.channelMeta, onNow && styles.channelOnNow]} numberOfLines={1}>
            {onNow ? '● ' : ''}{programme.title}
          </Text>
        ) : (
          <Text style={styles.channelMeta} numberOfLines={1}>
            {item.group}
          </Text>
        )}
      </Pressable>
    );
  };

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + (isTV ? 18 : 10) }]}>
      <Pressable onPress={onBack} style={styles.back} hitSlop={12} accessibilityLabel="Back">
        <Ionicons name="chevron-back" size={isTV ? 28 : 24} color={colors.text} />
      </Pressable>
      <View style={styles.headerMain}>
        <Text style={styles.title}>Live TV</Text>
        <Text style={styles.subtitle}>
          {data ? `${data.channels.length} channels · ${data.playlists.length} playlists` : 'Loading channels…'}
        </Text>
      </View>
      <Pressable onPress={refreshAll} style={styles.iconBtn} hitSlop={8} accessibilityLabel="Refresh playlists">
        {refreshing ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : (
          <Ionicons name="refresh" size={21} color={colors.text} />
        )}
      </Pressable>
      <Pressable
        onPress={() => setManageOpen(true)}
        style={styles.iconBtn}
        hitSlop={8}
        accessibilityLabel="Manage playlists"
      >
        <Ionicons name="list" size={22} color={colors.text} />
      </Pressable>
      <Pressable onPress={openAdd} style={styles.addBtn} hitSlop={8} accessibilityLabel="Add playlist">
        <Ionicons name="add" size={22} color="#fff" />
      </Pressable>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.loadingText}>Reading playlists…</Text>
        </View>
      </View>
    );
  }

  const hasPlaylists = (data?.playlists.length ?? 0) > 0;

  return (
    <View style={styles.screen}>
      {header}

      {!hasPlaylists ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="tv-outline" size={40} color={colors.accent} />
          </View>
          {settingUp ? (
            <>
              <ActivityIndicator color={colors.accent} size="large" />
              <Text style={styles.emptyTitle}>Setting up channels…</Text>
              <Text style={styles.emptyText}>
                Downloading a few free playlists. This only happens once.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.emptyTitle}>No channels yet</Text>
              <Text style={styles.emptyText}>
                Add a playlist by URL or file, or grab a free one below.
              </Text>
              <View style={styles.featured}>
                {FEATURED_PLAYLISTS.map((featured) => (
                  <Pressable
                    key={featured.url}
                    onPress={async () => {
                      setAddBusy(true);
                      try {
                        const added = await addPlaylistFromUrl(featured.url, featured.name);
                        await reload();
                        showToast({ text: `Added ${added.playlist.name} · ${added.channels} channels` });
                      } catch (e) {
                        showToast({ text: (e as Error).message || 'Could not read that playlist.' });
                      } finally {
                        setAddBusy(false);
                      }
                    }}
                    disabled={addBusy || settingUp}
                    style={({ pressed }) => [styles.featuredBtn, pressed && styles.pressed, (addBusy || settingUp) && styles.disabled]}
                  >
                    <Ionicons name="flash-outline" size={16} color={colors.accent} />
                    <Text style={styles.featuredText}>{featured.name}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable onPress={openAdd} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.primaryText}>Add your own playlist</Text>
              </Pressable>
            </>
          )}
        </View>
      ) : (
        <>
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search channels"
              placeholderTextColor={colors.muted}
              style={styles.search}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.groups}
            style={styles.groupsBar}
          >
            {groups.map((entry) => {
              const active = entry.name === activeGroup;
              return (
                <Pressable
                  key={entry.name}
                  onPress={() => setGroup(entry.name)}
                  style={({ focused, pressed }) => [
                    styles.group,
                    active && styles.groupActive,
                    (focused || pressed) && styles.groupFocused,
                  ]}
                >
                  <Text style={[styles.groupText, active && styles.groupTextActive]} numberOfLines={1}>
                    {entry.name}
                  </Text>
                  <Text style={[styles.groupCount, active && styles.groupTextActive]}>
                    {entry.count}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <FlatList
            data={channels}
            keyExtractor={(channel) => `${channel.playlistId}:${channel.url}`}
            numColumns={isTV ? 6 : 5}
            columnWrapperStyle={styles.columnWrap}
            renderItem={renderChannel}
            contentContainerStyle={[
              styles.list,
              { paddingBottom: (isTV ? 40 : BOTTOM_NAV_HEIGHT + insets.bottom) + 28 },
            ]}
            onScroll={(event) => navScroll(event.nativeEvent.contentOffset.y)}
            scrollEventThrottle={48}
            initialNumToRender={isTV ? 14 : 10}
            maxToRenderPerBatch={10}
            windowSize={7}
            refreshControl={
              isTV ? undefined : (
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={refreshAll}
                  tintColor={colors.accent}
                  colors={[colors.accent]}
                  progressBackgroundColor={colors.surface}
                />
              )
            }
            ListEmptyComponent={
              <View style={styles.noResults}>
                <Ionicons name="search-outline" size={32} color={colors.muted} />
                <Text style={styles.noResultsText}>No channels match “{query}”.</Text>
              </View>
            }
          />
        </>
      )}

      <Modal visible={manageOpen} transparent animationType="fade" onRequestClose={() => setManageOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setManageOpen(false)}>
          <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Playlists</Text>
              <Pressable onPress={() => setManageOpen(false)} hitSlop={12} style={styles.close}>
                <Ionicons name="close" size={20} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView style={styles.playlistList}>
              {(data?.playlists ?? []).map((playlist) => (
                <View key={playlist.id} style={styles.playlistRow}>
                  <View style={styles.playlistIcon}>
                    <Ionicons
                      name={playlist.kind === 'url' ? 'link-outline' : 'document-outline'}
                      size={18}
                      color={colors.accent}
                    />
                  </View>
                  <View style={styles.playlistMain}>
                    <Text style={styles.playlistName} numberOfLines={1}>
                      {playlist.name}
                    </Text>
                    <Text style={styles.playlistMeta} numberOfLines={1}>
                      {playlist.channelCount} channels · {updatedLabel(playlist.updatedAt)}
                      {playlist.epgUrl ? ' · guide' : ''}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => refreshOne(playlist)}
                    disabled={busyPlaylist !== null}
                    hitSlop={8}
                    style={styles.smallAction}
                  >
                    {busyPlaylist === playlist.id ? (
                      <ActivityIndicator size="small" color={colors.accent} />
                    ) : (
                      <Ionicons name="refresh" size={18} color={colors.muted} />
                    )}
                  </Pressable>
                  <Pressable onPress={() => removeOne(playlist)} hitSlop={8} style={styles.smallAction}>
                    <Ionicons name="trash-outline" size={18} color={colors.muted} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
            <Pressable
              onPress={() => {
                setManageOpen(false);
                openAdd();
              }}
              style={({ pressed }) => [styles.sheetAdd, pressed && styles.pressed]}
            >
              <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
              <Text style={styles.sheetAddText}>Add playlist</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <KeyboardAvoidingView
          style={styles.backdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.backdrop} onPress={() => !addBusy && setAddOpen(false)}>
            <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
              <View style={styles.sheetHead}>
                <Text style={styles.sheetTitle}>Add playlist</Text>
                <Pressable onPress={() => setAddOpen(false)} hitSlop={12} style={styles.close}>
                  <Ionicons name="close" size={20} color={colors.text} />
                </Pressable>
              </View>
              <Text style={styles.label}>Name (optional)</Text>
              <TextInput
                value={addName}
                onChangeText={setAddName}
                placeholder="My channels"
                placeholderTextColor={colors.muted}
                style={styles.input}
                editable={!addBusy}
              />
              <Text style={[styles.label, styles.labelSpaced]}>Playlist URL</Text>
              <TextInput
                value={addUrl}
                onChangeText={setAddUrl}
                placeholder="https://example.com/playlist.m3u"
                placeholderTextColor={colors.muted}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                editable={!addBusy}
              />
              {addError ? <Text style={styles.addError}>{addError}</Text> : null}
              <Pressable
                onPress={addFromUrl}
                disabled={addBusy}
                style={({ pressed }) => [styles.primary, pressed && styles.pressed, addBusy && styles.disabled]}
              >
                {addBusy ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="cloud-download-outline" size={18} color="#fff" />
                )}
                <Text style={styles.primaryText}>{addBusy ? 'Reading playlist…' : 'Add from URL'}</Text>
              </Pressable>
              {!isTV ? (
                <Pressable
                  onPress={addFromFile}
                  disabled={addBusy}
                  style={({ pressed }) => [styles.secondary, pressed && styles.pressed, addBusy && styles.disabled]}
                >
                  <Ionicons name="folder-open-outline" size={18} color={colors.accent} />
                  <Text style={styles.secondaryText}>Choose an .m3u file</Text>
                </Pressable>
              ) : null}
              <Text style={styles.hint}>
                Playlists are parsed on this phone. The guide is used when the playlist includes an
                XMLTV address.
              </Text>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isTV ? 14 : 8,
    paddingHorizontal: isTV ? 28 : 14,
    paddingBottom: 10,
  },
  back: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  headerMain: { flex: 1 },
  title: { color: colors.text, fontSize: isTV ? 28 : 22, fontWeight: '900' },
  subtitle: { color: colors.muted, fontSize: isTV ? 14 : 11.5, marginTop: 2, fontWeight: '600' },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: colors.muted, fontSize: 13 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: isTV ? 80 : 36,
    gap: 12,
  },
  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  emptyTitle: { color: colors.text, fontSize: isTV ? 26 : 20, fontWeight: '900', marginTop: 6 },
  emptyText: {
    color: colors.muted,
    fontSize: isTV ? 16 : 14,
    lineHeight: isTV ? 24 : 21,
    textAlign: 'center',
    maxWidth: 460,
  },
  featured: { width: '100%', maxWidth: 460, gap: 8, marginTop: 6 },
  featuredBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  featuredText: { color: colors.text, fontSize: isTV ? 15 : 13, fontWeight: '700' },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 22,
    backgroundColor: colors.accent,
  },
  primaryText: { color: '#fff', fontSize: isTV ? 16 : 14, fontWeight: '800' },
  secondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 10,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 20,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(155,92,255,0.35)',
  },
  secondaryText: { color: colors.accent, fontSize: isTV ? 15 : 13, fontWeight: '800' },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.7 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: isTV ? 28 : 14,
    marginTop: 4,
    paddingHorizontal: 13,
    height: isTV ? 46 : 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  search: { flex: 1, color: colors.text, fontSize: isTV ? 16 : 14, paddingVertical: 0 },
  groupsBar: { flexGrow: 0, marginTop: 10, height: isTV ? 60 : 56 },
  groups: { gap: 8, paddingHorizontal: isTV ? 28 : 14, paddingVertical: 2 },
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: isTV ? 10 : 9,
    borderRadius: 19,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: 'transparent',
    maxWidth: isTV ? 260 : 190,
    overflow: 'visible',
  },
  groupActive: { backgroundColor: colors.accent },
  groupFocused: { borderColor: colors.text },
  groupText: { color: colors.muted, fontSize: isTV ? 14 : 12, fontWeight: '800', flexShrink: 1, lineHeight: isTV ? 18 : 16 },
  groupCount: { color: colors.faint, fontSize: isTV ? 12 : 10, fontWeight: '800', lineHeight: isTV ? 16 : 14 },
  groupTextActive: { color: '#fff' },
  list: { paddingHorizontal: isTV ? 28 : 10, paddingTop: 10, gap: 8 },
  columnWrap: { gap: 8, justifyContent: 'flex-start' },
  channel: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    padding: isTV ? 10 : 8,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  channelActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  logoWrap: {
    width: '100%',
    aspectRatio: 1.6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
  },
  logo: { width: '86%', height: '86%' },
  channelName: { color: colors.text, fontSize: isTV ? 14 : 11.5, fontWeight: '700', textAlign: 'center' },
  channelMeta: { color: colors.muted, fontSize: isTV ? 11 : 9.5, textAlign: 'center' },
  channelOnNow: { color: colors.accent },
  noResults: { alignItems: 'center', paddingTop: 60, gap: 10 },
  noResultsText: { color: colors.muted, fontSize: 13, textAlign: 'center' },
  backdrop: {
    flex: 1,
    justifyContent: isTV ? 'center' : 'flex-end',
    alignItems: isTV ? 'center' : 'stretch',
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  sheet: {
    width: isTV ? 560 : '100%',
    maxHeight: '88%',
    paddingHorizontal: sz(18, 24),
    paddingTop: sz(18, 22),
    paddingBottom: isTV ? sz(20, 24) : 34,
    borderTopLeftRadius: isTV ? 18 : 22,
    borderTopRightRadius: isTV ? 18 : 22,
    borderRadius: isTV ? 18 : 0,
    backgroundColor: colors.surface,
    borderWidth: isTV ? 1 : 0,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sheetTitle: { color: colors.text, fontSize: isTV ? 22 : 18, fontWeight: '900' },
  close: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  playlistList: { flexGrow: 0, maxHeight: 320 },
  playlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  playlistIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  playlistMain: { flex: 1 },
  playlistName: { color: colors.text, fontSize: isTV ? 15 : 13.5, fontWeight: '700' },
  playlistMeta: { color: colors.muted, fontSize: isTV ? 12 : 11, marginTop: 2 },
  smallAction: { padding: 6 },
  sheetAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 14,
    paddingVertical: 11,
    borderRadius: 18,
    backgroundColor: colors.accentSoft,
  },
  sheetAddText: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  label: {
    color: colors.muted,
    fontSize: isTV ? 13 : 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  labelSpaced: { marginTop: 14 },
  input: {
    height: isTV ? 46 : 42,
    borderRadius: 12,
    paddingHorizontal: 12,
    color: colors.text,
    fontSize: isTV ? 16 : 14,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addError: { color: colors.live, fontSize: isTV ? 13 : 12, marginTop: 10, lineHeight: 18 },
  hint: {
    color: colors.muted,
    fontSize: isTV ? 12 : 11,
    lineHeight: isTV ? 18 : 16,
    marginTop: 12,
    textAlign: 'center',
  },
});
