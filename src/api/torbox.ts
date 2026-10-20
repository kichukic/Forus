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
