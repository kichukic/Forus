import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { loadSavedPosters, preloadHome, type PreloadStep } from './src/api/preload';
import { AnimatedSplash } from './src/components/AnimatedSplash';
import { BottomNav, BOTTOM_NAV_HEIGHT, type NavId } from './src/components/BottomNav';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { PlayerShell } from './src/components/PlayerShell';
import { installErrorHandler, subscribeErrors } from './src/data/errors';
import { addToHistory, clearHistory, loadHistory, mergeHistories, playableKey, type HistoryEntry } from './src/data/history';
import { askToRemind, startReminders } from './src/data/reminders';
import { useEvent } from './src/hooks/useEvent';
import { addTransfer, loadTransfers, playableFrom } from './src/data/transfers';
import { showToast } from './src/data/toasts';
import { checkForUpdate, type Update } from './src/api/updates';
import { setupTransferNotices } from './src/data/transferNotices';
import type { CatalogMovie } from './src/api/catalog';
import type { MovieboxSubject } from './src/api/moviebox';
import type { StreamioItem } from './src/api/streamiobox';
import type { TorrentOption } from './src/api/torrents';
import { FatalErrorScreen } from './src/screens/FatalErrorScreen';
import { FilePlayerScreen } from './src/screens/FilePlayerScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { HomeScreen, type HomeHandle } from './src/screens/HomeScreen';
import { ChatScreen, type ChatHandle } from './src/screens/ChatScreen';
import { startChat, useChatStatus } from './src/chat/store';
import { clearSyncedHistory, pushWatched, syncHistory } from './src/chat/historySync';
import { onOpenChatRequest } from './src/chat/push';
import { SendToFriend } from './src/chat/SendToFriend';
import { MovieboxDetailScreen } from './src/screens/MovieboxDetailScreen';
import { StreamioBoxDetailScreen } from './src/screens/StreamioBoxDetailScreen';
import { MovieboxPlayerScreen } from './src/screens/MovieboxPlayerScreen';
import { MovieScreen } from './src/screens/MovieScreen';
import { PlayerScreen } from './src/screens/PlayerScreen';
import { StreamPlayerScreen } from './src/screens/StreamPlayerScreen';
import { WebPlayerScreen } from './src/screens/WebPlayerScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { TransferBar } from './src/components/TransferBar';
import { ToastHost } from './src/components/ToastHost';
import { TransferToast } from './src/components/TransferToast';
import { UpdatePrompt } from './src/components/UpdatePrompt';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { TorboxSetupScreen } from './src/screens/TorboxSetupScreen';
import { colors, isTV } from './src/theme';
import type { SearchScope } from './src/data/channels';
import type { Playable } from './src/types';

// The screen behind the player. The player itself floats above whichever it is.
type Screen = NavId | 'torbox';

// Take over the error handler before anything else can fail, so an error that
// reaches the top shows itself instead of closing the app.
installErrorHandler();

// The longest the splash waits for the home screen's data.
const PRELOAD_TIMEOUT_MS = 8000;
// Fresh posters replace the saved ones once there are enough to fill the wall.
const MIN_FRESH_POSTERS = 16;

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const home = useRef<HomeHandle>(null);
  const chat = useRef<ChatHandle>(null);
  // An open conversation fills the screen, without the bottom bar.
  const [chatFull, setChatFull] = useState(false);
  // The opening animation. It stays until the home screen's data has loaded
  // (or loading gave up), so the home screen opens already filled in.
  const [splash, setSplash] = useState(true);
  const [preload, setPreload] = useState<PreloadStep & { done: boolean }>({
    label: 'Starting up…',
    progress: 0,
    done: false,
  });
  // The splash's poster wall: last launch's posters until enough fresh ones arrive.
  const [savedPosters, setSavedPosters] = useState<(string | number)[]>([]);
  // Where the TorBox screen goes back to.
  const [torboxFrom, setTorboxFrom] = useState<NavId>('home');
  const [playing, setPlaying] = useState<Playable | null>(null);
  // On a phone the player can shrink into the corner while you keep browsing.
  const [mini, setMini] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [torboxVersion, setTorboxVersion] = useState(0);
  // Which tab's channels search looks in.
  const [searchScope, setSearchScope] = useState<SearchScope>('all');
  // The film open from the catalog, over whatever screen is showing.
  const [movie, setMovie] = useState<CatalogMovie | null>(null);
  // The film open from MovieBox, in the same way.
  const [moviebox, setMoviebox] = useState<MovieboxSubject | null>(null);
  const [streamioSeries, setStreamioSeries] = useState<StreamioItem | null>(null);
  // The prompt shown on launch (and from Settings) when an update is found.
  const [updatePrompt, setUpdatePrompt] = useState<Update | null>(null);
  // Transfers now run in the background, so there is no full-screen sender.
  // An error that nothing else caught. The app stays open and shows it.
  const [crash, setCrash] = useState<Error | null>(null);

  useEffect(() => {
    loadHistory().then(setHistory);
    loadTransfers();
    setupTransferNotices();
    // Chat is for phones; the TV has no bottom bar to reach it.
    if (!isTV) startChat();
    checkForUpdate().then((u) => {
      if (u) setUpdatePrompt(u);
    });
  }, []);

  useEffect(() => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      setPreload((p) => ({ ...p, done: true }));
    };
    // A slow or missing connection mustn't keep the splash up for ever.
    const giveUp = setTimeout(finish, PRELOAD_TIMEOUT_MS);
    loadSavedPosters().then(setSavedPosters);
    preloadHome((step) => !finished && setPreload({ ...step, done: false }))
      .catch(() => {})
      .finally(finish);
    return () => clearTimeout(giveUp);
  }, []);

  const clearAllHistory = () => {
    setHistory(clearHistory());
    clearSyncedHistory();
  };

  // Watch history follows the chat account: merged with the server's on
  // signing in and whenever the app comes back to the front.
  const chatStatus = useChatStatus();
  const latestHistory = useRef(history);
  useEffect(() => {
    latestHistory.current = history;
  });
  useEffect(() => {
    if (chatStatus !== 'signedIn') return;
    const sync = () =>
      syncHistory(latestHistory.current).then((remote) => {
        if (remote) setHistory((current) => mergeHistories(current, remote));
      });
    sync();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && sync());
    return () => sub.remove();
  }, [chatStatus]);

  // A tapped message notification goes to the Chat tab, which opens the chat;
  // a full-screen video steps into the corner.
  const playingNow = useRef(playing);
  useEffect(() => {
    playingNow.current = playing;
  });
  useEffect(() => {
    if (isTV) return;
    return onOpenChatRequest(() => {
      setScreen('chat');
      if (playingNow.current) setMini(true);
    });
  }, []);

  // Anything fatal is shown on screen rather than ending the app.
  useEffect(() => subscribeErrors((error, isFatal) => isFatal && setCrash(error)), []);

  const play = useEvent((item: Playable) => {
    setHistory((h) => addToHistory(h, item));
    pushWatched(item);
    setPlaying(item);
    setMini(false);
    // Phones only: the first play asks to allow "Continue watching" reminders.
    if (!isTV) askToRemind();
  });

  // Phones: a reminder of the last thing watched, a few hours after leaving.
  const latest = useRef<{ history: Playable[]; playing: Playable | null; play: typeof play }>({ history, playing, play });
  useEffect(() => {
    latest.current = { history, playing, play };
  });
  useEffect(() => {
    if (isTV) return;
    return startReminders(
      () => latest.current.history[0],
      () => latest.current.playing !== null,
      (item) => latest.current.play(item),
    );
  }, []);

  const closePlayer = () => {
    setPlaying(null);
    setMini(false);
  };

  const openTorbox = useEvent(() => {
    if (screen !== 'torbox') setTorboxFrom(screen);
    setScreen('torbox');
  });
  // The home screen is memoized, so what it's handed keeps one identity.
  const openSearch = useEvent((scope: SearchScope) => {
    setSearchScope(scope);
    setScreen('search');
  });
  const sendRelease = useEvent((option: TorrentOption) => addTransfer(option));
  const openHistory = useEvent(() => setScreen('history'));
  const openSettings = useEvent(() => setScreen('settings'));

  const closeTorbox = useCallback(() => {
    setTorboxVersion((v) => v + 1);
    setScreen(torboxFrom);
  }, [torboxFrom]);

  // Back works like YouTube's: a full player shrinks first, then screens close.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (streamioSeries) setStreamioSeries(null);
      else if (moviebox) setMoviebox(null);
      else if (movie) setMovie(null);
      else if (playing && !mini) {
        if (isTV) closePlayer();
        else setMini(true);
      } else if (screen === 'torbox') closeTorbox();
      else if (screen === 'chat' && chat.current?.goBack()) return true;
      else if (screen !== 'home') setScreen('home');
      else if (playing) closePlayer();
      // TV: Back first goes to the top of the page and the tabs, then to the
      // All tab, and only then leaves the app.
      else if (isTV && home.current?.goTop()) return true;
      else return false;
      return true;
    });
    return () => sub.remove();
  }, [playing, mini, screen, torboxFrom, movie, moviebox, streamioSeries, closeTorbox]);

  // On TV nothing behind a player may keep remote focus, so it's hidden.
  const hideBackground = isTV && (!!playing || !!movie || !!moviebox || !!streamioSeries);
  const showNav = !isTV && screen !== 'torbox' && !movie && !moviebox && !(screen === 'chat' && chatFull);
  const layer = (s: Screen) => [StyleSheet.absoluteFill, (screen !== s || hideBackground) && styles.hidden];

  return (
    <SafeAreaProvider>
      <ErrorBoundary label="App">
        <View style={styles.root}>
        <StatusBar hidden={isTV} style="light" />
        {/* Home stays mounted so its tabs, rows and scroll position survive. */}
        <View style={layer('home')}>
          <HomeScreen
            history={history}
            torboxVersion={torboxVersion}
            onPlay={play}
            onOpenTorbox={openTorbox}
            onOpenSearch={openSearch}
            onOpenMovie={setMovie}
            onOpenMoviebox={setMoviebox}
            onOpenStreamioSeries={setStreamioSeries}
            onSendRelease={sendRelease}
            onOpenHistory={openHistory}
            onOpenSettings={openSettings}
            ref={home}
          />
        </View>

        {screen === 'search' && (
          <View style={layer('search')}>
            <SearchScreen
              key={searchScope}
              scope={searchScope}
              onPlay={play}
              onOpenMoviebox={setMoviebox}
              onSendRelease={(option) => addTransfer(option)}
            />
          </View>
        )}

        {screen === 'chat' && (
          <View style={layer('chat')}>
            <ChatScreen
              ref={chat}
              onFullScreen={setChatFull}
              onPlay={(title) => {
                if (title.kind === 'video') play({ kind: 'video', videoId: title.videoId, title: title.title });
                else if (title.kind === 'web') play({ kind: 'web', url: title.url, title: title.title, poster: title.poster });
                else if (title.kind === 'stream') play({ kind: 'stream', url: title.url, title: title.title, poster: title.poster });
                else if (title.kind === 'moviebox') play({ kind: 'moviebox', subjectId: title.subjectId, season: title.season ?? 0, episode: title.episode ?? 0, title: title.title, poster: title.poster });
                else if (title.kind === 'movie') {
                  setMovie({
                    id: title.id,
                    title: title.title,
                    poster: title.poster,
                    year: title.year,
                  });
                } else if (title.kind === 'file') {
                  play({
                    kind: 'file',
                    source: title.source as any,
                    itemId: title.itemId,
                    fileId: title.fileId,
                    title: title.title,
                  });
                }
              }}
            />
          </View>
        )}

        {screen === 'history' && (
          <View style={layer('history')}>
            <HistoryScreen history={history} onPlay={play} onClear={clearAllHistory} />
          </View>
        )}

        {screen === 'settings' && (
          <View style={layer('settings')}>
            <SettingsScreen
              torboxVersion={torboxVersion}
              onOpenTorbox={openTorbox}
              onClearHistory={clearAllHistory}
              onCheckForUpdates={() => {
                checkForUpdate(true).then((u) => {
                  if (u) setUpdatePrompt(u);
                  else showToast({ text: 'You are on the latest version.' });
                });
              }}
            />
          </View>
        )}

        {screen === 'torbox' && (
          <View style={layer('torbox')}>
            <TorboxSetupScreen onDone={closeTorbox} />
          </View>
        )}

        <TransferToast
          onPlay={(transfer) => {
            const item = playableFrom(transfer);
            if (item) play(item);
          }}
          onOpenTorbox={openTorbox}
        />

        <ToastHost />
        {!isTV && <SendToFriend />}

        <UpdatePrompt update={updatePrompt} onClose={() => setUpdatePrompt(null)} />

        {showNav && (
          <TransferBar
            onOpen={() => {
              setScreen('home');
              home.current?.openTab('torbox');
            }}
          />
        )}

        {showNav && (
          <BottomNav
            active={screen as NavId}
            onSelect={(id) => {
              // The bottom bar's Search looks everywhere.
              if (id === 'search') setSearchScope('all');
              setScreen(id);
            }}
          />
        )}

        {movie && (
          <View style={StyleSheet.absoluteFill}>
            <MovieScreen
              key={movie.id}
              movie={movie}
              onClose={() => setMovie(null)}
              onPlay={play}
              onOpenTorbox={() => {
                // The settings screen sits below this one, so the film is closed.
                setMovie(null);
                openTorbox();
              }}
            />
          </View>
        )}

        {moviebox && (
          <View style={StyleSheet.absoluteFill}>
            <MovieboxDetailScreen
              key={moviebox.id}
              subject={moviebox}
              onClose={() => setMoviebox(null)}
              onPlay={play}
              onSendRelease={(option) => {
                // The film screen is below this one, so it is closed first.
                setMoviebox(null);
                addTransfer(option);
              }}
            />
          </View>
        )}

        {streamioSeries && (
          <View style={StyleSheet.absoluteFill}>
            <StreamioBoxDetailScreen
              key={streamioSeries.id}
              item={streamioSeries}
              onClose={() => setStreamioSeries(null)}
              onPlay={play}
              onSendRelease={(option) => {
                setStreamioSeries(null);
                addTransfer(option);
              }}
            />
          </View>
        )}

        {playing && (
          <PlayerShell
            mini={mini}
            onMiniChange={setMini}
            onClose={closePlayer}
            bottomOffset={showNav ? BOTTOM_NAV_HEIGHT + 8 : 0}
          >
            {(shell) =>
              playing.kind === 'file' ? (
                <FilePlayerScreen key={playableKey(playing)} item={playing} onClose={closePlayer} onPlay={play} shell={shell} />
              ) : playing.kind === 'moviebox' ? (
                <MovieboxPlayerScreen key={playableKey(playing)} item={playing} onClose={closePlayer} onPlay={play} shell={shell} />
              ) : playing.kind === 'stream' ? (
                <StreamPlayerScreen url={playing.url} title={playing.title} onClose={closePlayer} />
              ) : playing.kind === 'web' ? (
                <WebPlayerScreen url={playing.url} title={playing.title} onClose={closePlayer} />
              ) : (
                <PlayerScreen key={playableKey(playing)} item={playing} onClose={closePlayer} onPlay={play} shell={shell} />
              )
            }
          </PlayerShell>
        )}
        {splash && (
          <AnimatedSplash
            ready={preload.done}
            progress={preload.progress}
            status={preload.label}
            posters={(preload.posters?.length ?? 0) >= MIN_FRESH_POSTERS ? preload.posters! : (savedPosters.length ? savedPosters : [require('./assets/images/splash-icon.png')])}
            onDone={() => setSplash(false)}
          />
        )}

        {crash && (
          <View style={StyleSheet.absoluteFill}>
            <FatalErrorScreen error={crash} onDismiss={() => setCrash(null)} />
          </View>
        )}
        </View>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  hidden: { display: 'none' },
});
