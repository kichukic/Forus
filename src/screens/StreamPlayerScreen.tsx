import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFullscreenOrientation } from '../hooks/useFullscreenOrientation';
import { colors, isTV } from '../theme';

type Props = {
  url: string;
  title: string;
  onClose: () => void;
};

export function StreamPlayerScreen({ url, title, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const fullscreenOrientation = useFullscreenOrientation();
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
  });

  useEffect(() => {
    player.play();
  }, [player]);

  return (
    <View style={styles.screen}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        nativeControls
        fullscreenOptions={{
          enable: !isTV,
          orientation: 'landscape',
          autoExitOnRotate: true,
        }}
        onFullscreenEnter={fullscreenOrientation.onFullscreenEnter}
        onFullscreenExit={fullscreenOrientation.onFullscreenExit}
      />
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={onClose} style={styles.back} hitSlop={12}>
          <Ionicons name="chevron-back" size={isTV ? 28 : 24} color={colors.text} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  title: { flex: 1, color: colors.text, fontSize: isTV ? 20 : 16, fontWeight: '800' },
});
