// Torrents for a film come from Torrentio, a public Stremio addon. It needs no
// key and answers with an info hash per release, which is enough to build a
// magnet link and hand the download to TorBox.
import { isAdultTitle } from '../data/safe';
import { isCoolingDown, markFailed, markWorked } from './sourceHealth';

const TORRENTIO = 'https://torrentio.strem.fun';
const CACHE_MS = 60 * 60 * 1000;

export type TorrentOption = {
  hash: string;
  /** The release's own name, e.g. "Manjummel.Boys.2024.1080p.WEBRip.mp4". */
  name: string;
  quality: string;
  size?: string;
  seeders?: number;
  tracker?: string;
  magnet: string;
};

// Public trackers, so the magnet still finds peers when the indexer's own
// trackers are unreachable.
const TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://explodie.org:6969/announce',
  'udp://tracker.openbittorrent.com:80/announce',
  'udp://exodus.desync.com:6969/announce',
];

export function magnetFor(hash: string, name?: string): string {
  const trackers = TRACKERS.map((t) => `tr=${encodeURIComponent(t)}`).join('&');
  const dn = name ? `&dn=${encodeURIComponent(name)}` : '';
  return `magnet:?xt=urn:btih:${hash}${dn}&${trackers}`;
}

type Stream = {
  title?: string;
  infoHash?: string;
  fileIdx?: number;
  behaviorHints?: { filename?: string };
};

// Torrentio writes the seeders, the size and the tracker into the title.
function parseTitle(title: string) {
  const seeders = title.match(/👤\s*(\d+)/)?.[1];
  const size = title.match(/💾\s*([\d.]+\s*[KMGT]B)/i)?.[1]?.replace(/\s+/g, '');
  const tracker = title.match(/⚙️\s*([^\n\d]+)$/)?.[1]?.trim();
  const quality = title.match(/\b(2160p|1080p|720p|480p|360p|4K|UHD|FHD|HD|SD)\b/i)?.[1] ?? '';
  return {
    seeders: seeders ? Number(seeders) : undefined,
    size,
    tracker,
    quality: quality.toUpperCase(),
  };
}

const cache = new Map<string, { at: number; options: TorrentOption[] }>();

/** Every release the indexer has for a film, best seeded first. */
export async function findTorrents(imdbId: string): Promise<TorrentOption[]> {
  const hit = cache.get(imdbId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.options;

  let streams: Stream[] = [];
  try {
    const res = await fetch(`${TORRENTIO}/stream/movie/${imdbId}.json`, {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const body = await res.json();
      streams = body?.streams ?? [];
    }
  } catch {
    streams = [];
  }

  const options: TorrentOption[] = [];
  for (const s of streams) {
    if (!s.infoHash) continue;
    const title = s.title ?? '';
    const parsed = parseTitle(title);
    const name = s.behaviorHints?.filename ?? title.split('\n')[0] ?? '';
    options.push({
      hash: s.infoHash,
      name,
      quality: parsed.quality,
      size: parsed.size,
      seeders: parsed.seeders,
      tracker: parsed.tracker,
      magnet: magnetFor(s.infoHash, name),
    });
  }

  // More seeds first, then the larger release: both mean a quicker download.
  options.sort((a, b) => (b.seeders ?? 0) - (a.seeders ?? 0));
  cache.set(imdbId, { at: Date.now(), options });
  return options;
}

// --- Searching for a release by name -------------------------------------
//
// The film lookup above only knows about films an indexer has linked to an
// IMDb id, which leaves a lot out. These two search by the name of the
// release itself, so anything with a torrent can be found.

const APIBAY = 'https://apibay.org/q.php';
const NYAA = 'https://nyaa.si/';
// The indexers check who is asking, and turn away anything that doesn't look
// like a browser.
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
// Only the video categories, so a search never turns up anything else.
const VIDEO_CATEGORIES = [
  201, 202, 205, 206, 207, 208, 209, 210, 211, 212, 214, 215, 216, 220, 221, 222, 223, 224,
  225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239,
].join(',');

function qualityOf(name: string): string {
  const match = name.match(/\b(2160p|1440p|1080p|720p|480p|360p|4k|uhd)\b/i)?.[1];
  return match ? match.toUpperCase() : '';
}

function formatBytes(bytes: number): string {
  if (!bytes) return '';
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / 1e6))} MB`;
}

// The indexers rate-limit bursts, so one that turns away a search is left
// alone for a little while rather than for the usual half hour.
const SEARCH_COOLDOWN_MS = 2 * 60 * 1000;

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** Releases from The Pirate Bay's open index. */
export async function searchApibay(query: string): Promise<TorrentOption[]> {
  if (isCoolingDown('apibay', SEARCH_COOLDOWN_MS)) return [];
  const url = `${APIBAY}?q=${encodeURIComponent(query)}&cat=${VIDEO_CATEGORIES}&sort=seeders`;
  let body: any = null;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' } });
    if (res.ok) body = await res.json();
  } catch {
    body = null;
  }
  if (!Array.isArray(body)) {
    markFailed('apibay', SEARCH_COOLDOWN_MS);
    return [];
  }
  markWorked('apibay');

  const options: TorrentOption[] = [];
  for (const item of body) {
    const name = String(item?.name ?? '');
    const hash = String(item?.info_hash ?? '');
    // A release for an adult film is not offered.
    if (isAdultTitle(name)) continue;
    // The index answers with a placeholder row when nothing matches.
    if (!name || !hash || name.toLowerCase() === 'no results returned') continue;
    const seeders = Number(item?.seeders ?? 0);
    if (seeders < 1) continue;
    options.push({
      hash,
      name,
      quality: qualityOf(name),
      size: formatBytes(Number(item?.size ?? 0)),
      seeders,
      tracker: 'ThePirateBay',
      magnet: magnetFor(hash, name),
    });
  }
  return options;
}

/** Releases from Nyaa, which is where anime lives. It answers with RSS. */
export async function searchNyaa(query: string): Promise<TorrentOption[]> {
  if (isCoolingDown('nyaa', SEARCH_COOLDOWN_MS)) return [];
  const url = `${NYAA}?page=rss&c=0_0&q=${encodeURIComponent(query)}`;
  let xml = '';
  try {
    const res = await fetch(url, { headers: { 'User-Agent': BROWSER_UA, Accept: 'application/rss+xml' } });
    if (res.ok) xml = await res.text();
  } catch {
    xml = '';
  }
  if (!xml.includes('<item>')) {
    markFailed('nyaa', SEARCH_COOLDOWN_MS);
    return [];
  }
  markWorked('nyaa');

  const options: TorrentOption[] = [];
  for (const item of xml.split('<item>').slice(1)) {
    const title = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1];
    const hash = item.match(/<nyaa:infoHash>([\w]+)<\/nyaa:infoHash>/)?.[1];
    if (!title || !hash) continue;
    const seeders = Number(item.match(/<nyaa:seeders>(\d+)<\/nyaa:seeders>/)?.[1] ?? 0);
    if (seeders < 1) continue;
    const size = item.match(/<nyaa:size>([^<]+)<\/nyaa:size>/)?.[1]?.trim();
    const category = item.match(/<nyaa:category>([^<]+)<\/nyaa:category>/)?.[1];
    const name = decodeEntities(title).trim();
    // A release for an adult film is not offered.
    if (isAdultTitle(name)) continue;
    options.push({
      hash,
      name,
      quality: qualityOf(name),
      size,
      seeders,
      tracker: category ? `Nyaa · ${decodeEntities(category)}` : 'Nyaa',
      magnet: magnetFor(hash, name),
    });
  }
  return options;
}

/**
 * Every release the indexes know about for a name, best seeded first and
 * without repeats. Both indexes are optional: one being down only means
 * fewer results.
 */
// The words that say nothing about which film a release is.
const RELEASE_FILLER = new Set([
  'the', 'and', 'for', 'with', 'from', 'part', 'chapter', 'season', 'series',
  'episode', 'movie', 'film', 'full', 'hindi', 'dubbed', 'dual', 'audio',
  '1080p', '720p', '480p', '2160p', 'webrip', 'webdl', 'bluray', 'hdrip',
]);

// "K.G.F" is one word written with dots.
function joinAcronyms(text: string): string {
  return text.replace(/\b[a-z0-9](?:\.[a-z0-9])+\b/gi, (name) => name.replace(/\./g, ''));
}

// The name as the indexes like it: "K.G.F: Chapter 1" -> "KGF Chapter 1".
// The punctuation of a title makes some of them answer with anything at all.
function indexQuery(query: string): string {
  const cleaned = joinAcronyms(query)
    .replace(/[^A-Za-z0-9\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length >= 2 ? cleaned : query.trim();
}

// The words a release must name to be the film that was asked for. The index
// matches loosely — "K.G.F Chapter 1" brings back John Wick — so a release
// that does not carry the film's name at all is dropped. Dots, spaces and
// dashes are ignored on both sides, because "K.G.F" and "KGF" are one word.
function filmWords(query: string): string[] {
  const joined = joinAcronyms(query);
  return joined
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !/^\d+$/.test(word) && !RELEASE_FILLER.has(word));
}

function namesFilm(name: string, words: string[]): boolean {
  if (words.length === 0) return true;
  const flat = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return words.some((word) => flat.includes(word));
}

export async function searchTorrents(query: string): Promise<TorrentOption[]> {
  const words = filmWords(query);
  const name = indexQuery(query);
  let options = await runIndexes(name);
  if (options.length < 3) {
    // Names like "the office s1" match nothing, because the indexes look for
    // the whole phrase. The name without the season and quality words does.
    const shorter = simplifyQuery(name);
    if (shorter && shorter !== name) {
      const extra = await runIndexes(shorter);
      const seen = new Set(options.map((o) => o.hash.toLowerCase()));
      for (const option of extra) {
        const key = option.hash.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        options.push(option);
      }
      options.sort((a, b) => (b.seeders ?? 0) - (a.seeders ?? 0));
    }
  }
  // A long name finds nothing where its first words find plenty, so those are
  // tried before the film is called unavailable.
  if (options.length === 0 && words.length > 0) {
    const short = words.slice(0, 2).join(' ');
    if (short.toLowerCase() !== name.toLowerCase()) options = await runIndexes(short);
  }
  // A release that does not name the film is not the film.
  if (words.length > 0) options = options.filter((option) => namesFilm(option.name, words));
  return options;
}

async function runIndexes(query: string): Promise<TorrentOption[]> {
  const [apibay, nyaa] = await Promise.all([searchApibay(query), searchNyaa(query)]);
  const seen = new Set<string>();
  const options: TorrentOption[] = [];
  for (const option of [...apibay, ...nyaa]) {
    const key = option.hash.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    options.push(option);
  }
  options.sort((a, b) => (b.seeders ?? 0) - (a.seeders ?? 0));
  return options;
}

/** Drops the season, episode and quality words from a name. */
export function simplifyQuery(query: string): string {
  return query
    .replace(/\b(season|seasons)\s*\d{1,2}\b/gi, ' ')
    .replace(/\bs\d{1,3}\b/gi, ' ')
    .replace(/\b(ep|episode|e)\d{1,3}\b/gi, ' ')
    .replace(
      /\b(2160p|1440p|1080p|720p|480p|360p|4k|uhd|bluray|blu\s?ray|web\s?dl|webrip|webrip|hdrip|dvdrip|hd|hevc|x26[45]|english|malayalam|tamil|hindi)\b/gi,
      ' ',
    )
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
