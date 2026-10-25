// Sharing a ForUs video, movie, or series with a friend from anywhere in the app:
// a card or the player asks here, and the one "Send to a friend" sheet (in App) opens.
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

export function shareMovie(movie: { id: string; title: string; poster?: string; year?: string }) {
  set({ kind: 'movie', id: movie.id, title: movie.title, poster: movie.poster, year: movie.year });
}

export function shareMoviebox(subject: { id: string; title: string; poster?: string }) {
  set({ kind: 'moviebox', subjectId: subject.id, title: subject.title, poster: subject.poster });
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
 * The long-press handler that shares any title (YouTube, Movie, MovieBox, Series, etc.),
 * for a card's `onLongPress`. Undefined on TV, which has no chat.
 */
export function shareOnLongPress(
  target: string | SharedTitle,
  title?: string,
): (() => void) | undefined {
  if (isTV) return undefined;
  if (typeof target === 'string') {
    return () => shareTitle({ kind: 'video', videoId: target, title: title ?? '' });
  }
  return () => shareTitle(target);
}
