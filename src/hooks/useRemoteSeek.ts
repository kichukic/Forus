// The TV remote: play/pause and the 15-second skip keys. expo-video's native
// controls on a TV do not answer those keys, so the app handles them itself.
import { useCallback, useRef } from 'react';
import { useTVEventHandler, type HWEvent } from 'react-native';
import type { VideoPlayer } from 'expo-video';

const SKIP_SECONDS = 15;
const KEY_REPEAT_MS = 120;

const useRemote: typeof useTVEventHandler = useTVEventHandler ?? (() => {});

export function useRemoteSeek(player: VideoPlayer, onHint: () => void) {
  const lastKey = useRef<{ type: string; at: number } | null>(null);

  const onRemote = useCallback(
    (evt: HWEvent) => {
      if (String(evt.eventKeyAction) === '0') return;
      const now = Date.now();
      if (lastKey.current?.type === evt.eventType && now - lastKey.current.at < KEY_REPEAT_MS) return;
      lastKey.current = { type: evt.eventType, at: now };

      switch (evt.eventType) {
        case 'playPause':
          if (player.playing) player.pause();
          else player.play();
          break;
        case 'left':
        case 'rewind':
          player.seekBy(-SKIP_SECONDS);
          break;
        case 'right':
        case 'fastForward':
          player.seekBy(SKIP_SECONDS);
          break;
        default:
          return;
      }
      onHint();
    },
    [onHint, player],
  );

  useRemote(onRemote);
  return SKIP_SECONDS;
}
