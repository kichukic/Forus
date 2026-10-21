// Holds the open player and moves it between full screen and a small window in
// the corner, like YouTube's mini player. The player inside is never remounted,
// so the video keeps playing while it shrinks.
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  type GestureResponderHandlers,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const MINI_MARGIN = 12;
// How far a drag has to travel (as a share of the screen) to count as minimise.
const DRAG_DISTANCE = 0.55;
const SNAP_AT = 0.3;

export type ShellControls = {
  mini: boolean;
  minimize: () => void;
  // Spread on the parts of the player that can be dragged down (not the video:
  // the video takes its own touches for YouTube's controls).
  dragHandlers: GestureResponderHandlers;
};

type Props = {
  mini: boolean;
  onMiniChange: (mini: boolean) => void;
  onClose: () => void;
  // Room to leave under the mini player, e.g. for the bottom navigation bar.
  bottomOffset?: number;
  children: (controls: ShellControls) => ReactNode;
};

export function PlayerShell({ mini, onMiniChange, onClose, bottomOffset = 0, children }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // 0 is full screen, 1 is the corner window.
  const progress = useRef(new Animated.Value(mini ? 1 : 0)).current;
  const dragStart = useRef(0);
  const latest = useRef({ mini, onMiniChange, height });
  latest.current = { mini, onMiniChange, height };

  const snapTo = (toMini: boolean) => {
    Animated.spring(progress, {
      toValue: toMini ? 1 : 0,
      useNativeDriver: false,
      bounciness: 0,
      speed: 16,
    }).start();
    if (toMini !== latest.current.mini) latest.current.onMiniChange(toMini);
  };

  useEffect(() => {
    snapTo(mini);
    // snapTo only reads refs; re-run only when the requested state changes.
  }, [mini]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Only vertical drags; taps and sideways swipes stay with the children.
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderGrant: () => {
          progress.stopAnimation((value) => (dragStart.current = value));
        },
        onPanResponderMove: (_, g) => {
          const span = latest.current.height * DRAG_DISTANCE;
          progress.setValue(Math.min(1, Math.max(0, dragStart.current + g.dy / span)));
        },
        onPanResponderRelease: (_, g) => {
          progress.stopAnimation((value) => {
            // A flick decides on its own; otherwise it depends on how far it got.
            if (g.vy > 0.5) return snapTo(true);
            if (g.vy < -0.5) return snapTo(false);
            const fromMini = dragStart.current > 0.5;
            snapTo(fromMini ? value > 1 - SNAP_AT : value > SNAP_AT);
          });
        },
        onPanResponderTerminate: () => snapTo(latest.current.mini),
      }),
    [],
  );

  const miniWidth = Math.min(width * 0.5, 280);
  const miniHeight = (miniWidth * 9) / 16;

  const frame = {
    left: progress.interpolate({ inputRange: [0, 1], outputRange: [0, width - miniWidth - MINI_MARGIN] }),
    top: progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, height - miniHeight - MINI_MARGIN - insets.bottom - 16 - bottomOffset],
    }),
    width: progress.interpolate({ inputRange: [0, 1], outputRange: [width, miniWidth] }),
    height: progress.interpolate({ inputRange: [0, 1], outputRange: [height, miniHeight] }),
    // The shell pads the top for the status bar, and lets go of it as it shrinks.
    paddingTop: progress.interpolate({ inputRange: [0, 1], outputRange: [insets.top, 0] }),
    borderRadius: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 10] }),
  };

  return (
    <Animated.View style={[styles.shell, frame]} pointerEvents="box-none">
      {children({ mini, minimize: () => snapTo(true), dragHandlers: pan.panHandlers })}

      {mini && (
        <>
          {/* Covers the video so a tap opens it instead of reaching YouTube's controls. */}
          <Pressable style={StyleSheet.absoluteFill} onPress={() => snapTo(false)} />
          <Pressable onPress={onClose} hitSlop={10} style={styles.miniClose}>
            <Ionicons name="close" size={16} color="#fff" />
          </Pressable>
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: 'absolute',
    overflow: 'hidden',
    backgroundColor: '#000',
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  miniClose: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
});
