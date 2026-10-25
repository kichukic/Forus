import { useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { shareTitle } from '../chat/share';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Loader } from '../components/Loader';
import { isTV } from '../theme';

type Props = {
  url: string;
  title: string;
  onClose: () => void;
};

export function WebPlayerScreen({ url, title, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isTV) {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    }
    const backSub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => {
      backSub.remove();
      if (!isTV) {
        ScreenOrientation.unlockAsync().catch(() => {});
      }
    };
  }, [onClose]);

  return (
    <View style={styles.screen}>
      <WebView
        source={{ uri: url }}
        style={StyleSheet.absoluteFill}
        allowsFullscreenVideo
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        onLoadEnd={() => setLoading(false)}
        setSupportMultipleWindows={false}
      />
      {loading && (
        <View style={[StyleSheet.absoluteFill, styles.loadingOverlay]}>
          <Loader size="large" label={`Loading ${title}`} icon="play-circle-outline" />
        </View>
      )}
      <View style={[styles.topBar, { paddingTop: insets.top + (isTV ? 16 : 8) }]}>
        <Pressable onPress={onClose} style={styles.backButton} hitSlop={12}>
          <Ionicons name="chevron-back" size={isTV ? 28 : 24} color="#fff" />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Pressable onPress={() => shareTitle({ kind: 'web', url, title })} style={styles.shareBtn} hitSlop={8}>
          <Ionicons name="paper-plane-outline" size={20} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  loadingOverlay: { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  backButton: { padding: 6, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)' },
  title: { flex: 1, color: '#fff', fontSize: isTV ? 18 : 15, fontWeight: '700' },
  shareBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)' },
});