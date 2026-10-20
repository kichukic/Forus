// Plays files that are already in the user's own TorBox cloud. This only lists
// and streams the account's existing downloads; it does not search for or add
// anything.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TorboxSource } from '../types';

const BASE = 'https://api.torbox.app/v1/api';
const KEY_STORAGE = 'torbox-api-key';

// requestdl takes the item id under a different name for each library.
const ID_PARAM: Record<TorboxSource, string> = {
  torrents: 'torrent_id',
  usenet: 'usenet_id',
  webdl: 'web_id',
};

const VIDEO_EXT = /\.(mp4|m4v|mkv|webm|mov|avi|ts|m2ts|wmv|flv)$/i;

export type TorboxFile = {
  source: TorboxSource;
  itemId: number;
  fileId: number;
  name: string;
  size: number;
};

type ApiItem = {
  id: number;
  name?: string;
  download_present?: boolean;
  download_finished?: boolean;
  files?: { id: number; name?: string; short_name?: string; size?: number; mimetype?: string }[];
};

export async function getApiKey(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEY_STORAGE);
  } catch {
    return null;
  }
}

export async function setApiKey(key: string | null): Promise<void> {
  if (key) await AsyncStorage.setItem(KEY_STORAGE, key);
  else await AsyncStorage.removeItem(KEY_STORAGE);
}

async function call<T>(path: string, key: string): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, { headers: { Authorization: `Bearer ${key}` } });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    throw new Error(body?.detail || body?.error || `TorBox returned ${res.status}`);
  }
  return body.data as T;
}

// Throws with TorBox's message if the key is wrong.
export async function checkApiKey(key: string): Promise<void> {
  await call('user/me', key);
}

export async function listVideoFiles(key: string): Promise<TorboxFile[]> {
  const sources: TorboxSource[] = ['torrents', 'usenet', 'webdl'];
  const lists = await Promise.all(
    // Usenet and web downloads may not be on the user's plan; skip those quietly.
    sources.map((s) => call<ApiItem[]>(`${s}/mylist?bypass_cache=true`, key).catch(() => [] as ApiItem[])),
  );

  const files: TorboxFile[] = [];
  lists.forEach((items, i) => {
    for (const item of items ?? []) {
      if (item.download_present === false && item.download_finished === false) continue;
      for (const f of item.files ?? []) {
        const name = f.short_name || f.name || '';
        if (!f.mimetype?.startsWith('video/') && !VIDEO_EXT.test(name)) continue;
        files.push({ source: sources[i], itemId: item.id, fileId: f.id, name, size: f.size ?? 0 });
      }
    }
  });
  return files;
}

// Links expire, so one is requested each time a file is played.
export async function getStreamUrl(key: string, file: Omit<TorboxFile, 'name' | 'size'>): Promise<string> {
  const params = `token=${encodeURIComponent(key)}&${ID_PARAM[file.source]}=${file.itemId}&file_id=${file.fileId}`;
  return call<string>(`${file.source}/requestdl?${params}`, key);
}

export function formatSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / 1e6))} MB`;
}

// A torrent in the account, with everything needed to follow its progress.
export type TorboxTorrent = {
  id: number;
  hash: string;
  name: string;
  /** 0 to 100. */
  progress: number;
  downloadState: string;
  downloadFinished: boolean;
  downloadPresent: boolean;
  eta?: number;
  downloadSpeed?: number;
  files: { id: number; name: string; size: number; mimetype?: string }[];
};

type ApiTorrent = {
  id?: number;
  hash?: string;
  name?: string;
  progress?: number;
  download_state?: string;
  downloadState?: string;
  download_finished?: boolean;
  downloadFinished?: boolean;
  download_present?: boolean;
  downloadPresent?: boolean;
  eta?: number;
  download_speed?: number;
  downloadSpeed?: number;
  files?: { id?: number; name?: string; short_name?: string; size?: number; mimetype?: string }[];
};

function toTorrent(item: ApiTorrent): TorboxTorrent {
  // TorBox reports progress as a fraction in some places and a percent in others.
  const raw = item.progress ?? 0;
  const progress = raw > 0 && raw <= 1 ? Math.round(raw * 100) : Math.round(raw);
  return {
    id: item.id ?? 0,
    hash: item.hash ?? '',
    name: item.name ?? '',
    progress: Math.min(100, Math.max(0, progress)),
    downloadState: item.downloadState ?? item.download_state ?? 'unknown',
    downloadFinished: item.downloadFinished ?? item.download_finished ?? false,
    downloadPresent: item.downloadPresent ?? item.download_present ?? false,
    eta: item.eta,
    downloadSpeed: item.downloadSpeed ?? item.download_speed,
    files: (item.files ?? []).map((f) => ({
      id: f.id ?? 0,
      name: f.short_name || f.name || '',
      size: f.size ?? 0,
      mimetype: f.mimetype,
    })),
  };
}

/** One torrent from the account, by its id. */
export async function getTorrent(key: string, id: number): Promise<TorboxTorrent | null> {
  const list = await call<ApiTorrent[]>(`torrents/mylist?id=${id}&bypass_cache=true`, key).catch(
    () => [] as ApiTorrent[],
  );
  const found = (list ?? []).find((t) => t.id === id) ?? list?.[0];
  return found ? toTorrent(found) : null;
}

/** Looks for a torrent the account already has, by its hash. */
export async function findTorrentByHash(key: string, hash: string): Promise<TorboxTorrent | null> {
  const list = await call<ApiTorrent[]>(`torrents/mylist?bypass_cache=true`, key).catch(
    () => [] as ApiTorrent[],
  );
  const found = (list ?? []).find((t) => (t.hash ?? '').toLowerCase() === hash.toLowerCase());
  return found ? toTorrent(found) : null;
}

/** Hands a magnet to TorBox, which downloads it into the account's cloud. */
export async function createTorrent(
  key: string,
  magnet: string,
  name?: string,
): Promise<{ torrentId: number; hash: string }> {
  const form = new FormData();
  form.append('magnet', magnet);
  form.append('seed', '1');
  if (name) form.append('name', name);

  const res = await fetch(`${BASE}/torrents/createtorrent`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    throw new Error(body?.detail || body?.error || `TorBox returned ${res.status}`);
  }
  return { torrentId: body.data?.torrent_id, hash: body.data?.hash ?? '' };
}

/** The biggest video file of a torrent, which is the one to play. */
export function mainVideoFile(torrent: TorboxTorrent) {
  const videos = torrent.files.filter(
    (f) => f.mimetype?.startsWith('video/') || VIDEO_EXT.test(f.name),
  );
  if (videos.length === 0) return null;
  return videos.reduce((biggest, f) => (f.size > biggest.size ? f : biggest));
}
