// On-device activity tracking for personalization. Everything stays on the
// phone (and optionally syncs to the chat account later). No server needed.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

const KEY = '@forus_activity_v1';
const MAX_WATCHES = 400;
const MAX_SEARCHES = 200;
const MAX_EVENTS = 600;

export type ActivityKind = 'watch' | 'search' | 'favorite' | 'download' | 'open';

export type WatchEvent = {
  kind: 'watch';
  id: string;            // subject id / video id / url
  source: 'moviebox' | 'stream' | 'video' | 'file' | 'live';
  title: string;
  genre?: string;
  language?: string;
  country?: string;
  year?: string;
  /** 0..1 completion. */
  progress: number;
  duration: number;      // seconds
  completed: boolean;
  at: number;
};

export type SearchEvent = {
  kind: 'search';
  query: string;
  at: number;
  /** Subject id the user opened from the results, if any. */
  clickedId?: string;
  clickedTitle?: string;
};

export type FavoriteEvent = {
  kind: 'favorite';
  id: string;
  source: 'moviebox' | 'stream' | 'video' | 'file' | 'live';
  title: string;
  genre?: string;
  language?: string;
  year?: string;
  at: number;
};

export type DownloadEvent = {
  kind: 'download';
  id: string;
  source: 'moviebox' | 'stream' | 'file';
  title: string;
  genre?: string;
  at: number;
};

export type OpenEvent = {
  kind: 'open';
  id: string;
  source: string;
  title: string;
  at: number;
};

export type ActivityEvent = WatchEvent | SearchEvent | FavoriteEvent | DownloadEvent | OpenEvent;

type Store = {
  watches: WatchEvent[];
  searches: SearchEvent[];
  favorites: FavoriteEvent[];
  downloads: DownloadEvent[];
  opens: OpenEvent[];
};

let store: Store = { watches: [], searches: [], favorites: [], downloads: [], opens: [] };
let pushTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    import('../chat/activitySync')
      .then((m) => m.pushActivity())
      .catch(() => {});
  }, 4000);
}
let loaded = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

async function persist() {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // best effort
  }
}

export async function initActivity() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        store = {
          watches: Array.isArray(parsed.watches) ? parsed.watches.slice(-MAX_WATCHES) : [],
          searches: Array.isArray(parsed.searches) ? parsed.searches.slice(-MAX_SEARCHES) : [],
          favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
          downloads: Array.isArray(parsed.downloads) ? parsed.downloads : [],
          opens: Array.isArray(parsed.opens) ? parsed.opens.slice(-MAX_EVENTS) : [],
        };
      }
    }
  } catch {
    store = { watches: [], searches: [], favorites: [], downloads: [], opens: [] };
  }
  notify();
}

initActivity().catch(() => {});

export function useActivity() {
  return useSyncExternalStore(
    (fn: () => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => store,
  );
}

export function getStore(): Store {
  return store;
}

/** Replaces the local store (used after a server sync). Persists. */
export async function replaceStore(next: Partial<Store>) {
  await initActivity();
  store = {
    watches: Array.isArray(next.watches) ? next.watches.slice(-MAX_WATCHES) : store.watches,
    searches: Array.isArray(next.searches) ? next.searches.slice(-MAX_SEARCHES) : store.searches,
    favorites: Array.isArray(next.favorites) ? next.favorites : store.favorites,
    downloads: Array.isArray(next.downloads) ? next.downloads : store.downloads,
    opens: Array.isArray(next.opens) ? next.opens.slice(-MAX_EVENTS) : store.opens,
  };
  notify();
  void persist();
}

function cap<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  return arr.slice(arr.length - max);
}

export async function trackWatch(event: Omit<WatchEvent, 'kind' | 'at'> & { at?: number }) {
  await initActivity();
  const entry: WatchEvent = { kind: 'watch', at: event.at ?? Date.now(), ...event };
  // Replace an existing watch of the same title with the newer one.
  store.watches = store.watches.filter((w) => !(w.source === entry.source && w.id === entry.id));
  store.watches.push(entry);
  store.watches = cap(store.watches, MAX_WATCHES);
  notify();
  void persist();
  schedulePush();
}

export async function trackSearch(query: string, clickedId?: string, clickedTitle?: string) {
  await initActivity();
  const entry: SearchEvent = { kind: 'search', query: query.trim(), at: Date.now(), clickedId, clickedTitle };
  if (!entry.query) return;
  store.searches.push(entry);
  store.searches = cap(store.searches, MAX_SEARCHES);
  notify();
  void persist();
  schedulePush();
}

export async function trackFavorite(event: Omit<FavoriteEvent, 'kind' | 'at'> & { at?: number }) {
  await initActivity();
  const entry: FavoriteEvent = { kind: 'favorite', at: event.at ?? Date.now(), ...event };
  // Toggle: if already favorited, remove.
  const idx = store.favorites.findIndex((f) => f.source === entry.source && f.id === entry.id);
  if (idx >= 0) {
    store.favorites.splice(idx, 1);
  } else {
    store.favorites.push(entry);
  }
  notify();
  void persist();
  schedulePush();
}

export async function trackDownload(event: Omit<DownloadEvent, 'kind' | 'at'> & { at?: number }) {
  await initActivity();
  const entry: DownloadEvent = { kind: 'download', at: event.at ?? Date.now(), ...event };
  store.downloads.push(entry);
  store.downloads = cap(store.downloads, MAX_EVENTS);
  notify();
  void persist();
  schedulePush();
}

export async function trackOpen(event: Omit<OpenEvent, 'kind' | 'at'> & { at?: number }) {
  await initActivity();
  const entry: OpenEvent = { kind: 'open', at: event.at ?? Date.now(), ...event };
  store.opens.push(entry);
  store.opens = cap(store.opens, MAX_EVENTS);
  notify();
  void persist();
  schedulePush();
}

export function isFavorited(source: string, id: string): boolean {
  return store.favorites.some((f) => f.source === source && f.id === id);
}
