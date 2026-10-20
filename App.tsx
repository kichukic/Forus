import { useEffect, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PlayerShell } from './src/components/PlayerShell';
import { addToHistory, loadHistory, playableKey } from './src/data/history';
import { FilePlayerScreen } from './src/screens/FilePlayerScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { PlayerScreen } from './src/screens/PlayerScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { TorboxSetupScreen } from './src/screens/TorboxSetupScreen';
import { colors, isTV } from './src/theme';
import type { Playable } from './src/types';

// The screen behind the player. The player itself floats above whichever it is.
type Screen = 'home' | 'search' | 'torbox';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
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

  const closeTorbox = () => {
    setTorboxVersion((v) => v + 1);
    setScreen('home');
  };

  // Back works like YouTube's: a full player shrinks first, then screens close.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (playing && !mini) {
        if (isTV) closePlayer();
        else setMini(true);
      } else if (screen === 'torbox') closeTorbox();
      else if (screen === 'search') setScreen('home');
      else if (playing) closePlayer();
      else return false;
      return true;
    });
    return () => sub.remove();
  }, [playing, mini, screen]);

  // On TV nothing behind a player may keep remote focus, so it's hidden.
  const hideBackground = isTV && !!playing;

  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <StatusBar hidden={isTV} style="light" />
        {/* Home stays mounted so its rows and scroll position survive. */}
        <View style={[styles.root, (screen !== 'home' || hideBackground) && styles.hidden]}>
          <HomeScreen
            history={history}
            torboxVersion={torboxVersion}
            onPlay={play}
            onOpenTorbox={() => setScreen('torbox')}
            onOpenSearch={() => setScreen('search')}
          />
        </View>

        {screen === 'search' && (
          <View style={[StyleSheet.absoluteFill, hideBackground && styles.hidden]}>
            <SearchScreen onPlay={play} />
          </View>
        )}

        {screen === 'torbox' && (
          <View style={[StyleSheet.absoluteFill, hideBackground && styles.hidden]}>
            <TorboxSetupScreen onDone={closeTorbox} />
          </View>
        )}

        {playing && (
          <PlayerShell mini={mini} onMiniChange={setMini} onClose={closePlayer}>
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
