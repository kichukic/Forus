// Third-party YouTube extractors. None of them is guaranteed to be up, so
// every one of them is optional: the app keeps working through the official
// YouTube sources when these fail.

export type Media = {
  url: string;
  kind: 'hls' | 'file';
  headers?: Record<string, string>;
};

const TIMEOUT_MS = 6000;

export const COBALT_INSTANCES = [
  'https://api.cobalt.tools',
  'https://co.wuk.sh',
  'https://cobalt-api.kwiatekmiki.com',
];

export const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://api.piped.private.coffee',
  'https://pipedapi.leptons.xyz',
];

export const CONSUMET_INSTANCES = [
  'https://consumet-api.vercel.app',
  'https://consumet-instance.vercel.app',
];

async function getJson(url: string, init?: RequestInit): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0', ...init?.headers },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function kindOf(url: string): 'hls' | 'file' {
  return url.includes('.m3u8') || url.includes('/manifest/') ? 'hls' : 'file';
}

function qualityNumber(value: unknown): number {
  const match = String(value ?? '').match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

/** Cobalt: POST {url} -> { status: "stream", url, headers }. */
export async function extractCobalt(videoId: string): Promise<Media | null> {
  for (const base of COBALT_INSTANCES) {
    const body = JSON.stringify({
      url: `https://www.youtube.com/watch?v=${videoId}`,
      videoQuality: '1080',
      downloadMode: 'auto',
    });
    const json =
      (await getJson(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })) ?? (await getJson(`${base}/api/json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }));
    if (json?.status === 'stream' && json.url) {
      return { url: json.url, kind: kindOf(json.url), headers: json.headers };
    }
  }
  return null;
}

/** Piped: GET /streams/{id} -> { hls, videoStreams[] }. */
export async function extractPiped(videoId: string): Promise<Media | null> {
  for (const base of PIPED_INSTANCES) {
    const json = await getJson(`${base}/streams/${videoId}`);
    if (!json) continue;
    if (json.hls) return { url: json.hls, kind: 'hls' };
    const withAudio = (json.videoStreams ?? []).filter((s: any) => !s.videoOnly && s.url);
    const best = withAudio.sort(
      (a: any, b: any) => qualityNumber(b.quality) - qualityNumber(a.quality),
    )[0];
    if (best) return { url: best.url, kind: 'file' };
  }
  return null;
}

/** Invidious: GET /api/v1/videos/{id} -> { formatStreams[] }. */
export async function extractInvidious(videoId: string): Promise<Media | null> {
  for (const base of await invidiousApiInstances()) {
    const json = await getJson(`${base}/api/v1/videos/${videoId}`);
    if (!json) continue;
    const withAudio = (json.formatStreams ?? []).filter(
      (f: any) => f.url && String(f.type ?? '').includes('mp4'),
    );
    const best = withAudio.sort(
      (a: any, b: any) => qualityNumber(b.qualityLabel) - qualityNumber(a.qualityLabel),
    )[0];
    if (best) return { url: best.url, kind: 'file' };
  }
  return null;
}

/** Consumet: the YouTube provider used /streams/{id} and /youtube/watch?v=. */
export async function extractConsumet(videoId: string): Promise<Media | null> {
  for (const base of CONSUMET_INSTANCES) {
    const json =
      (await getJson(`${base}/streams/youtube?id=${videoId}`)) ??
      (await getJson(`${base}/youtube/streams/${videoId}`)) ??
      (await getJson(`${base}/youtube/watch?v=${videoId}`));
    if (!json) continue;
    const url = json.hls ?? json.url ?? json.formats?.[0]?.url;
    if (url) return { url, kind: kindOf(url) };
  }
  return null;
}

const INSTANCE_TTL_MS = 6 * 60 * 60 * 1000;
let invidiousInstances: { at: number; hosts: string[] } | null = null;

/** Instances that expose the public API, refreshed from the instance list. */
export async function invidiousApiInstances(): Promise<string[]> {
  if (invidiousInstances && Date.now() - invidiousInstances.at < INSTANCE_TTL_MS) {
    return invidiousInstances.hosts;
  }
  let hosts: string[] = [];
  try {
    const res = await fetch('https://api.invidious.io/instances.json', {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const list = await res.json();
      hosts = list
        .filter(([, meta]: [string, any]) => meta?.api && !meta?.monitor?.down)
        .map(([, meta]: [string, any]) => meta.uri)
        .slice(0, 5);
    }
  } catch {
    hosts = [];
  }
  invidiousInstances = { at: Date.now(), hosts };
  return hosts;
}

const EMBED_INSTANCE_TTL_MS = 6 * 60 * 60 * 1000;
let invidiousEmbedHosts: { at: number; hosts: string[] } | null = null;

/** Any working Invidious instance can serve the /embed/ player. */
export async function invidiousEmbedInstances(): Promise<string[]> {
  if (invidiousEmbedHosts && Date.now() - invidiousEmbedHosts.at < EMBED_INSTANCE_TTL_MS) {
    return invidiousEmbedHosts.hosts;
  }
  let hosts: string[] = [];
  try {
    const res = await fetch('https://api.invidious.io/instances.json', {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const list = await res.json();
      hosts = list
        .filter(([, meta]: [string, any]) => meta?.type === 'https' && !meta?.monitor?.down)
        .map(([, meta]: [string, any]) => meta.uri)
        // Onion addresses are unreachable from a normal connection.
        .filter((uri: string) => !uri.includes('.ygg'))
        .slice(0, 3);
    }
  } catch {
    hosts = [];
  }
  invidiousEmbedHosts = { at: Date.now(), hosts };
  return hosts;
}
