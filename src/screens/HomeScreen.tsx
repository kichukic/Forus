import { useState, type ReactElement, type ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type RefreshControlProps,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clearVideoCache, thumbnailUrl } from '../api/youtube';
import { clearCatalogCache, type CatalogMovie } from '../api/catalog';
import type { TorrentOption } from '../api/torrents';
import { LiveTileContent, VideoCardContent } from '../components/Cards';
import { FileCardContent } from '../components/FileCardContent';
import { FocusCard } from '../components/FocusCard';
import { HeroCarousel } from '../components/HeroCarousel';
import { SectionHeader } from '../components/Section';
import { TorboxRow } from '../components/TorboxRow';
import { NewRow, ThemeRow, VideoRow, cleanTitle } from '../components/VideoRow';
import { CatalogScreen } from './CatalogScreen';
import { HINDI_DRAMAS, HINDI_MOVIES, LIVE_NEWS, MOVIES, SHOWS, type SearchScope } from '../data/channels';
import { playableKey } from '../data/history';
import { THEMES, type Theme } from '../data/themes';
import { GLOW, GUTTER, colors, isTV } from '../theme';
import type { Playable } from '../types';

const THEMES_AT_START = 3;
const THEMES_PER_STEP = 3;

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'movies', label: 'Movies' },
  { id: 'shows', label: 'Shows' },
  { id: 'disha', label: 'For Disha Chotu' },
  { id: 'news', label: 'News' },
  { id: 'torbox', label: 'TorBox' },
] as const;
type Tab = (typeof TABS)[number]['id'];

const MOVIE_THEMES = THEMES.filter((t) => t.kind === 'movie');
const SHOW_THEMES = THEMES.filter((t) => t.kind === 'show');
const HINDI_THEMES = THEMES.filter((t) => t.kind === 'hindi');
const ALL_CHANNELS = [...SHOWS, ...MOVIES];
// The news channels' recorded uploads, one row each on the News tab.
const NEWS_SOURCES = LIVE_NEWS.map(({ name, channelId }) => ({ name, channelId }));

type Props = {
  history: Playable[];
  torboxVersion: number;
  onPlay: (item: Playable) => void;
  onOpenTorbox: () => void;
  // Opens search limited to the given tab's channels.
  onOpenSearch: (scope: SearchScope) => void;
  // Opens a film from the catalog.
  onOpenMovie: (movie: CatalogMovie) => void;
  // Sends a release found by searching to TorBox.
  onSendRelease: (option: TorrentOption) => void;
};

export function HomeScreen({
  history,
  torboxVersion,
  onPlay,
  onOpenTorbox,
  onOpenSearch,
  onOpenMovie,
  onSendRelease,
}: Props) {
  // Keeps the header clear of a phone's status bar and notch. Zero on TVs.
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('all');
  // A tab is only built the first time it is opened, then kept so its scroll
  // position and loaded rows survive switching away.
  const [opened, setOpened] = useState<Set<Tab>>(() => new Set(['all']));
  // Bumped on refresh; the rows are keyed on it, so they remount and refetch.
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const open = (t: Tab) => {
    setTab(t);
    setOpened((s) => (s.has(t) ? s : new Set(s).add(t)));
  };

  const refresh = () => {
    clearVideoCache();
    clearCatalogCache();
    setRefreshKey((k) => k + 1);
    // The rows show their own placeholders; this one only acknowledges the pull.
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  };

  const refreshControl = isTV ? undefined : (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={refresh}
      tintColor={colors.accent}
      colors={[colors.accent]}
      progressBackgroundColor={colors.surface}
    />
  );

  const playVideo = (v: { id: string; title: string }) => onPlay({ kind: 'video', videoId: v.id, title: v.title });

  const panel = (t: Tab, content: ReactNode) =>
    opened.has(t) && <View style={[styles.panel, tab !== t && styles.hidden]}>{content}</View>;

  const liveRow = (
    <View style={styles.row}>
      <SectionHeader title="Live News" subtitle="Kerala's news channels, streaming now" />
      <FlatList
        horizontal
        data={LIVE_NEWS}
        keyExtractor={(c) => c.channelId}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <FocusCard onPress={() => onPlay({ kind: 'live', channelId: item.channelId, title: item.name })}>
            <LiveTileContent name={item.name} color={item.color} />
          </FocusCard>
        )}
      />
    </View>
  );

  return (
    <View style={styles.screen}>
      {/* The purple haze behind the header. */}
      <LinearGradient colors={GLOW} style={styles.glow} pointerEvents="none" />

      <View style={[styles.top, { paddingTop: insets.top + (isTV ? 24 : 8) }]}>
        <View style={styles.header}>
          <View style={styles.brandBlock}>
            <Text style={styles.brand}>
              For<Text style={styles.brandAccent}>Us</Text>
            </Text>
          </View>
          {isTV && <RoundButton icon="refresh" label="Refresh" onPress={refresh} />}
          <RoundButton icon="search" label="Search" onPress={() => onOpenSearch(tab)} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {TABS.map((t) => (
            <TabButton key={t.id} label={t.label} active={tab === t.id} onPress={() => open(t.id)} />
          ))}
        </ScrollView>
      </View>

      {panel(
        'all',
        <TabScroll refreshControl={refreshControl}>
          <HeroCarousel key={`hero-all-${refreshKey}`} sources={ALL_CHANNELS} label="New today" onPlay={playVideo} />

          {history.length > 0 && (
            <View style={styles.row}>
              <SectionHeader title="Continue watching" />
              <FlatList
                horizontal
                data={history}
                keyExtractor={playableKey}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.list}
                renderItem={({ item }) => (
                  <FocusCard onPress={() => onPlay(item)}>
                    <HistoryCard item={item} />
                  </FocusCard>
                )}
              />
            </View>
          )}

          <NewRow key={`new-${refreshKey}`} onPlay={playVideo} />
          {liveRow}
        </TabScroll>,
      )}

      {panel(
        'movies',
        <TabScroll refreshControl={refreshControl} themes={MOVIE_THEMES} refreshKey={refreshKey} onPlay={playVideo}>
          <HeroCarousel key={`hero-movies-${refreshKey}`} sources={MOVIES} label="Trending movie" onPlay={playVideo} />
          {MOVIES.map((source) => (
            <VideoRow key={`${source.channelId}-${refreshKey}`} source={source} onPlay={playVideo} />
          ))}
        </TabScroll>,
      )}

      {panel(
        'shows',
        <TabScroll refreshControl={refreshControl} themes={SHOW_THEMES} refreshKey={refreshKey} onPlay={playVideo}>
          <HeroCarousel key={`hero-shows-${refreshKey}`} sources={SHOWS} label="New episode" onPlay={playVideo} />
          {SHOWS.map((source) => (
            <VideoRow key={`${source.channelId}-${refreshKey}`} source={source} onPlay={playVideo} />
          ))}
        </TabScroll>,
      )}

      {panel(
        'disha',
        <TabScroll refreshControl={refreshControl} themes={HINDI_THEMES} refreshKey={refreshKey} onPlay={playVideo}>
          <HeroCarousel key={`hero-disha-${refreshKey}`} sources={HINDI_MOVIES} label="Picked for Disha ♥" onPlay={playVideo} />
          {HINDI_MOVIES.map((source) => (
            <VideoRow key={`${source.channelId}-${refreshKey}`} source={source} onPlay={playVideo} />
          ))}
          {HINDI_DRAMAS.map((source) => (
            <VideoRow
              key={`${source.channelId}-${refreshKey}`}
              source={{ ...source, name: `Dramas in Hindi · ${source.name}` }}
              onPlay={playVideo}
            />
          ))}
        </TabScroll>,
      )}

      {panel(
        'news',
        <TabScroll refreshControl={refreshControl}>
          {liveRow}
          {NEWS_SOURCES.map((source) => (
            <VideoRow key={`${source.channelId}-${refreshKey}`} source={source} onPlay={playVideo} />
          ))}
        </TabScroll>,
      )}

      {panel(
        'torbox',
        <CatalogScreen
          key={`catalog-${refreshKey}`}
          embedded
          onOpen={onOpenMovie}
          onSend={onSendRelease}
          refreshControl={refreshControl}
          header={
            <View style={styles.row}>
              <SectionHeader title="My TorBox" subtitle="Your own cloud files, played right here" />
              <TorboxRow
                version={torboxVersion + refreshKey}
                onPlay={onPlay}
                onOpenSettings={onOpenTorbox}
              />
            </View>
          }
        />,
      )}
    </View>
  );
}

function HistoryCard({ item }: { item: Playable }) {
  if (item.kind === 'live') {
    const color = LIVE_NEWS.find((c) => c.channelId === item.channelId)?.color ?? colors.live;
    return <LiveTileContent name={item.title} color={color} />;
  }
  if (item.kind === 'file') return <FileCardContent fileName={item.title} detail="TorBox" />;
  return <VideoCardContent image={thumbnailUrl(item.videoId)} title={cleanTitle(item.title)} subtitle="Watch again" />;
}

type TabScrollProps = {
  children: ReactNode;
  refreshControl?: ReactElement<RefreshControlProps>;
  // Themed rows added at the bottom as it is scrolled.
  themes?: Theme[];
  refreshKey?: number;
  onPlay?: (v: { id: string; title: string }) => void;
};

// One tab's scrolling page, ending in its themed rows and the credit line.
function TabScroll({ children, refreshControl, themes = [], refreshKey = 0, onPlay }: TabScrollProps) {
  const [themeCount, setThemeCount] = useState(THEMES_AT_START);

  const onScroll = ({ nativeEvent: e }: NativeSyntheticEvent<NativeScrollEvent>) => {
    const fromBottom = e.contentSize.height - (e.contentOffset.y + e.layoutMeasurement.height);
    if (fromBottom < e.layoutMeasurement.height) {
      setThemeCount((n) => Math.min(n + THEMES_PER_STEP, themes.length));
    }
  };

  return (
    <ScrollView
      style={styles.panel}
      contentContainerStyle={styles.content}
      onScroll={themes.length ? onScroll : undefined}
      scrollEventThrottle={250}
      refreshControl={refreshControl}
    >
      {children}

      {themes.length > 0 && onPlay && (
        <>
          {themes.slice(0, themeCount).map((theme) => (
            <ThemeRow key={`${theme.query}-${refreshKey}`} theme={theme} onPlay={onPlay} />
          ))}
          {themeCount < themes.length && <ActivityIndicator color={colors.accent} style={styles.moreRows} />}
        </>
      )}

      <Text style={styles.credit}>
        Made with <Text style={styles.heart}>♥</Text> by Kishor
      </Text>
    </ScrollView>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[styles.tab, active && styles.tabActive, focused && styles.tabFocused]}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function RoundButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.round, (focused || pressed) && styles.roundActive]}
    >
      <Ionicons name={icon} size={isTV ? 24 : 20} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  hidden: { display: 'none' },
  panel: { flex: 1 },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 360 },
  top: { paddingBottom: isTV ? 12 : 8 },
  content: { paddingTop: isTV ? 8 : 6, paddingBottom: isTV ? 40 : 110 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isTV ? 14 : 10,
    paddingHorizontal: GUTTER,
    marginBottom: isTV ? 16 : 12,
  },
  brandBlock: { flex: 1 },
  brand: { color: colors.text, fontSize: isTV ? 32 : 25, fontWeight: '900', letterSpacing: -0.5 },
  brandAccent: { color: colors.accent },
  round: {
    width: isTV ? 50 : 42,
    height: isTV ? 50 : 42,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  roundActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  tabs: { gap: isTV ? 12 : 8, paddingHorizontal: GUTTER },
  tab: {
    paddingHorizontal: isTV ? 24 : 18,
    paddingVertical: isTV ? 10 : 8,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  tabActive: { backgroundColor: colors.accent },
  tabFocused: { borderColor: colors.text },
  tabText: { color: colors.muted, fontSize: isTV ? 17 : 13.5, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  tabTextActive: { color: '#fff' },
  row: { marginBottom: isTV ? 30 : 24 },
  list: { paddingHorizontal: GUTTER, paddingVertical: isTV ? 8 : 2 },
  moreRows: { marginVertical: 24 },
  credit: { color: colors.faint, fontSize: isTV ? 15 : 12.5, textAlign: 'center', marginTop: 8, fontWeight: '600' },
  heart: { color: colors.accent },
});
