import { useEffect, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AnimatedSplash } from './src/components/AnimatedSplash';
import { BottomNav, BOTTOM_NAV_HEIGHT, type NavId } from './src/components/BottomNav';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { PlayerShell } from './src/components/PlayerShell';
import { installErrorHandler, subscribeErrors } from './src/data/errors';
import { addToHistory, clearHistory, loadHistory, playableKey } from './src/data/history';
import type { CatalogMovie } from './src/api/catalog';
import type { TorrentOption } from './src/api/torrents';
import { FatalErrorScreen } from './src/screens/FatalErrorScreen';
import { FilePlayerScreen } from './src/screens/FilePlayerScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { MovieScreen } from './src/screens/MovieScreen';
import { PlayerScreen } from './src/screens/PlayerScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { SendScreen } from './src/screens/SendScreen';
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

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  // The opening animation; the home screen loads underneath it meanwhile.
  const [splash, setSplash] = useState(true);
  // Where the TorBox screen goes back to.
  const [torboxFrom, setTorboxFrom] = useState<NavId>('home');
  const [playing, setPlaying] = useState<Playable | null>(null);
  // On a phone the player can shrink into the corner while you keep browsing.
  const [mini, setMini] = useState(false);
  const [history, setHistory] = useState<Playable[]>([]);
  const [torboxVersion, setTorboxVersion] = useState(0);
  // Which tab's channels search looks in.
  const [searchScope, setSearchScope] = useState<SearchScope>('all');
  // The film open from the catalog, over whatever screen is showing.
  const [movie, setMovie] = useState<CatalogMovie | null>(null);
  // A release found by searching for its name, on its way to TorBox.
  const [sending, setSending] = useState<TorrentOption | null>(null);
  // An error that nothing else caught. The app stays open and shows it.
  const [crash, setCrash] = useState<Error | null>(null);

  useEffect(() => {
    loadHistory().then(setHistory);
  }, []);

  // Anything fatal is shown on screen rather than ending the app.
  useEffect(() => subscribeErrors((error, isFatal) => isFatal && setCrash(error)), []);

  const play = (item: Playable) => {
    setHistory((h) => addToHistory(h, item));
    setPlaying(item);
    setMini(false);
  };

  const closePlayer = () => {
    setPlaying(null);
    setMini(false);
  };

  const openTorbox = () => {
    if (screen !== 'torbox') setTorboxFrom(screen);
    setScreen('torbox');
  };

  const closeTorbox = () => {
    setTorboxVersion((v) => v + 1);
    setScreen(torboxFrom);
  };

  // Back works like YouTube's: a full player shrinks first, then screens close.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (sending) setSending(null);
      else if (movie) setMovie(null);
      else if (playing && !mini) {
        if (isTV) closePlayer();
        else setMini(true);
      } else if (screen === 'torbox') closeTorbox();
      else if (screen !== 'home') setScreen('home');
      else if (playing) closePlayer();
      else return false;
      return true;
    });
    return () => sub.remove();
  }, [playing, mini, screen, torboxFrom, movie, sending]);

  // On TV nothing behind a player may keep remote focus, so it's hidden.
  const hideBackground = isTV && (!!playing || !!movie || !!sending);
  const showNav = !isTV && screen !== 'torbox' && !movie && !sending;
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
            onOpenSearch={(scope) => {
              setSearchScope(scope);
              setScreen('search');
            }}
            onOpenMovie={setMovie}
            onSendRelease={setSending}
          />
        </View>

        {screen === 'search' && (
          <View style={layer('search')}>
            <SearchScreen key={searchScope} scope={searchScope} onPlay={play} />
          </View>
        )}

        {screen === 'history' && (
          <View style={layer('history')}>
            <HistoryScreen history={history} onPlay={play} onClear={() => setHistory(clearHistory())} />
          </View>
        )}

        {screen === 'settings' && (
          <View style={layer('settings')}>
            <SettingsScreen
              torboxVersion={torboxVersion}
              onOpenTorbox={openTorbox}
              onClearHistory={() => setHistory(clearHistory())}
            />
          </View>
        )}

        {screen === 'torbox' && (
          <View style={layer('torbox')}>
            <TorboxSetupScreen onDone={closeTorbox} />
          </View>
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

        {sending && (
          <View style={StyleSheet.absoluteFill}>
            <SendScreen
              key={sending.hash}
              option={sending}
              onClose={() => setSending(null)}
              onPlay={play}
              onOpenTorbox={() => {
                // The settings screen sits below this one, so this is closed.
                setSending(null);
                openTorbox();
              }}
            />
          </View>
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
              ) : (
                <PlayerScreen key={playableKey(playing)} item={playing} onClose={closePlayer} onPlay={play} shell={shell} />
              )
            }
          </PlayerShell>
        )}
        {splash && <AnimatedSplash onDone={() => setSplash(false)} />}

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
