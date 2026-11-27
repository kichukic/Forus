// The TV remote: play/pause and smart debounced seeking.
import { useCallback, useEffect, useRef } from 'react';
import { useTVEventHandler, type HWEvent } from 'react-native';
import type { VideoPlayer } from 'expo-video';

const SKIP_SECONDS = 15;
const KEY_REPEAT_MS = 100;
const SEEK_COMMIT_DELAY_MS = 320;

const useRemote: typeof useTVEventHandler = useTVEventHandler ?? (() => {});

export type SeekState = {
  active: boolean;
  delta: number;
  targetTime: number;
};

function applySeekTarget(player: VideoPlayer, target: number) {
  try {
    player.currentTime = target;
  } catch {
    // Player may have been released
  }
}

function togglePlayback(player: VideoPlayer) {
  try {
    if (player.playing) player.pause();
    else player.play();
  } catch {
    // Player may have been released
  }
}

export function useRemoteSeek(
  player: VideoPlayer,
  onHint: () => void,
  onSeekChange?: (state: SeekState | null) => void,
) {
  const lastKey = useRef<{ type: string; at: number } | null>(null);
  const seekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseTimeRef = useRef(0);
  const deltaRef = useRef(0);

  const commitSeek = useCallback(() => {
    if (seekTimer.current) {
      clearTimeout(seekTimer.current);
      seekTimer.current = null;
    }
    const delta = deltaRef.current;
    const base = baseTimeRef.current;
    deltaRef.current = 0;

    if (delta !== 0) {
      const dur = player.duration ?? 0;
      const target = Math.max(0, dur > 0 ? Math.min(dur - 2, base + delta) : base + delta);
      applySeekTarget(player, target);
    }
    onSeekChange?.(null);
  }, [player, onSeekChange]);

  useEffect(() => {
    return () => {
      if (seekTimer.current) clearTimeout(seekTimer.current);
    };
  }, []);

  const onRemote = useCallback(
    (evt: HWEvent) => {
      // Ignore key up events (action 1) so buttons trigger instantly on key down (action 0)
      if (String(evt.eventKeyAction) === '1') return;

      const now = Date.now();
      if (lastKey.current?.type === evt.eventType && now - lastKey.current.at < KEY_REPEAT_MS) {
        return;
      }
      lastKey.current = { type: evt.eventType, at: now };

      switch (evt.eventType) {
        case 'playPause': {
          if (seekTimer.current) {
            commitSeek();
          } else {
            togglePlayback(player);
          }
          break;
        }
        case 'select': {
          if (seekTimer.current) {
            commitSeek();
          }
          break;
        }
        case 'left':
        case 'rewind': {
          if (!seekTimer.current) {
            baseTimeRef.current = player.currentTime ?? 0;
            deltaRef.current = -SKIP_SECONDS;
          } else {
            deltaRef.current -= SKIP_SECONDS;
          }
          const dur = player.duration ?? 0;
          const target = Math.max(
            0,
            dur > 0 ? Math.min(dur - 2, baseTimeRef.current + deltaRef.current) : baseTimeRef.current + deltaRef.current,
          );
          onSeekChange?.({ active: true, delta: deltaRef.current, targetTime: target });
          onHint();

          if (seekTimer.current) clearTimeout(seekTimer.current);
          seekTimer.current = setTimeout(commitSeek, SEEK_COMMIT_DELAY_MS);
          break;
        }
        case 'right':
        case 'fastForward': {
          if (!seekTimer.current) {
            baseTimeRef.current = player.currentTime ?? 0;
            deltaRef.current = SKIP_SECONDS;
          } else {
            deltaRef.current += SKIP_SECONDS;
          }
          const dur = player.duration ?? 0;
          const target = Math.max(
            0,
            dur > 0 ? Math.min(dur - 2, baseTimeRef.current + deltaRef.current) : baseTimeRef.current + deltaRef.current,
          );
          onSeekChange?.({ active: true, delta: deltaRef.current, targetTime: target });
          onHint();

          if (seekTimer.current) clearTimeout(seekTimer.current);
          seekTimer.current = setTimeout(commitSeek, SEEK_COMMIT_DELAY_MS);
          break;
        }
        default:
          return;
      }
      onHint();
    },
    [commitSeek, onHint, onSeekChange, player],
  );

  useRemote(onRemote);
  return SKIP_SECONDS;
}
