// Stremio-style addons. An addon is just a URL whose manifest describes what
// it provides (catalogs, meta, streams). Anything installed here is queried for
// streams when a film or episode is opened, the way Streamio queries its
// installed addons.
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'streamiobox-addons';

export type AddonManifest = {
  id?: string;
  name?: string;
  version?: string;
  description?: string;
  resources?: (string | { name: string; types?: string[]; idPrefixes?: string[] })[];
  types?: string[];
  catalogs?: { type: string; id: string; name?: string }[];
};

export type Addon = {
  url: string; // base URL, no trailing slash
  manifest?: AddonManifest;
};

export type StreamResult = {
  name?: string;
  title?: string;
  url?: string;
  infoHash?: string;
  fileIdx?: number;
  behaviorHints?: { filename?: string; bingeGroup?: string };
};

const DEFAULT_ADDONS: string[] = [
  'https://torrentio.strem.fun',
];

function normalize(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

async function loadStored(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT_ADDONS;
}

async function saveStored(urls: string[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(urls));
}

export async function getAddonUrls(): Promise<string[]> {
  return await loadStored();
}

export async function addAddon(url: string): Promise<void> {
  const n = normalize(url);
  const list = await loadStored();
  if (!list.includes(n)) {
    list.push(n);
    await saveStored(list);
  }
}

export async function removeAddon(url: string): Promise<void> {
  const n = normalize(url);
  const list = (await loadStored()).filter((u) => u !== n);
  await saveStored(list);
}

async function fetchJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchManifest(url: string): Promise<AddonManifest | null> {
  const n = normalize(url);
  const body = await fetchJson(`${n}/manifest.json`);
  return body ?? null;
}

export async function getStreams(addonUrl: string, type: string, id: string): Promise<StreamResult[]> {
  const n = normalize(addonUrl);
  const body = await fetchJson(`${n}/stream/${type}/${id}.json`);
  return body?.streams ?? [];
}

export async function getAllStreams(type: string, id: string): Promise<{ addon: string; streams: StreamResult[] }[]> {
  const urls = await getAddonUrls();
  const results = await Promise.all(
    urls.map(async (u) => {
      const streams = await getStreams(u, type, id).catch(() => [] as StreamResult[]);
      return { addon: u, streams };
    }),
  );
  return results.filter((r) => r.streams.length > 0);
}
