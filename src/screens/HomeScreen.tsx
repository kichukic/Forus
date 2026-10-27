import { Children, isValidElement, memo, useEffect, useImperativeHandle, useRef, useState, type ReactElement, type ReactNode, type Ref } from 'react';
import {
  Animated,
  AppState,
  Easing,
  FlatList,
  Platform,
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
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clearVideoCache, thumbnailUrl } from '../api/youtube';
import { clearCatalogCache, type CatalogMovie } from '../api/catalog';
import type { StreamioItem } from '../api/streamiobox';
import type { MovieboxSubject } from '../api/moviebox';
import type { TorrentOption } from '../api/torrents';
import { LiveTileContent, VideoCardContent } from '../components/Cards';
import { FileCardContent } from '../components/FileCardContent';
import { FocusCard } from '../components/FocusCard';
import { FocusRow } from '../components/FocusRow';
import { ListFrame } from '../components/ListFrame';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { HeroCarousel } from '../components/HeroCarousel';
import { MovieboxRow } from '../components/MovieboxRow';
import { CinemasRow } from '../components/CinemasRow';
import { ReelsHomeRow } from '../components/ReelsHomeRow';
import type { ReelItem } from '../api/reels';
import { SectionHeader } from '../components/Section';
import { TorboxRow } from '../components/TorboxRow';
import { NewRow, ThemeRow, VideoRow, cleanTitle } from '../components/VideoRow';
import { CatalogScreen } from './CatalogScreen';
import { StreamioBoxScreen } from './StreamioBoxScreen';
import { MovieboxScreen } from './MovieboxScreen';
import { JackBoxScreen } from './JackBoxScreen';
import { HINDI_DRAMAS, HINDI_MOVIES, LIVE_NEWS, MOVIES, SHOWS, type SearchScope } from '../data/channels';
import { playableKey } from '../data/history';
import { useNavScrollHide } from '../data/navChrome';
import { heroProgress, resetHeroScroll, setHeroScroll } from '../data/heroChrome';
import { THEMES, type Theme } from '../data/themes';
import { CARD_WIDTH, GLOW, GUTTER, colors, isTV, sz } from '../theme';
import { TransferList } from '../components/TransferList';
import type { Playable } from '../types';
import { useEvent } from '../hooks/useEvent';
import { shareOnLongPress } from '../chat/share';
import { SkeletonLoader } from '../components/SkeletonLoader';

// Each themed row is a search of about 0.7 MB. A TV starts with one and reads
// the rest as the page is scrolled down to them.
// How long a tab that opens tries to get back to where it was left.
const RESTORE_WINDOW_MS = 1500;
const THEMES_AT_START = isTV ? 1 : 3;
const THEMES_PER_STEP = isTV ? 2 : 3;
// Back in the app after this long, the rows reload by themselves.
const STALE_AFTER_MS = 10 * 60 * 1000;

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'moviebox', label: 'MovieBox' },
  { id: 'streamiobox', label: 'StreamioBox' },
  { id: 'jackbox', label: 'JACKBOX' },
  { id: 'movies', label: 'Malayalam Movies' },
  { id: 'shows', label: 'Shows' },
  { id: 'hindi', label: 'Hindi' },
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
const HERO_ALL_SOURCES = MOVIES;
// Where each tab was left. Only the tab in front is mounted, so the place is
// kept here instead of in the tab itself.
const scrollPositions = new Map<string, number>();
// The page of the tab in front, for the TV Back button to scroll to the top.
const activePage: { current: FlatList<ReactNode> | null } = { current: null };
// TV: how long a tab must stay highlighted before it opens, so moving across
// several tabs doesn't load each one on the way.
const TAB_FOCUS_DELAY_MS = 350;
// The news channels' recorded uploads, one row each on the News tab.
const NEWS_SOURCES = LIVE_NEWS.map(({ name, channelId }) => ({ name, channelId }));
// A time-of-day greeting for the header.
function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Burning the midnight oil';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Winding down';
}

// Gradient fill that slides behind the active tab, with a soft accent glow.
const PILL_GRADIENT = ['#b478ff', '#7d3ff0'] as const;
// The frosted sheen laid over the header as the hero collapses.
const FROST_TOP = 'rgba(28,22,40,0.92)' as const;
const FROST_BOTTOM = 'rgba(18,14,26,0.6)' as const;
// Room the greeting line takes; it interpolates to zero as the hero collapses.
const GREET_H = sz(24, 30);

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
  // Opens a series from StreamioBox.
  onOpenStreamioSeries: (item: StreamioItem) => void;
  // Sends a release found by searching to TorBox.
  onSendRelease: (option: TorrentOption) => void;
  // Opens full screen reels starting at a specific reel.
  onOpenReels?: (item?: ReelItem, index?: number) => void;
  // TV has no bottom bar, so these sit in the header there.
  onOpenHistory: () => void;
  onOpenSettings: () => void;
  ref?: Ref<HomeHandle>;
};

export type HomeHandle = {
  /**
   * The TV Back button: scrolls to the top and puts focus on the tabs, or goes
   * back to the All tab. False when already there, so Back can leave the app.
   */
  goTop: () => boolean;
  /** Opens one of the tabs by name, used by the transfer bar. */
  openTab: (id: Tab) => void;
};

// Memoized: the app redraws for many reasons (the player, other screens, the
// splash's progress) that change nothing here.
export const HomeScreen = memo(HomeScreenView);

function HomeScreenView({
  history,
  torboxVersion,
  onPlay,
  onOpenTorbox,
  onOpenSearch,
  onOpenMovie,
  onOpenMoviebox,
  onOpenStreamioSeries,
  onSendRelease,
  onOpenHistory,
  onOpenSettings,
  onOpenReels,
  ref,
}: Props) {
  // Keeps the header clear of a phone's status bar and notch. Zero on TVs.
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('all');
  // Bumped on refresh; the rows are keyed on it, so they remount and refetch.
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Which way the content slides in: from the right when moving to a tab
  // further along, from the left when moving back.
  const [direction, setDirection] = useState(1);
  // TV: the All tab's carousel takes the remote's focus once, when the app
  // opens. After that the All tab is rebuilt each time it is opened, and its
  // carousel would pull focus down off the tabs.
  const [launchFocus, setLaunchFocus] = useState(true);
  const open = (t: Tab) => {
    if (t === tab) return;
    resetHeroScroll();
    setLaunchFocus(false);
    setDirection(TABS.findIndex((x) => x.id === t) > TABS.findIndex((x) => x.id === tab) ? 1 : -1);
    setTab(t);
  };
  // Bumped to hand the remote's focus back to the tab bar.
  const [focusTabs, setFocusTabs] = useState(0);

  useImperativeHandle(ref, () => ({
    goTop: () => {
      if ((scrollPositions.get(tab) ?? 0) > 40) {
        activePage.current?.scrollToOffset({ offset: 0, animated: true });
        scrollPositions.set(tab, 0);
        resetHeroScroll();
      } else if (tab !== 'all') {
        open('all');
      } else {
        return false;
      }
      setFocusTabs((n) => n + 1);
      return true;
    },
    openTab: (id) => {
      setTab(id);
      activePage.current?.scrollToOffset({ offset: 0, animated: true });
    },
  }));


  // The purple pill behind the tabs glides to the selected one, taking its
  // width, instead of jumping.
  const tabBar = useRef<ScrollView>(null);
  const tabLayouts = useRef<Partial<Record<Tab, { x: number; width: number }>>>({});
  const [pillX] = useState(() => new Animated.Value(0));
  const [pillWidth] = useState(() => new Animated.Value(0));
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
    setLaunchFocus(false);
    clearVideoCache();
    clearCatalogCache();
    setRefreshKey((k) => k + 1);
    // The rows show their own placeholders; this one only acknowledges the pull.
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  };

  // Coming back to the app after a while reloads the rows by itself, so what's
  // new shows up without a pull to refresh.
  useEffect(() => {
    let leftAt = 0;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        leftAt = leftAt || Date.now();
      } else {
        if (leftAt && Date.now() - leftAt > STALE_AFTER_MS) {
          clearVideoCache();
          setRefreshKey((k) => k + 1);
        }
        leftAt = 0;
      }
    });
    return () => sub.remove();
  }, []);

  const refreshControl = isTV ? undefined : (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={refresh}
      tintColor={colors.accent}
      colors={[colors.accent]}
      progressBackgroundColor={colors.surface}
    />
  );

  // One identity for good, so the memoized rows don't redraw with the page.
  const playVideo = useEvent((v: { id: string; title: string }) => onPlay({ kind: 'video', videoId: v.id, title: v.title }));
  const openStreamioMovie = useEvent((item: StreamioItem) => onOpenMovie(item as unknown as CatalogMovie));

  // Only the tab in front is mounted. Keeping the others alive holds their
  // images and rows in memory, and a phone with little of it gets killed when
  // a heavy tab is opened on top of them.
  const panel = (t: Tab, content: ReactNode) =>
    t === tab ? (
      <SlideIn key={t} direction={direction}>
        <ErrorBoundary label={TABS.find((entry) => entry.id === t)?.label}>{content}</ErrorBoundary>
      </SlideIn>
    ) : null;

  const liveRow = (
    <View style={styles.row}>
      <SectionHeader title="Live News" subtitle="Kerala's news channels, streaming now" />
      <FocusRow>
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
      </FocusRow>
    </View>
  );

  // Derived from the shared scroll signal: the greeting tucks away and a frosted
  // sheen rises behind the header as the page scrolls down. On a TV heroProgress
  // stays pinned at 0, so the hero always reads expanded.
  const greet = greeting();
  const frost = heroProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const greetOpacity = heroProgress.interpolate({ inputRange: [0, 0.5], outputRange: [1, 0] });
  const greetHeight = heroProgress.interpolate({ inputRange: [0, 1], outputRange: [GREET_H, 0] });

  return (
    <View style={styles.screen}>
      {/* The purple haze behind the header. */}
      <LinearGradient colors={GLOW} style={styles.glow} pointerEvents="none" />

      <View style={[styles.top, { paddingTop: insets.top + (sz(8, 24)) }]}>
        {/* Frosted glass that rises behind the header as the hero collapses. */}
        <Animated.View pointerEvents="none" style={[styles.heroFrost, { opacity: frost }]}>
          {!isTV && Platform.OS === 'ios' && (
            <BlurView intensity={34} tint="dark" style={StyleSheet.absoluteFill} />
          )}
          <LinearGradient
            colors={[FROST_TOP, FROST_BOTTOM]}
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <View style={styles.header}>
          <View style={styles.brandBlock}>
            <Text style={styles.brand}>
              For<Text style={styles.brandAccent}>Us</Text>
            </Text>
            <Animated.View style={{ height: greetHeight, opacity: greetOpacity, overflow: 'hidden' }}>
              <Text style={styles.greeting} numberOfLines={1}>
                {greet}
              </Text>
            </Animated.View>
          </View>
          <View style={styles.actions}>
            {isTV && <RoundButton icon="refresh" label="Refresh" onPress={refresh} />}
            <RoundButton icon="search" label="Search" onPress={() => onOpenSearch(tab === 'moviebox' || tab === 'streamiobox' || tab === 'jackbox' ? 'all' : tab)} />
            {isTV && <RoundButton icon="time-outline" label="History" onPress={onOpenHistory} />}
            {isTV && <RoundButton icon="settings-outline" label="Settings" onPress={onOpenSettings} />}
          </View>
        </View>
        {/* On TV the row remembers the last tab, so Up from the page lands on it. */}
        <FocusRow>
          <ScrollView ref={tabBar} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
            <Animated.View style={[styles.pill, { left: pillX, width: pillWidth }]}>
              <LinearGradient
                colors={PILL_GRADIENT}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
            {TABS.map((t) => (
              <TabButton
                // Remounting is what hands the active tab the remote's focus on
                // Back. The key must not change when a tab opens: that would
                // remount the focused tab, and the TV would drop its focus onto
                // another tab, which then opens.
                key={`${t.id}-${focusTabs}`}
                label={t.label}
                active={tab === t.id}
                takeFocus={focusTabs > 0 && tab === t.id}
                onPress={() => open(t.id)}
                onLayout={(x, width) => onTabLayout(t.id, x, width)}
              />
            ))}
          </ScrollView>
        </FocusRow>
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
          <HeroCarousel
            key={`hero-all-${refreshKey}`}
            sources={HERO_ALL_SOURCES}
            label="Featured movie"
            onPlay={playVideo}
            // On TV the remote starts on Watch Now, until Back sends it to the tabs.
            takeFocus={focusTabs === 0 && launchFocus}
          />

          {/* Latest cinema releases currently in theaters */}
          <CinemasRow
            key={`cinemas-row-${refreshKey}`}
            version={refreshKey}
            onOpenMovie={onOpenMovie}
          />

          {/* A row of films from MovieBox, so the page holds everything. */}
          <MovieboxRow
            key={`moviebox-row-${refreshKey}`}
            version={refreshKey}
            onOpen={onOpenMoviebox}
          />

          {/* Quick-access row of vertical trending Reels & Shorts */}
          {onOpenReels && (
            <ReelsHomeRow
              onOpenReel={(reel, idx) => onOpenReels(reel, idx)}
            />
          )}

          {history.length > 0 && (
            <View style={styles.row}>
              <SectionHeader title="Continue watching" />
              <FocusRow>
                <FlatList
                  horizontal
                  data={history}
                  keyExtractor={playableKey}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.list}
                  renderItem={({ item }) => (
                    <FocusCard
                      onPress={() => onPlay(item)}
                      onLongPress={item.kind === 'video' ? shareOnLongPress(item.videoId, item.title) : undefined}
                    >
                      <HistoryCard item={item} />
                    </FocusCard>
                  )}
                />
              </FocusRow>
            </View>
          )}

          <NewRow key={`new-${refreshKey}`} onPlay={playVideo} />
        </TabScroll>,
      )}

      {panel(
        'movies',
        <TabScroll refreshControl={refreshControl} themes={MOVIE_THEMES} tabKey="movies" refreshKey={refreshKey} onPlay={playVideo}>
          <HeroCarousel key={`hero-movies-${refreshKey}`} sources={MOVIES} label="Trending movie" onPlay={playVideo} />
          <CinemasRow
            key={`cinemas-movies-${refreshKey}`}
            title="Now In Theaters"
            subtitle="Current box office releases"
            version={refreshKey}
            onOpenMovie={onOpenMovie}
          />
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
        'hindi',
        <TabScroll refreshControl={refreshControl} themes={HINDI_THEMES} tabKey="hindi" refreshKey={refreshKey} onPlay={playVideo}>
          <HeroCarousel key={`hero-hindi-${refreshKey}`} sources={HINDI_MOVIES} label="Hindi pick of the day" onPlay={playVideo} />
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
              <TransferList onPlay={onPlay} />
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

      {panel(
        'streamiobox',
        <StreamioBoxScreen
          key={`streamiobox-${refreshKey}`}
          embedded
          onOpenMovie={openStreamioMovie}
          onOpenSeries={onOpenStreamioSeries}
          refreshControl={refreshControl}
          history={history}
          onPlay={onPlay}
        />,
      )}

      {panel(
        'jackbox',
        <JackBoxScreen
          key={`jackbox-${refreshKey}`}
          embedded
          refreshControl={refreshControl}
          onOpenMovie={onOpenMovie}
          onOpenSeries={onOpenStreamioSeries}
          onPlay={onPlay}
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
  if (item.kind === 'stream' || item.kind === 'web') {
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

// One tab's scrolling page, ending in its themed rows and the credit line. It
// is a list, so only the rows near the screen are built: the rest of a long
// tab costs nothing until it is scrolled to, and rows far behind are let go.
function TabScroll({ children, refreshControl, themes = [], refreshKey = 0, onPlay, tabKey }: TabScrollProps) {
  const [themeCount, setThemeCount] = useState(THEMES_AT_START);
  // Scrolling down tucks the bottom bar away; scrolling up brings it back.
  const navScroll = useNavScrollHide();
  const scroll = useRef<FlatList<ReactNode>>(null);
  // Registered as the page in front when the list itself appears, which on TV
  // is a moment after the tab (once ListFrame has measured the room).
  const [setScroll] = useState(() => (list: FlatList<ReactNode> | null) => {
    if (list) activePage.current = list;
    else if (activePage.current === scroll.current) activePage.current = null;
    scroll.current = list;
  });
  // Where this tab was left, put back once the rows have their height.
  const restore = useRef(tabKey ? (scrollPositions.get(tabKey) ?? 0) : 0);
  // Only while the tab is opening. After that the page grows and shrinks as
  // rows load and are let go, and chasing the old place would drag the page
  // about on its own (a TV remote never touches the screen to stop it).
  useEffect(() => {
    const timer = setTimeout(() => (restore.current = 0), RESTORE_WINDOW_MS);
    return () => clearTimeout(timer);
  }, []);

  const onScroll = ({ nativeEvent: e }: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.contentOffset.y;
    navScroll(y);
    setHeroScroll(y);
    if (tabKey) scrollPositions.set(tabKey, y);
    // The place to come back to is kept until it is actually reached.
    if (restore.current > 0 && y >= restore.current - 4) restore.current = 0;
  };

  // The rows come back in a few at a time, so the place to come back to is
  // put back each time the page grows.
  const restorePlace = () => {
    if (restore.current > 0) scroll.current?.scrollToOffset({ offset: restore.current, animated: false });
  };

  const rows: ReactNode[] = [
    ...Children.toArray(children),
    ...(onPlay
      ? themes
          .slice(0, themeCount)
          .map((theme) => <ThemeRow key={`${theme.query}-${refreshKey}`} theme={theme} onPlay={onPlay} />)
      : []),
    // Only built near the bottom of the list, so it animates only when seen.
    ...(onPlay && themeCount < themes.length
      ? [
          // Looks like the next row on its way: its heading, then cards with
          // light sweeping across them.
          <SkeletonLoader
            key="more-rows"
            columns={isTV ? 7 : 3}
            cardWidth={CARD_WIDTH}
            rows={1}
            label="More rows coming"
            icon="sparkles-outline"
            style={styles.moreRows}
          />,
        ]
      : []),
    <Text key="credit" style={styles.credit}>
      Made with love
    </Text>,
  ];

  return (
    <ListFrame>
      {(height) => (
        <FlatList
          ref={setScroll}
          data={rows}
          keyExtractor={rowKey}
          renderItem={renderRow}
          // An exact height on TV; see ListFrame.
          style={height ? { height } : styles.panel}
          contentContainerStyle={styles.content}
          // On TV render enough rows initially to prevent focus traps and layout glitches.
          initialNumToRender={isTV ? 6 : 2}
          maxToRenderPerBatch={isTV ? 4 : 1}
          windowSize={isTV ? 7 : 7}
          updateCellsBatchingPeriod={60}
          // The remote's focus search needs the rows near the screen attached.
          removeClippedSubviews={false}
          // More themed rows once the end is a screen or so away.
          onEndReached={() => setThemeCount((n) => Math.min(n + THEMES_PER_STEP, themes.length))}
          onEndReachedThreshold={1.2}
          onScroll={onScroll}
          scrollEventThrottle={250}
          onContentSizeChange={restorePlace}
          onTouchStart={() => {
            // A touch means the user is here now, not on their way back.
            restore.current = 0;
          }}
          onScrollBeginDrag={() => (restore.current = 0)}
          refreshControl={refreshControl}
          showsVerticalScrollIndicator={false}
        />
      )}
    </ListFrame>
  );
}

const rowKey = (row: ReactNode, index: number) =>
  isValidElement(row) && row.key != null ? String(row.key) : String(index);
const renderRow = ({ item }: { item: ReactNode }) => <>{item}</>;

// A tab's new content fades in and slides a little from the side being moved
// towards.
function SlideIn({ direction, children }: { direction: number; children: ReactNode }) {
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: isTV ? 220 : 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, []);
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [direction * (isTV ? 24 : 36), 0] });
  // TV: only the slide. Fading a whole page of pictures makes a TV redraw every
  // one of them each frame, while it is also building the tab.
  const opacity = isTV ? 1 : progress;
  return <Animated.View style={[styles.panel, { opacity, transform: [{ translateX }] }]}>{children}</Animated.View>;
}

function TabButton({
  label,
  active,
  takeFocus,
  onPress,
  onLayout,
}: {
  label: string;
  active: boolean;
  takeFocus: boolean;
  onPress: () => void;
  onLayout: (x: number, width: number) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [press] = useState(() => new Animated.Value(1));
  const squeeze = (to: number) =>
    Animated.spring(press, { toValue: to, useNativeDriver: true, speed: 40, bounciness: 8 }).start();
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => !isTV && squeeze(0.9)}
      onPressOut={() => !isTV && squeeze(1)}
      // On TV a tab that stays highlighted opens without pressing OK.
      onFocus={() => {
        setFocused(true);
        if (isTV && !active) pending.current = setTimeout(onPress, TAB_FOCUS_DELAY_MS);
      }}
      onBlur={() => {
        setFocused(false);
        if (pending.current) clearTimeout(pending.current);
      }}
      hasTVPreferredFocus={isTV && takeFocus}
      onLayout={(e) => onLayout(e.nativeEvent.layout.x, e.nativeEvent.layout.width)}
      // The selected tab's purple comes from the sliding pill behind it.
      style={[styles.tab, focused && styles.tabFocused]}
    >
      <Animated.View style={{ transform: [{ scale: press }] }}>
        <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
      </Animated.View>
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
  const [press] = useState(() => new Animated.Value(1));
  const squeeze = (to: number) =>
    Animated.spring(press, { toValue: to, useNativeDriver: true, speed: 40, bounciness: 8 }).start();
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => !isTV && squeeze(0.86)}
      onPressOut={() => !isTV && squeeze(1)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.round, (focused || pressed) && styles.roundActive]}
    >
      <Animated.View style={{ transform: [{ scale: press }] }}>
        <Ionicons name={icon} size={sz(20, 24)} color={colors.text} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  hidden: { display: 'none' },
  panel: { flex: 1, width: '100%' },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 360 },
  top: { position: 'relative', paddingBottom: sz(8, 12) },
  heroFrost: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    overflow: 'hidden',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  content: { paddingTop: sz(6, 8), paddingBottom: sz(110, 40) },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sz(10, 14),
    paddingHorizontal: GUTTER,
    marginBottom: sz(12, 16),
  },
  brandBlock: { flex: 1 },
  greeting: { color: colors.muted, fontSize: sz(13.5, 17), fontWeight: '600', marginTop: sz(2, 4) },
  actions: { flexDirection: 'row', alignItems: 'center', gap: sz(10, 14) },
  brand: {
    color: colors.text,
    fontSize: sz(25, 32),
    fontWeight: '900',
    letterSpacing: -0.5,
    textShadowColor: 'rgba(155,92,255,0.45)',
    textShadowRadius: 16,
    textShadowOffset: { width: 0, height: 0 },
  },
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
  pill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: colors.accent,
    shadowOpacity: 0.55,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  tabFocused: { borderColor: colors.text },
  tabText: { color: colors.muted, fontSize: sz(13.5, 17), fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  tabTextActive: { color: '#fff' },
  row: { marginBottom: sz(24, 30) },
  list: { paddingHorizontal: GUTTER, paddingVertical: sz(2, 8) },
  heart: { color: colors.accent },
  // The cards run off the right edge, as a real row's do.
  moreRows: { paddingLeft: GUTTER, marginTop: sz(4, 8), overflow: 'hidden' },
  credit: { color: colors.faint, fontSize: sz(12.5, 15), textAlign: 'center', marginTop: 8, fontWeight: '600' },
});
