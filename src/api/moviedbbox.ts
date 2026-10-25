// MovieDbBox: Movie and TV show discovery and stream resolution powered by TMDB
// and multi-provider web/CDN stream extractors.
import { fetchWithTimeout } from './http';
import { getCached, setCached } from './cache';

const TMDB_KEY = '5b458cad0b474d21129c717626038657';
const TMDB = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';

export type MovieDbType = 'movie' | 'tv';

export type MovieDbItem = {
  id: number;
  mediaType: MovieDbType;
  title: string;
  year?: string;
  poster?: string;
  backdrop?: string;
  rating?: string;
  overview?: string;
};

export type MovieDbDetails = {
  imdbId?: string;
  genres?: string[];
  runtime?: number;
  overview?: string;
  tagline?: string;
  voteAverage?: number;
};

type Raw = {
  id?: number;
  media_type?: string;
  title?: string;
  name?: string;
  poster_path?: string;
  backdrop_path?: string;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  overview?: string;
};

function toRaw(r: Raw, defaultType?: MovieDbType): MovieDbItem | null {
  const type: MovieDbType =
    r.media_type === 'tv' || (!r.media_type && (defaultType === 'tv' || (!!r.first_air_date && !r.release_date)))
      ? 'tv'
      : 'movie';
  const title = r.title || r.name;
  if (!r.id || !title) return null;
  // Skip cam rips.
  if (/\bcam\b/i.test(title)) return null;
  const date = r.release_date || r.first_air_date;
  return {
    id: r.id,
    mediaType: type,
    title,
    year: date ? String(date).slice(0, 4) : undefined,
    poster: r.poster_path ? `${IMG}/w500${r.poster_path}` : undefined,
    backdrop: r.backdrop_path ? `${IMG}/w1280${r.backdrop_path}` : undefined,
    rating: r.vote_average ? r.vote_average.toFixed(1) : undefined,
    overview: r.overview,
  };
}

async function getJson(url: string, timeoutMs = 8000): Promise<any | null> {
  try {
    const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, timeoutMs);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchMovieDbTrending(type: MovieDbType, page = 1): Promise<MovieDbItem[]> {
  const key = `moviedb:trending:${type}:${page}`;
  const cached = await getCached<MovieDbItem[]>(key);
  if (cached) return cached;
  const body = await getJson(`${TMDB}/trending/${type}/week?api_key=${TMDB_KEY}&page=${page}`);
  const list = (body?.results ?? []) as Raw[];
  const result = list
    .map((r) => toRaw(r, type))
    .filter((x): x is MovieDbItem => x !== null);
  await setCached(key, result, 10 * 60 * 1000);
  return result;
}

export async function fetchMovieDbNowPlaying(page = 1): Promise<MovieDbItem[]> {
  const key = `moviedb:now_playing:${page}`;
  const cached = await getCached<MovieDbItem[]>(key);
  if (cached) return cached;
  const body = await getJson(`${TMDB}/movie/now_playing?api_key=${TMDB_KEY}&page=${page}`);
  const list = (body?.results ?? []) as Raw[];
  const result = list
    .map((r) => toRaw({ ...r, media_type: 'movie' }, 'movie'))
    .filter((x): x is MovieDbItem => x !== null);
  await setCached(key, result, 10 * 60 * 1000);
  return result;
}

export async function fetchMovieDbSearch(query: string, page = 1): Promise<MovieDbItem[]> {
  const key = `moviedb:search:${query.trim().toLowerCase()}:${page}`;
  const cached = await getCached<MovieDbItem[]>(key);
  if (cached) return cached;
  const body = await getJson(
    `${TMDB}/search/multi?api_key=${TMDB_KEY}&query=${encodeURIComponent(query.trim())}&page=${page}`,
  );
  const list = (body?.results ?? []) as Raw[];
  const result = list
    .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
    .map((r) => toRaw(r))
    .filter((x): x is MovieDbItem => x !== null);
  await setCached(key, result, 5 * 60 * 1000);
  return result;
}

/** Resolves detailed metadata, IMDb identifier, and runtime needed for stream resolution. */
export async function fetchMovieDbDetails(item: MovieDbItem): Promise<MovieDbDetails | null> {
  const key = `moviedb:details:${item.mediaType}:${item.id}`;
  const cached = await getCached<MovieDbDetails>(key);
  if (cached) return cached;
  const endpoint = item.mediaType === 'tv' ? 'tv' : 'movie';
  const body = await getJson(
    `${TMDB}/${endpoint}/${item.id}?api_key=${TMDB_KEY}&append_to_response=external_ids`,
    7000,
  );
  if (!body) return null;
  const imdbId = body.imdb_id || body.external_ids?.imdb_id;
  const genres = Array.isArray(body.genres) ? body.genres.map((g: any) => g.name) : undefined;
  const runtime =
    body.runtime || (Array.isArray(body.episode_run_time) ? body.episode_run_time[0] : undefined);
  const result = {
    imdbId: imdbId || undefined,
    genres,
    runtime,
    overview: body.overview || item.overview,
    tagline: body.tagline || undefined,
    voteAverage: body.vote_average || undefined,
  };
  await setCached(key, result, 30 * 60 * 1000);
  return result;
}
