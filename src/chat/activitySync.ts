// Keeps the personalization activity with the chat account, so it isn't lost
// with the phone or a reinstall and shows up on any phone signed in to the
// same account. Mirrors historySync.
import { getStore, initActivity } from '../data/activity';
import * as api from './api';

/** Pushes the local activity to the server (fire and forget). */
export function pushActivity() {
  if (!api.sessionToken()) return;
  const s = getStore();
  api
    .mergeActivity({
      watches: s.watches,
      searches: s.searches,
      favorites: s.favorites,
      downloads: s.downloads,
      opens: s.opens,
    })
    .catch(() => {});
}

/** Pulls the account's activity and merges it into the local store. */
export async function syncActivity(): Promise<boolean> {
  if (!api.sessionToken()) return false;
  await initActivity();
  try {
    const remote = await api.getActivity();
    const local = getStore();
    // Merge: remote wins when newer (by `at`).
    const byKey = <T extends { id?: string; source?: string; query?: string; at?: number }>(
      arr: T[],
      remoteArr: unknown[],
      keyFn: (x: T) => string,
    ) => {
      const map = new Map<string, T>();
      for (const e of arr) map.set(keyFn(e), e);
      for (const r of remoteArr) {
        const e = r as T;
        const k = keyFn(e);
        const prev = map.get(k);
        if (!prev || (e.at ?? 0) >= (prev.at ?? 0)) map.set(k, e);
      }
      return [...map.values()];
    };
    const watches = byKey(local.watches as any, remote.watches ?? [], (x: any) => `w:${x.source}:${x.id}`);
    const favorites = byKey(local.favorites as any, remote.favorites ?? [], (x: any) => `f:${x.source}:${x.id}`);
    const downloads = byKey(local.downloads as any, remote.downloads ?? [], (x: any) => `d:${x.source}:${x.id}`);
    const opens = byKey(local.opens as any, remote.opens ?? [], (x: any) => `o:${x.source}:${x.id}`);
    // Searches: dedupe by query, keep newer.
    const searchMap = new Map<string, any>();
    for (const s of local.searches) searchMap.set((s.query ?? '').toLowerCase().trim(), s);
    for (const r of remote.searches ?? []) {
      const s = r as any;
      const k = (s.query ?? '').toLowerCase().trim();
      if (!k) continue;
      const prev = searchMap.get(k);
      if (!prev || (s.at ?? 0) >= (prev.at ?? 0)) searchMap.set(k, s);
    }
    const searches = [...searchMap.values()];

    // Write merged back to local store via the activity module's internal setter.
    // We use the exported mutate helpers.
    const { replaceStore } = await import('../data/activity');
    replaceStore({ watches, searches, favorites, downloads, opens });
    return true;
  } catch {
    return false;
  }
}

export function clearSyncedActivity() {
  if (api.sessionToken()) api.clearRemoteActivity().catch(() => {});
}
