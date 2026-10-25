import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import {
  fetchGloballyBlockedBanners,
  blockBannerGloballyApi,
  unblockBannerGloballyApi,
  getAdminBlockedBanners,
  type BlockedBannerItem,
} from '../chat/api';

export type LocalHiddenBanner = {
  videoId: string;
  title: string;
  channel?: string;
  hiddenAt: string;
};

const LOCAL_HIDDEN_KEY = 'forus:local_hidden_banners';
const GLOBAL_BLOCKED_CACHE_KEY = 'forus:global_blocked_banners_cache';

let localHidden = new Map<string, LocalHiddenBanner>();
let globalBlocked = new Set<string>();
let globalBlockedItems: BlockedBannerItem[] = [];

type Listener = () => void;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeBannerFilter(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

let initialized = false;

export async function initBannerFilter(): Promise<void> {
  if (initialized) return;
  initialized = true;

  try {
    const rawLocal = await AsyncStorage.getItem(LOCAL_HIDDEN_KEY);
    if (rawLocal) {
      const parsed: LocalHiddenBanner[] = JSON.parse(rawLocal);
      localHidden = new Map(parsed.map((item) => [item.videoId, item]));
    }
  } catch {
    // Ignore storage parse failure
  }

  try {
    const rawGlobal = await AsyncStorage.getItem(GLOBAL_BLOCKED_CACHE_KEY);
    if (rawGlobal) {
      const parsed: string[] = JSON.parse(rawGlobal);
      globalBlocked = new Set(parsed);
    }
  } catch {
    // Ignore storage parse failure
  }

  emit();

  // Refresh global blocked banners from server in the background
  refreshGlobalBlockedBanners().catch(() => {});
}

export async function refreshGlobalBlockedBanners(): Promise<void> {
  try {
    const res = await fetchGloballyBlockedBanners();
    if (res?.ok && Array.isArray(res.blockedVideoIds)) {
      globalBlocked = new Set(res.blockedVideoIds);
      globalBlockedItems = res.items || [];
      await AsyncStorage.setItem(GLOBAL_BLOCKED_CACHE_KEY, JSON.stringify(res.blockedVideoIds)).catch(() => {});
      emit();
    }
  } catch {
    // Keep cached version if offline
  }
}

export function isBannerBlocked(videoId: string): boolean {
  if (!videoId) return false;
  return localHidden.has(videoId) || globalBlocked.has(videoId);
}

export async function hideBannerLocally(item: { videoId: string; title: string; channel?: string }): Promise<void> {
  if (!item.videoId) return;
  const entry: LocalHiddenBanner = {
    videoId: item.videoId,
    title: item.title,
    channel: item.channel,
    hiddenAt: new Date().toISOString(),
  };
  localHidden.set(item.videoId, entry);
  emit();
  await AsyncStorage.setItem(LOCAL_HIDDEN_KEY, JSON.stringify([...localHidden.values()])).catch(() => {});
}

export async function unhideBannerLocally(videoId: string): Promise<void> {
  if (!localHidden.has(videoId)) return;
  localHidden.delete(videoId);
  emit();
  await AsyncStorage.setItem(LOCAL_HIDDEN_KEY, JSON.stringify([...localHidden.values()])).catch(() => {});
}

export async function clearAllLocalHidden(): Promise<void> {
  localHidden.clear();
  emit();
  await AsyncStorage.removeItem(LOCAL_HIDDEN_KEY).catch(() => {});
}

export async function blockBannerGlobally(item: {
  videoId: string;
  title: string;
  channel?: string;
}): Promise<void> {
  if (!item.videoId) return;
  await blockBannerGloballyApi(item);
  globalBlocked.add(item.videoId);
  const now = new Date().toISOString();
  globalBlockedItems = [
    { videoId: item.videoId, title: item.title, channel: item.channel, createdAt: now },
    ...globalBlockedItems.filter((b) => b.videoId !== item.videoId),
  ];
  await AsyncStorage.setItem(GLOBAL_BLOCKED_CACHE_KEY, JSON.stringify([...globalBlocked])).catch(() => {});
  emit();
}

export async function unblockBannerGlobally(videoId: string): Promise<void> {
  if (!videoId) return;
  await unblockBannerGloballyApi(videoId);
  globalBlocked.delete(videoId);
  globalBlockedItems = globalBlockedItems.filter((b) => b.videoId !== videoId);
  await AsyncStorage.setItem(GLOBAL_BLOCKED_CACHE_KEY, JSON.stringify([...globalBlocked])).catch(() => {});
  emit();
}

export async function fetchAdminBlockedBannersList(): Promise<BlockedBannerItem[]> {
  try {
    const res = await getAdminBlockedBanners();
    if (res?.ok && Array.isArray(res.items)) {
      globalBlockedItems = res.items;
      globalBlocked = new Set(res.items.map((b) => b.videoId));
      emit();
      return res.items;
    }
  } catch {
    // Ignore error
  }
  return globalBlockedItems;
}

export function getLocalHiddenList(): LocalHiddenBanner[] {
  return [...localHidden.values()];
}

export function getGlobalBlockedList(): BlockedBannerItem[] {
  return [...globalBlockedItems];
}

export function useBannerFilter() {
  const version = useSyncExternalStore(subscribeBannerFilter, () => localHidden.size + globalBlocked.size);
  return {
    version,
    isBlocked: isBannerBlocked,
    localCount: localHidden.size,
    globalCount: globalBlocked.size,
    localList: getLocalHiddenList(),
    globalList: getGlobalBlockedList(),
    hideLocally: hideBannerLocally,
    unhideLocally: unhideBannerLocally,
    clearLocal: clearAllLocalHidden,
    blockGlobally: blockBannerGlobally,
    unblockGlobally: unblockBannerGlobally,
  };
}
