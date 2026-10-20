import { useEffect, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { addToHistory, loadHistory } from './src/data/history';
import { FilePlayerScreen } from './src/screens/FilePlayerScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { PlayerScreen } from './src/screens/PlayerScreen';
import { TorboxSetupScreen } from './src/screens/TorboxSetupScreen';
import { colors, isTV } from './src/theme';
import type { Playable } from './src/types';

// What's drawn over the home screen, if anything.
type Overlay = { screen: 'player'; item: Playable } | { screen: 'torbox' } | null;

export default function App() {
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [history, setHistory] = useState<Playable[]>([]);
  const [torboxVersion, setTorboxVersion] = useState(0);

  useEffect(() => {
    loadHistory().then(setHistory);
  }, []);

  const play = (item: Playable) => {
    setHistory((h) => addToHistory(h, item));
    setOverlay({ screen: 'player', item });
  };

  const close = () => setOverlay(null);

  const closeTorbox = () => {
    setTorboxVersion((v) => v + 1);
    setOverlay(null);
  };

  // The remote's (or phone's) Back button closes whatever is open instead of quitting the app.
  useEffect(() => {
    if (!overlay) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      overlay.screen === 'torbox' ? closeTorbox() : close();
      return true;
    });
    return () => sub.remove();
  }, [overlay]);

  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <StatusBar hidden={isTV} style="light" />
        {/* Home stays mounted underneath so rows and focus survive a Back press. */}
        <View style={[styles.root, overlay && styles.hidden]}>
          <HomeScreen
            history={history}
            torboxVersion={torboxVersion}
            onPlay={play}
            onOpenTorbox={() => setOverlay({ screen: 'torbox' })}
          />
        </View>
        {overlay && (
          <View style={StyleSheet.absoluteFill}>
            {overlay.screen === 'torbox' ? (
              <TorboxSetupScreen onDone={closeTorbox} />
            ) : overlay.item.kind === 'file' ? (
              <FilePlayerScreen item={overlay.item} onClose={close} />
            ) : (
              <PlayerScreen item={overlay.item} onClose={close} />
            )}
          </View>
        )}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  hidden: { display: 'none' },
});
