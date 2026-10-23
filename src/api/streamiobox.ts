// StreamioBox: a Stremio-style catalog browser.
import { isAdultTitle } from '../data/safe';

export type StreamioType = 'movie' | 'series';

export type StreamioItem = {
  id: string;
  type: StreamioType;
  title: string;
  year?: string;
  poster?: string;
  background?: string;
  genres?: string[];
  description?: string;
  runtime?: string;
};

const CINEMETA = 'https://v3-cinemeta.strem.io';
const CATALOG_HOST = 'https://cinemeta-catalogs.strem.io/top/catalog';

type Meta = {
  id?: string;
  imdb_id?: string;
  name?: string;
  year?: string;
  releaseInfo?: string;
  poster?: string;
  background?: string;
  genres?: string[];
  genre?: string[];
  description?: string;
  runtime?: string;
  videos?: { id?: string; name?: string; season?: number; episode?: number; released?: string; overview?: string; thumbnail?: string }[];
};

// Metahub serves every poster in three sizes. The real Stremio app requests
// the medium one for catalog grids and only pulls the large art on detail
// screens — large posters are several times heavier and stall slow networks,
// which is what left rows of blank cards on fast scroll.
function posterAt(url: string | undefined, size: 'large' | 'medium'): string | undefined {
  if (!url) return undefined;
  return url.replace(/\/poster\/(small|medium|large)\//, `/poster/${size}/`);
}

function parseMeta(m: Meta, type: StreamioType, posterSize: 'large' | 'medium' = 'medium'): StreamioItem | null {
  const id = m.imdb_id || m.id;
  if (!id || !m.name) return null;
  if (isAdultTitle(m.name)) return null;
  return {
    id,
    type,
    title: m.name,
    year: m.year ?? m.releaseInfo,
    poster: posterAt(m.poster, posterSize),
    background: m.background,
    genres: m.genres ?? m.genre,
    description: m.description,
    runtime: m.runtime,
  };
}

function parseList(metas: Meta[] | undefined, type: StreamioType): StreamioItem[] {
  return (metas ?? []).map((m) => parseMeta(m, type)).filter((m): m is StreamioItem => m !== null);
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

export const CATALOGS = [
  { id: 'top', name: 'Popular' },
  { id: 'imdbRating', name: 'Featured' },
  { id: 'year', name: 'New' },
];

export const GENRES = [
  'Action', 'Adventure', 'Animation', 'Biography', 'Comedy', 'Crime',
  'Documentary', 'Drama', 'Family', 'Fantasy', 'History', 'Horror',
  'Mystery', 'Romance', 'Sci-Fi', 'Sport', 'Thriller', 'War', 'Western',
];

export async function loadCatalogPage(
  type: StreamioType,
  catalogId: string,
  skip: number,
  genre?: string,
): Promise<StreamioItem[]> {
  const extras: string[] = [];
  if (genre) extras.push(`genre=${encodeURIComponent(genre)}`);
  if (skip > 0) extras.push(`skip=${skip}`);
  const extraPath = extras.length ? '/' + extras.join('&') : '';
  const url = `${CATALOG_HOST}/${type}/${catalogId}${extraPath}.json`;
  const body = await fetchJson(url);
  return parseList(body?.metas, type);
}

export async function searchStreamio(type: StreamioType, query: string): Promise<StreamioItem[]> {
  const body = await fetchJson(
    `${CINEMETA}/catalog/${type}/top/search=${encodeURIComponent(query.trim())}.json`,
  );
  return parseList(body?.metas, type);
}

export async function loadMeta(type: StreamioType, id: string): Promise<{ item: StreamioItem; videos: Meta['videos'] } | null> {
  const body = await fetchJson(`${CINEMETA}/meta/${type}/${id}.json`);
  const m = body?.meta as Meta | undefined;
  if (!m) return null;
  // Detail screen: the large art looks right on a hero header.
  const item = parseMeta(m, type, 'large');
  if (!item) return null;
  return { item, videos: m.videos };
}
