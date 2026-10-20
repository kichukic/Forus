import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Playable } from '../types';

const KEY = 'recently-watched';
const MAX_ITEMS = 20;

export function playableKey(item: Playable): string {
  switch (item.kind) {
    case 'live':
      return `live:${item.channelId}`;
    case 'video':
      return `video:${item.videoId}`;
    case 'file':
      return `file:${item.source}:${item.itemId}:${item.fileId}`;
  }
}

export async function loadHistory(): Promise<Playable[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// Newest first; watching something again moves it back to the front.
export function addToHistory(history: Playable[], item: Playable): Playable[] {
  const key = playableKey(item);
  const next = [item, ...history.filter((h) => playableKey(h) !== key)].slice(0, MAX_ITEMS);
  AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  return next;
}

export function clearHistory(): Playable[] {
  AsyncStorage.removeItem(KEY).catch(() => {});
  return [];
}
