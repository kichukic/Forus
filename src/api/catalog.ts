// The movie catalog comes from Cinemeta, Stremio's free metadata service. It
// needs no key and no account, and every film it lists has an IMDb id, which
// is all that is needed to look the film up on a torrent index.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAdultTitle } from '../data/safe';

const CINEMETA = 'https://v3-cinemeta.strem.io/catalog';
// The browsable catalog lives behind this host, which is also the one that
// understands the "skip" extra, so the list can go on for as long as you scroll.
const CATALOG = 'https://cinemeta-catalogs.strem.io/top/catalog';
const CACHE_KEY = 'catalog-cache';
const CACHE_MS = 6 * 60 * 60 * 1000;

export type CatalogMovie = {
  /** The IMDb id, e.g. tt26458038. */
  id: string;
  title: string;
  year?: string;
  poster?: string;
  background?: string;
  genres?: string[];
  description?: string;
  runtime?: string;
};

type Meta = {
  id?: string;
  name?: string;
  year?: string;
  releaseInfo?: string;
  poster?: string;
  background?: string;
  genres?: string[];
  genre?: string[];
  description?: string;
  runtime?: string;
};

// The posters Cinemeta gives are small; this is the same picture, bigger.
function biggerPoster(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url.replace('/poster/small/', '/poster/large/');
}

function parse(metas: Meta[] | undefined): CatalogMovie[] {
  return (metas ?? [])
    .filter((m) => m?.id && m?.name)
    // Films for adults are not shown.
    .filter((m) => !isAdultTitle(m.name as string))
    .map((m) => ({
      id: m.id as string,
      title: m.name as string,
      year: m.year ?? m.releaseInfo,
      poster: biggerPoster(m.poster),
      background: m.background,
      genres: m.genres ?? m.genre,
      description: m.description,
      runtime: m.runtime,
    }));
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

let memory: { at: number; movies: CatalogMovie[] } | null = null;
const pages = new Map<number, CatalogMovie[]>();

/** One page of the browsable catalog. `skip` is how many films to pass over. */
export async function loadCatalogPage(skip: number): Promise<CatalogMovie[]> {
  const cached = pages.get(skip);
  if (cached) return cached;

  const body = await fetchJson(`${CATALOG}/movie/top/skip=${skip}.json`);
  const movies = parse(body?.metas);
  if (movies.length > 0) pages.set(skip, movies);
  return movies;
}

/** The popular films, kept for a few hours so the grid opens straight away. */
export async function loadCatalog(): Promise<CatalogMovie[]> {
  if (memory && Date.now() - memory.at < CACHE_MS) return memory.movies;

  // The first page comes from the same place as the rest, so the counts line
  // up when the next page is asked for.
  const movies = await loadCatalogPage(0);

  if (movies.length === 0) {
    // The saved copy is better than nothing when the service is unreachable.
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      const saved = raw ? JSON.parse(raw) : null;
      if (saved?.movies) return saved.movies as CatalogMovie[];
    } catch {
      // Nothing saved yet.
    }
    return [];
  }

  memory = { at: Date.now(), movies };
  AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ at: memory.at, movies })).catch(() => {});
  return movies;
}

/** Pull-to-refresh: the next loadCatalog call goes back to Cinemeta. */
export function clearCatalogCache() {
  memory = null;
  pages.clear();
  AsyncStorage.removeItem(CACHE_KEY).catch(() => {});
}

/** Films matching what someone typed. */
export async function searchCatalog(query: string): Promise<CatalogMovie[]> {
  const body = await fetchJson(
    `${CINEMETA}/movie/top/search=${encodeURIComponent(query.trim())}.json`,
  );
  return parse(body?.metas);
}
