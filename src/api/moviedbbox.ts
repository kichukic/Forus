// MovieDbBox: movie and TV show discovery and stream resolution powered by TMDB
// and multi-provider web/CDN stream extractors.
//
// TMDB is the primary source, but on some networks api.themoviedb.org resolves
// to a dead address, so nothing loads at all. When that happens the same lists
// come from Cinemeta, Stremio's free metadata service, which carries the IMDb
// ids the player needs anyway.
import { fetchWithTimeout } from './http';
import { getCached, setCached } from './cache';

const TMDB_KEY = '5b458cad0b474d21129c717626038657';
const TMDB = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';
const CINEMETA = 'https://v3-cinemeta.strem.io';
const CINEMETA_CATALOG = 'https://cinemeta-catalogs.strem.io/top/catalog';

// A blocked host must not be waited on for long; the Cinemeta copy takes over.
const TMDB_TIMEOUT_MS = 6000;
const CINEMETA_TIMEOUT_MS = 9000;

export type MovieDbType = 'movie' | 'tv';

export type MovieDbItem = {
  /** TMDB's numeric id. Zero when the item came from Cinemeta. */
  id: number;
  /** The IMDb id, when the source already had it. Cinemeta always does. */
  imdbId?: string;
  mediaType: MovieDbType;
  title: string;
  year?: string;
  poster?: string;
  backdrop?: string;
  rating?: string;
  overview?: string;
  genres?: string[];
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

type CinemetaMeta = {
  imdb_id?: string;
  id?: string;
  name?: string;
  year?: string;
  releaseInfo?: string;
  poster?: string;
  background?: string;
  genres?: string[];
  genre?: string[];
  description?: string;
  imdbRating?: number;
  runtime?: string;
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

// Cinemeta's posters are small; the grid wants the large copy of the same file.
function biggerPoster(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url.replace('/poster/small/', '/poster/large/');
}

function fromCinemeta(m: CinemetaMeta, type: MovieDbType): MovieDbItem | null {
  const imdbId = m.imdb_id || m.id;
  if (!imdbId || !m.name) return null;
  if (/\bcam\b/i.test(m.name)) return null;
  return {
    id: 0,
    imdbId,
    mediaType: type,
    title: m.name,
    year: m.year ?? m.releaseInfo,
    poster: biggerPoster(m.poster),
    backdrop: m.background,
    rating: m.imdbRating != null ? Number(m.imdbRating).toFixed(1) : undefined,
    overview: m.description,
    genres: m.genres ?? m.genre,
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

// Cinemeta calls a series a "series"; TMDB calls it a "tv".
function cinemetaType(type: MovieDbType) {
  return type === 'tv' ? 'series' : 'movie';
}

/** Cinemeta's browsable list, which stands in for TMDB's trending pages. */
async function cinemetaCatalog(type: MovieDbType, page: number): Promise<MovieDbItem[]> {
  const skip = Math.max(0, (page - 1) * 50);
  const extra = skip > 0 ? `/skip=${skip}` : '';
  const body = await getJson(`${CINEMETA_CATALOG}/${cinemetaType(type)}/top${extra}.json`, CINEMETA_TIMEOUT_MS);
  return (body?.metas ?? [])
    .map((m: CinemetaMeta) => fromCinemeta(m, type))
    .filter((x: MovieDbItem | null): x is MovieDbItem => x !== null);
}

async function cinemetaSearch(query: string): Promise<MovieDbItem[]> {
  const q = encodeURIComponent(query.trim());
  const [movies, series] = await Promise.all([
    getJson(`${CINEMETA}/catalog/movie/top/search=${q}.json`, CINEMETA_TIMEOUT_MS),
    getJson(`${CINEMETA}/catalog/series/top/search=${q}.json`, CINEMETA_TIMEOUT_MS),
  ]);
  const from = (body: any, type: MovieDbType) =>
    ((body?.metas ?? []) as CinemetaMeta[])
      .map((m) => fromCinemeta(m, type))
      .filter((x): x is MovieDbItem => x !== null);
  return [...from(movies, 'movie'), ...from(series, 'tv')];
}

/** Cinemeta's own details, for a title whose IMDb id is already known. */
async function cinemetaDetails(item: MovieDbItem, cacheKey: string): Promise<MovieDbDetails> {
  const body = await getJson(
    `${CINEMETA}/meta/${cinemetaType(item.mediaType)}/${item.imdbId}.json`,
    CINEMETA_TIMEOUT_MS,
  );
  const m = body?.meta as CinemetaMeta | undefined;
  const result: MovieDbDetails = {
    imdbId: item.imdbId,
    genres: m?.genres ?? m?.genre ?? item.genres,
    overview: m?.description ?? item.overview,
  };
  const runtime = Number(m?.runtime);
  if (Number.isFinite(runtime) && runtime > 0) result.runtime = runtime;
  await setCached(cacheKey, result, 30 * 60 * 1000);
  return result;
}

export async function fetchMovieDbTrending(type: MovieDbType, page = 1): Promise<MovieDbItem[]> {
  const key = `moviedb:trending:${type}:${page}`;
  const cached = await getCached<MovieDbItem[]>(key);
  if (cached && cached.length > 0) return cached;

  let result: MovieDbItem[] = [];
  const body = await getJson(`${TMDB}/trending/${type}/week?api_key=${TMDB_KEY}&page=${page}`, TMDB_TIMEOUT_MS);
  if (body) {
    result = ((body?.results ?? []) as Raw[])
      .map((r) => toRaw(r, type))
      .filter((x): x is MovieDbItem => x !== null);
  }
  // TMDB unreachable: Cinemeta's popular list is the same kind of thing.
  if (result.length === 0) result = await cinemetaCatalog(type, page);
  // An empty answer is not worth remembering; the next open tries again.
  if (result.length > 0) await setCached(key, result, 10 * 60 * 1000);
  return result;
}

export async function fetchMovieDbNowPlaying(page = 1): Promise<MovieDbItem[]> {
  const key = `moviedb:now_playing:${page}`;
  const cached = await getCached<MovieDbItem[]>(key);
  if (cached && cached.length > 0) return cached;

  let result: MovieDbItem[] = [];
  const body = await getJson(`${TMDB}/movie/now_playing?api_key=${TMDB_KEY}&page=${page}`, TMDB_TIMEOUT_MS);
  if (body) {
    result = ((body?.results ?? []) as Raw[])
      .map((r) => toRaw({ ...r, media_type: 'movie' }, 'movie'))
      .filter((x): x is MovieDbItem => x !== null);
  }
  if (result.length === 0) result = await cinemetaCatalog('movie', page);
  if (result.length > 0) await setCached(key, result, 10 * 60 * 1000);
  return result;
}

export async function fetchMovieDbSearch(query: string, page = 1): Promise<MovieDbItem[]> {
  const key = `moviedb:search:${query.trim().toLowerCase()}:${page}`;
  const cached = await getCached<MovieDbItem[]>(key);
  if (cached && cached.length > 0) return cached;

  let result: MovieDbItem[] = [];
  const body = await getJson(
    `${TMDB}/search/multi?api_key=${TMDB_KEY}&query=${encodeURIComponent(query.trim())}&page=${page}`,
    TMDB_TIMEOUT_MS,
  );
  if (body) {
    result = ((body?.results ?? []) as Raw[])
      .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
      .map((r) => toRaw(r))
      .filter((x): x is MovieDbItem => x !== null);
  }
  // Cinemeta's search has no pages; asking again returns the same first page,
  // which the caller's duplicate check treats as the end of the list.
  if (result.length === 0 && page === 1) result = await cinemetaSearch(query);
  if (result.length > 0) await setCached(key, result, 5 * 60 * 1000);
  return result;
}

/** Resolves detailed metadata, IMDb identifier, and runtime needed for stream resolution. */
export async function fetchMovieDbDetails(item: MovieDbItem): Promise<MovieDbDetails | null> {
  const key = `moviedb:details:${item.mediaType}:${item.id}:${item.imdbId ?? ''}`;
  const cached = await getCached<MovieDbDetails>(key);
  if (cached) return cached;

  // A Cinemeta item already carries its IMDb id; TMDB would only be a detour.
  if (item.imdbId && item.id === 0) return await cinemetaDetails(item, key);

  const endpoint = item.mediaType === 'tv' ? 'tv' : 'movie';
  const body = await getJson(
    `${TMDB}/${endpoint}/${item.id}?api_key=${TMDB_KEY}&append_to_response=external_ids`,
    TMDB_TIMEOUT_MS,
  );
  if (body) {
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

  // TMDB is unreachable; Cinemeta's meta has the same fields.
  if (item.imdbId) return await cinemetaDetails(item, key);
  return null;
}
