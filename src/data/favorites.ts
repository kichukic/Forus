// Favorites storage & reactive store: lets users heart any movie, show,
// TorBox file, or YouTube video and access them instantly in the Favorites tab.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

const STORAGE_KEY = '@forus_favorites_v1';

export type FavoriteKind = 'moviebox' | 'file' | 'video' | 'movie' | 'stream' | 'web';

export type FavoriteItem = {
  id: string; // unique ID, e.g. "moviebox:12345" or "yt:video123" or "file:torrent:1:2"
  kind: FavoriteKind;
  title: string;
  poster?: string;
  year?: string;
  rating?: string;
  genre?: string;
  channel?: string;
  duration?: string;
  // Specific to MovieBox:
  subjectId?: string;
  season?: number;
  episode?: number;
  // Specific to TorBox file:
  source?: string;
  itemId?: number;
  fileId?: number;
  size?: number;
  // Specific to video / stream:
  videoId?: string;
  url?: string;
  addedAt?: number;
};

let favoritesCache: FavoriteItem[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export function subscribeFavorites(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export async function loadFavorites(): Promise<FavoriteItem[]> {
  if (loaded) return favoritesCache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      favoritesCache = JSON.parse(raw);
    }
  } catch {}
  loaded = true;
  notify();
  return favoritesCache;
}

export function getFavoritesSync(): FavoriteItem[] {
  return favoritesCache;
}

export async function saveFavorites(items: FavoriteItem[]) {
  favoritesCache = items;
  notify();
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {}
}

export async function addFavorite(item: FavoriteItem): Promise<void> {
  await loadFavorites();
  const exists = favoritesCache.some((f) => f.id === item.id);
  if (exists) return;
  const itemWithTime: FavoriteItem = {
    ...item,
    addedAt: item.addedAt || Date.now(),
  };
  const updated = [itemWithTime, ...favoritesCache];
  await saveFavorites(updated);
}

export async function removeFavorite(id: string): Promise<void> {
  await loadFavorites();
  const updated = favoritesCache.filter((f) => f.id !== id);
  await saveFavorites(updated);
}

export async function toggleFavorite(item: FavoriteItem): Promise<boolean> {
  await loadFavorites();
  const exists = favoritesCache.some((f) => f.id === item.id);
  if (exists) {
    await removeFavorite(item.id);
    return false;
  } else {
    await addFavorite(item);
    return true;
  }
}

export function isFavoriteSync(id: string): boolean {
  return favoritesCache.some((f) => f.id === id);
}

export function useFavorites(): FavoriteItem[] {
  return useSyncExternalStore(subscribeFavorites, () => favoritesCache);
}

export function useIsFavorite(id: string): boolean {
  return useSyncExternalStore(subscribeFavorites, () => favoritesCache.some((f) => f.id === id));
}

// Initial eager load
void loadFavorites();
