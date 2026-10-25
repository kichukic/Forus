// Keeps watch history with the chat account, so it isn't lost with the phone
// or a reinstall and shows up on any phone signed in to the same account.
// Each play is sent as it happens; on signing in and each time the app comes
// back, this phone's history and the server's are merged (later time wins).
//
// Kept on the server: YouTube videos, live channels and files in the person's
// own TorBox. Anything else stays on this phone only.
import type { HistoryEntry } from '../data/history';
import type { Playable } from '../types';
import * as api from './api';

const SYNCED_KINDS = new Set<Playable['kind']>(['video', 'live', 'file']);

function synced(item: Playable): boolean {
  return SYNCED_KINDS.has(item.kind);
}

// Only the fields the server keeps, so nothing else on an entry is sent.
function wireItem(item: Playable): Playable {
  switch (item.kind) {
    case 'video':
      return { kind: 'video', videoId: item.videoId, title: item.title };
    case 'live':
      return { kind: 'live', channelId: item.channelId, title: item.title };
    case 'file':
      return { kind: 'file', source: item.source, itemId: item.itemId, fileId: item.fileId, title: item.title };
    default:
      return item;
  }
}

/** Sends one play. Quietly does nothing when signed out or offline. */
export function pushWatched(item: Playable) {
  if (!api.sessionToken() || !synced(item)) return;
  api
    .mergeHistory([{ item: wireItem(item), watchedAt: new Date().toISOString() }])
    .catch(() => {});
}

/**
 * Sends this phone's history and returns the account's, as entries to merge
 * in. Entries saved before times were kept count as watched a little earlier
 * than anything since, in their order.
 */
export async function syncHistory(local: HistoryEntry[]): Promise<HistoryEntry[] | null> {
  if (!api.sessionToken()) return null;
  const oldest = Math.min(Date.now(), ...local.map((e) => e.watchedAt ?? Infinity));
  const entries = local.filter(synced).map((e, i) => ({
    item: wireItem(e),
    watchedAt: new Date(e.watchedAt ?? oldest - (i + 1) * 1000).toISOString(),
  }));
  try {
    const remote = await api.mergeHistory(entries);
    return remote.map((r) => ({ ...r.item, watchedAt: Date.parse(r.watchedAt) }));
  } catch {
    return null;
  }
}

/** Clearing history on one phone clears it for the account too. */
export function clearSyncedHistory() {
  if (api.sessionToken()) api.clearRemoteHistory().catch(() => {});
}
