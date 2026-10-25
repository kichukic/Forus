import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Playable } from '../types';

const KEY = 'recently-watched';
const MAX_ITEMS = 50;

// A history entry is the title as it plays, plus when it was last watched (ms).
// Entries saved before times were kept have none.
export type HistoryEntry = Playable & { watchedAt?: number };

export function playableKey(item: Playable): string {
  switch (item.kind) {
    case 'live':
      return `live:${item.channelId}`;
    case 'video':
      return `video:${item.videoId}`;
    case 'file':
      return `file:${item.source}:${item.itemId}:${item.fileId}`;
    case 'moviebox':
      return `moviebox:${item.subjectId}:${item.season}:${item.episode}`;
    case 'stream':
      return `stream:${item.url}`;
    case 'web':
      return `web:${item.url}`;
  }
}

export async function loadHistory(): Promise<HistoryEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(history: HistoryEntry[]) {
  AsyncStorage.setItem(KEY, JSON.stringify(history)).catch(() => {});
}

// Newest first; watching something again moves it back to the front.
export function addToHistory(history: HistoryEntry[], item: Playable): HistoryEntry[] {
  const key = playableKey(item);
  const next = [{ ...item, watchedAt: Date.now() }, ...history.filter((h) => playableKey(h) !== key)].slice(0, MAX_ITEMS);
  save(next);
  return next;
}

/**
 * Joins two histories (this phone's and the server's): one entry per title,
 * the later time winning, newest first.
 */
export function mergeHistories(a: HistoryEntry[], b: HistoryEntry[]): HistoryEntry[] {
  const byKey = new Map<string, HistoryEntry>();
  for (const entry of [...a, ...b]) {
    const key = playableKey(entry);
    const have = byKey.get(key);
    if (!have || (entry.watchedAt ?? 0) > (have.watchedAt ?? 0)) byKey.set(key, entry);
  }
  const next = [...byKey.values()].sort((x, y) => (y.watchedAt ?? 0) - (x.watchedAt ?? 0)).slice(0, MAX_ITEMS);
  save(next);
  return next;
}

export function clearHistory(): HistoryEntry[] {
  AsyncStorage.removeItem(KEY).catch(() => {});
  return [];
}
