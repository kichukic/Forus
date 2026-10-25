import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useEvent } from 'expo';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFullscreenOrientation } from '../hooks/useFullscreenOrientation';
import { useOpenSubtitles } from '../hooks/useOpenSubtitles';
import { shareTitle } from '../chat/share';
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

  const { currentTime } = useEvent(player, 'timeUpdate', {
    currentTime: 0,
    currentLiveTimestamp: 0,
    currentOffsetFromLive: 0,
    bufferedPosition: 0,
  });

  const subs = useOpenSubtitles(title);

  const spoken = subs.spoken(currentTime ?? 0);

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

      {spoken ? (
        <View style={styles.cue} pointerEvents="none">
          <Text style={styles.cueText}>{spoken}</Text>
        </View>
      ) : null}

      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={onClose} style={styles.back} hitSlop={12}>
          <Ionicons name="chevron-back" size={isTV ? 28 : 24} color={colors.text} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {subs.hasSubs ? (
          <Pressable onPress={subs.cycle} style={styles.ccBtn} hitSlop={8}>
            <Ionicons name="text" size={20} color={subs.chosen ? colors.accent : colors.text} />
          </Pressable>
        ) : null}
        <Pressable onPress={() => shareTitle({ kind: 'stream', url, title })} style={styles.ccBtn} hitSlop={8}>
          <Ionicons name="paper-plane-outline" size={20} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  title: { flex: 1, color: colors.text, fontSize: isTV ? 20 : 16, fontWeight: '800' },
  ccBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  cue: { position: 'absolute', bottom: 40, left: 0, right: 0, alignItems: 'center', paddingHorizontal: 20 },
  cueText: { color: '#fff', fontSize: isTV ? 22 : 16, fontWeight: '700', textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
});