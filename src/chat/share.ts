// Sharing a ForUs video with a friend from anywhere in the app: a card or the
// player asks here, and the one "Send to a friend" sheet (in App) opens.
// Only YouTube videos are shareable: a friend's app can play those as they are.
import { useSyncExternalStore } from 'react';
import { isTV } from '../theme';
import type { SharedTitle } from './api';

let request: SharedTitle | null = null;
const listeners = new Set<() => void>();

function set(next: SharedTitle | null) {
  request = next;
  listeners.forEach((fn) => fn());
}

export function shareTitle(title: SharedTitle) {
  set(title);
}

export function closeShare() {
  set(null);
}

export function useShareRequest(): SharedTitle | null {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => request,
  );
}

/**
 * The long-press handler that shares a YouTube video, for a card's
 * `onLongPress`. Undefined on TV, which has no chat.
 */
export function shareOnLongPress(videoId: string, title: string): (() => void) | undefined {
  if (isTV) return undefined;
  return () => shareTitle({ kind: 'video', videoId, title });
}
