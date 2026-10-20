import { useEffect, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BOTTOM_NAV_HEIGHT, BottomNav, type NavId } from './src/components/BottomNav';
import { PlayerShell } from './src/components/PlayerShell';
import { addToHistory, clearHistory, loadHistory, playableKey } from './src/data/history';
import { FilePlayerScreen } from './src/screens/FilePlayerScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { PlayerScreen } from './src/screens/PlayerScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { TorboxSetupScreen } from './src/screens/TorboxSetupScreen';
import { colors, isTV } from './src/theme';
import type { Playable } from './src/types';

// The screen behind the player. The player itself floats above whichever it is.
type Screen = NavId | 'torbox';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  // Where the TorBox screen goes back to.
  const [torboxFrom, setTorboxFrom] = useState<NavId>('home');
  const [playing, setPlaying] = useState<Playable | null>(null);
  // On a phone the player can shrink into the corner while you keep browsing.
  const [mini, setMini] = useState(false);
  const [history, setHistory] = useState<Playable[]>([]);
  const [torboxVersion, setTorboxVersion] = useState(0);

  useEffect(() => {
    loadHistory().then(setHistory);
  }, []);

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
      if (playing && !mini) {
        if (isTV) closePlayer();
        else setMini(true);
      } else if (screen === 'torbox') closeTorbox();
      else if (screen !== 'home') setScreen('home');
      else if (playing) closePlayer();
      else return false;
      return true;
    });
    return () => sub.remove();
  }, [playing, mini, screen, torboxFrom]);

  // On TV nothing behind a player may keep remote focus, so it's hidden.
  const hideBackground = isTV && !!playing;
  const showNav = !isTV && screen !== 'torbox';
  const layer = (s: Screen) => [StyleSheet.absoluteFill, (screen !== s || hideBackground) && styles.hidden];

  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <StatusBar hidden={isTV} style="light" />
        {/* Home stays mounted so its tabs, rows and scroll position survive. */}
        <View style={layer('home')}>
          <HomeScreen
            history={history}
            torboxVersion={torboxVersion}
            onPlay={play}
            onOpenTorbox={openTorbox}
            onOpenSearch={() => setScreen('search')}
          />
        </View>

        {screen === 'search' && (
          <View style={layer('search')}>
            <SearchScreen onPlay={play} />
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

        {showNav && <BottomNav active={screen as NavId} onSelect={setScreen} />}

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
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  hidden: { display: 'none' },
});
