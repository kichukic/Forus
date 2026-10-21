// Finds a title's artwork from its file name, using Cinemeta (Stremio's free,
// keyless metadata service backed by IMDb data).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchWithTimeout } from './http';

const CINEMETA = 'https://v3-cinemeta.strem.io/catalog';
const CACHE_KEY = 'artwork-cache';
const MAX_CACHED = 300;

export type Artwork = {
  title: string;
  year?: string;
  image: string; // 16:9 backdrop when there is one, else the poster
};

export type ParsedName = {
  title: string;
  year?: string;
  isSeries: boolean;
};

// Everything from the first of these onwards is release info, not the title.
const RELEASE_TAG =
  /\b(2160p|1080p|720p|576p|480p|4k|uhd|hdr|web[- ]?dl|web[- ]?rip|webrip|hdrip|bluray|blu[- ]?ray|brrip|bdrip|dvdrip|dvdscr|hdtv|hdcam|camrip|predvd|x264|x265|h ?264|h ?265|hevc|avc|aac|ac3|dd ?5 ?1|ddp|atmos|10bit|esub|esubs|uncut|proper|repack|extended|remastered|malayalam|tamil|telugu|hindi|kannada|multi|dual audio)\b/i;

export function parseFileName(fileName: string): ParsedName {
  let s = fileName
    .replace(/\.[a-z0-9]{2,4}$/i, '') // extension
    .replace(/^\s*(www\.)?[\w-]+\.(com|org|net|in|me|to|lol|cc|ws|pw|tv)\s*[-–]?\s*/i, '') // leading site tag
    .replace(/[._]+/g, ' ')
    .replace(/[[\](){}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const episode = s.match(/\bS\d{1,2}\s?E\d{1,3}\b|\bS\d{1,2}\b|\bSeason \d+/i);
  // A year can also be the whole title ("2018"), so ignore one at the very start.
  const years = [...s.matchAll(/\b(19[3-9]\d|20[0-4]\d)\b/g)].filter((m) => m.index! > 0);
  const year = years[0];
  const tag = s.match(RELEASE_TAG);

  const cut = Math.min(
    episode?.index ?? Infinity,
    year?.index ?? Infinity,
    tag?.index ?? Infinity,
    s.length,
  );
  s = s.slice(0, cut).replace(/[\s-–]+$/, '').trim();

  return { title: s || fileName, year: year?.[1], isSeries: !!episode };
}

type Meta = { name: string; releaseInfo?: string; poster?: string; background?: string };

async function search(type: 'movie' | 'series', title: string): Promise<Meta[]> {
  const res = await fetchWithTimeout(`${CINEMETA}/${type}/top/search=${encodeURIComponent(title)}.json`);
  if (!res.ok) return [];
  const body = await res.json().catch(() => null);
  return body?.metas ?? [];
}

function pick(metas: Meta[], parsed: ParsedName): Meta | undefined {
  const name = parsed.title.toLowerCase();
  const sameName = (m: Meta) => m.name.toLowerCase() === name;
  const sameYear = (m: Meta) => !!parsed.year && !!m.releaseInfo?.startsWith(parsed.year);
  return (
    metas.find((m) => sameName(m) && sameYear(m)) ??
    metas.find(sameYear) ??
    metas.find(sameName) ??
    metas[0]
  );
}

// Every card asks at once when a row appears, so they share one load of the cache.
let cache: Promise<Record<string, Artwork | null>> | null = null;

function loadCache(): Promise<Record<string, Artwork | null>> {
  cache ??= AsyncStorage.getItem(CACHE_KEY)
    .then((raw) => JSON.parse(raw ?? '{}'))
    .catch(() => ({}));
  return cache;
}

export async function findArtwork(fileName: string): Promise<Artwork | null> {
  const parsed = parseFileName(fileName);
  const key = `${parsed.title.toLowerCase()}|${parsed.year ?? ''}|${parsed.isSeries}`;
  const known = await loadCache();
  if (key in known) return known[key];

  const types: ('movie' | 'series')[] = parsed.isSeries ? ['series', 'movie'] : ['movie', 'series'];
  let art: Artwork | null = null;
  for (const type of types) {
    const meta = pick(await search(type, parsed.title).catch(() => []), parsed);
    const image = meta?.background || meta?.poster;
    if (meta && image) {
      art = { title: meta.name, year: meta.releaseInfo, image };
      break;
    }
  }

  known[key] = art;
  // Keep only the most recent lookups, so the saved cache can't grow for ever.
  const keys = Object.keys(known);
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_CACHED))) delete known[old];
  AsyncStorage.setItem(CACHE_KEY, JSON.stringify(known)).catch(() => {});
  return art;
}
