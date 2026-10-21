import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
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
import type { MovieboxSubject } from '../api/moviebox';
import type { TorrentOption } from '../api/torrents';
import { LiveTileContent, VideoCardContent } from '../components/Cards';
import { FileCardContent } from '../components/FileCardContent';
import { FocusCard } from '../components/FocusCard';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { HeroCarousel } from '../components/HeroCarousel';
import { MovieboxRow } from '../components/MovieboxRow';
import { SectionHeader } from '../components/Section';
import { TorboxRow } from '../components/TorboxRow';
import { NewRow, ThemeRow, VideoRow, cleanTitle } from '../components/VideoRow';
import { CatalogScreen } from './CatalogScreen';
import { MovieboxScreen } from './MovieboxScreen';
import { HINDI_DRAMAS, HINDI_MOVIES, LIVE_NEWS, MOVIES, SHOWS, type SearchScope } from '../data/channels';
import { playableKey } from '../data/history';
import { THEMES, type Theme } from '../data/themes';
import { GLOW, GUTTER, colors, isTV, sz } from '../theme';
import type { Playable } from '../types';

const THEMES_AT_START = 3;
const THEMES_PER_STEP = 3;

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'moviebox', label: 'MovieBox' },
  { id: 'movies', label: 'Malayalam Movies' },
  { id: 'shows', label: 'Shows' },
  { id: 'disha', label: 'For Disha Chotu' },
  { id: 'news', label: 'News' },
  { id: 'torbox', label: 'TorBox' },
] as const;
type Tab = (typeof TABS)[number]['id'];

const MOVIE_THEMES = THEMES.filter((t) => t.kind === 'movie');
const SHOW_THEMES = THEMES.filter((t) => t.kind === 'show');
const HINDI_THEMES = THEMES.filter((t) => t.kind === 'hindi');
// The All tab is a mix of everything, so it carries the themed rows of the
// other tabs as well.
const ALL_THEMES = [...MOVIE_THEMES, ...SHOW_THEMES, ...HINDI_THEMES];
const ALL_CHANNELS = [...SHOWS, ...MOVIES];
// Where each tab was left. Only the tab in front is mounted, so the place is
// kept here instead of in the tab itself.
const scrollPositions = new Map<string, number>();
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
  // Opens a film from MovieBox.
  onOpenMoviebox: (subject: MovieboxSubject) => void;
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
  onOpenMoviebox,
  onSendRelease,
}: Props) {
  // Keeps the header clear of a phone's status bar and notch. Zero on TVs.
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('all');
  // Bumped on refresh; the rows are keyed on it, so they remount and refetch.
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Which way the content slides in: from the right when moving to a tab
  // further along, from the left when moving back.
  const direction = useRef(1);
  const open = (t: Tab) => {
    if (t === tab) return;
    direction.current = TABS.findIndex((x) => x.id === t) > TABS.findIndex((x) => x.id === tab) ? 1 : -1;
    setTab(t);
  };

  // The purple pill behind the tabs glides to the selected one, taking its
  // width, instead of jumping.
  const tabBar = useRef<ScrollView>(null);
  const tabLayouts = useRef<Partial<Record<Tab, { x: number; width: number }>>>({});
  const pillX = useRef(new Animated.Value(0)).current;
  const pillWidth = useRef(new Animated.Value(0)).current;
  const pillPlaced = useRef(false);

  const movePill = (animated: boolean) => {
    const layout = tabLayouts.current[tab];
    if (!layout) return;
    if (!animated) {
      pillX.setValue(layout.x);
      pillWidth.setValue(layout.width);
    } else {
      const spring = { useNativeDriver: false, speed: 18, bounciness: 7 };
      Animated.parallel([
        Animated.spring(pillX, { toValue: layout.x, ...spring }),
        Animated.spring(pillWidth, { toValue: layout.width, ...spring }),
      ]).start();
    }
    // Keep the selected tab in view on narrow screens.
    tabBar.current?.scrollTo({ x: Math.max(0, layout.x - GUTTER * 2), animated });
  };

  useEffect(() => {
    movePill(pillPlaced.current);
  }, [tab]);

  const onTabLayout = (t: Tab, x: number, width: number) => {
    tabLayouts.current[t] = { x, width };
    if (t === tab && !pillPlaced.current) {
      pillPlaced.current = true;
      movePill(false);
    }
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

  // Only the tab in front is mounted. Keeping the others alive holds their
  // images and rows in memory, and a phone with little of it gets killed when
  // a heavy tab is opened on top of them.
  const panel = (t: Tab, content: ReactNode) =>
    t === tab ? (
      <SlideIn key={t} direction={direction.current}>
        <ErrorBoundary label={TABS.find((entry) => entry.id === t)?.label}>{content}</ErrorBoundary>
      </SlideIn>
    ) : null;

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

      <View style={[styles.top, { paddingTop: insets.top + (sz(8, 24)) }]}>
        <View style={styles.header}>
          <View style={styles.brandBlock}>
            <Text style={styles.brand}>
              For<Text style={styles.brandAccent}>Us</Text>
            </Text>
          </View>
          {isTV && <RoundButton icon="refresh" label="Refresh" onPress={refresh} />}
          <RoundButton icon="search" label="Search" onPress={() => onOpenSearch(tab === 'moviebox' ? 'all' : tab)} />
        </View>
        <ScrollView ref={tabBar} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          <Animated.View style={[styles.pill, { left: pillX, width: pillWidth }]} />
          {TABS.map((t) => (
            <TabButton
              key={t.id}
              label={t.label}
              active={tab === t.id}
              onPress={() => open(t.id)}
              onLayout={(x, width) => onTabLayout(t.id, x, width)}
            />
          ))}
        </ScrollView>
      </View>

      {panel(
        'all',
        <TabScroll
          refreshControl={refreshControl}
          themes={ALL_THEMES}
          tabKey="all"
          refreshKey={refreshKey}
          onPlay={playVideo}
        >
          {/* The news channels lead the page: they are what's on right now. */}
          {liveRow}
          <HeroCarousel key={`hero-all-${refreshKey}`} sources={ALL_CHANNELS} label="New today" onPlay={playVideo} />

          {/* A row of films from MovieBox, so the page holds everything. */}
          <MovieboxRow
            key={`moviebox-row-${refreshKey}`}
            version={refreshKey}
            onOpen={onOpenMoviebox}
          />

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
        </TabScroll>,
      )}

      {panel(
        'movies',
        <TabScroll refreshControl={refreshControl} themes={MOVIE_THEMES} tabKey="movies" refreshKey={refreshKey} onPlay={playVideo}>
          <HeroCarousel key={`hero-movies-${refreshKey}`} sources={MOVIES} label="Trending movie" onPlay={playVideo} />
          {MOVIES.map((source) => (
            <VideoRow key={`${source.channelId}-${refreshKey}`} source={source} onPlay={playVideo} />
          ))}
        </TabScroll>,
      )}

      {panel(
        'shows',
        <TabScroll refreshControl={refreshControl} themes={SHOW_THEMES} tabKey="shows" refreshKey={refreshKey} onPlay={playVideo}>
          <HeroCarousel key={`hero-shows-${refreshKey}`} sources={SHOWS} label="New episode" onPlay={playVideo} />
          {SHOWS.map((source) => (
            <VideoRow key={`${source.channelId}-${refreshKey}`} source={source} onPlay={playVideo} />
          ))}
        </TabScroll>,
      )}

      {panel(
        'disha',
        <TabScroll refreshControl={refreshControl} themes={HINDI_THEMES} tabKey="disha" refreshKey={refreshKey} onPlay={playVideo}>
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
        <TabScroll refreshControl={refreshControl} tabKey="news">
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

      {panel(
        'moviebox',
        <MovieboxScreen
          key={`moviebox-${refreshKey}`}
          embedded
          onOpen={onOpenMoviebox}
          refreshControl={refreshControl}
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
  if (item.kind === 'moviebox') {
    return <VideoCardContent image={item.poster} title={item.title} subtitle="Watch again" />;
  }
  return <VideoCardContent image={thumbnailUrl(item.videoId)} title={cleanTitle(item.title)} subtitle="Watch again" />;
}

type TabScrollProps = {
  children: ReactNode;
  refreshControl?: ReactElement<RefreshControlProps>;
  // Themed rows added at the bottom as it is scrolled.
  themes?: Theme[];
  refreshKey?: number;
  onPlay?: (v: { id: string; title: string }) => void;
  // Keeps this tab's place, so it comes back where it was left.
  tabKey?: string;
};

// One tab's scrolling page, ending in its themed rows and the credit line.
function TabScroll({ children, refreshControl, themes = [], refreshKey = 0, onPlay, tabKey }: TabScrollProps) {
  const [themeCount, setThemeCount] = useState(THEMES_AT_START);
  const scroll = useRef<ScrollView>(null);
  // Where this tab was left, put back once the rows have their height.
  const restore = useRef(tabKey ? (scrollPositions.get(tabKey) ?? 0) : 0);

  const onScroll = ({ nativeEvent: e }: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.contentOffset.y;
    if (tabKey) scrollPositions.set(tabKey, y);
    // The place to come back to is kept until it is actually reached.
    if (restore.current > 0 && y >= restore.current - 4) restore.current = 0;
    const fromBottom = e.contentSize.height - (y + e.layoutMeasurement.height);
    if (fromBottom < e.layoutMeasurement.height) {
      setThemeCount((n) => Math.min(n + THEMES_PER_STEP, themes.length));
    }
  };

  // The rows come back in one by one, so the place to come back to is put
  // back each time the page grows.
  const restorePlace = () => {
    if (restore.current > 0) scroll.current?.scrollTo({ y: restore.current, animated: false });
  };

  return (
    <ScrollView
      ref={scroll}
      style={styles.panel}
      contentContainerStyle={styles.content}
      onScroll={themes.length || tabKey ? onScroll : undefined}
      onContentSizeChange={restorePlace}
      onTouchStart={() => {
        // A touch means the user is here now, not on their way back.
        restore.current = 0;
      }}
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

// A tab's new content fades in and slides a little from the side being moved
// towards.
function SlideIn({ direction, children }: { direction: number; children: ReactNode }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, []);
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [direction * 36, 0] });
  return <Animated.View style={[styles.panel, { opacity: progress, transform: [{ translateX }] }]}>{children}</Animated.View>;
}

function TabButton({
  label,
  active,
  onPress,
  onLayout,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  onLayout: (x: number, width: number) => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onLayout={(e) => onLayout(e.nativeEvent.layout.x, e.nativeEvent.layout.width)}
      // The selected tab's purple comes from the sliding pill behind it.
      style={[styles.tab, focused && styles.tabFocused]}
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
      <Ionicons name={icon} size={sz(20, 24)} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  hidden: { display: 'none' },
  panel: { flex: 1 },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 360 },
  top: { paddingBottom: sz(8, 12) },
  content: { paddingTop: sz(6, 8), paddingBottom: sz(110, 40) },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sz(10, 14),
    paddingHorizontal: GUTTER,
    marginBottom: sz(12, 16),
  },
  brandBlock: { flex: 1 },
  brand: { color: colors.text, fontSize: sz(25, 32), fontWeight: '900', letterSpacing: -0.5 },
  brandAccent: { color: colors.accent },
  round: {
    width: sz(42, 50),
    height: sz(42, 50),
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  roundActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  tabs: { gap: sz(8, 12), paddingHorizontal: GUTTER },
  tab: {
    paddingHorizontal: sz(18, 24),
    paddingVertical: sz(8, 10),
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  pill: { position: 'absolute', top: 0, bottom: 0, borderRadius: 22, backgroundColor: colors.accent },
  tabFocused: { borderColor: colors.text },
  tabText: { color: colors.muted, fontSize: sz(13.5, 17), fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  tabTextActive: { color: '#fff' },
  row: { marginBottom: sz(24, 30) },
  list: { paddingHorizontal: GUTTER, paddingVertical: sz(2, 8) },
  moreRows: { marginVertical: 24 },
  heart: { color: colors.accent },
  credit: { color: colors.faint, fontSize: sz(12.5, 15), textAlign: 'center', marginTop: 8, fontWeight: '600' },
});
