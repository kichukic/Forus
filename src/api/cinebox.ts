// Cinebox: a TMDB-backed browser. Posters, metadata and trending lists come
// from The Movie Database (TMDB). Streams and playback connect directly to the
// app's native player architecture via IMDb id mapping and direct CDN resolution.
import { fetchWithTimeout } from './http';

const TMDB_KEY = '5b458cad0b474d21129c717626038657';
const TMDB = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';

export type CineboxType = 'movie' | 'tv';

export type CineboxItem = {
  id: number;
  mediaType: CineboxType;
  title: string;
  year?: string;
  poster?: string;
  backdrop?: string;
  rating?: string;
  overview?: string;
};

export type CineboxDetails = {
  imdbId?: string;
  genres?: string[];
  runtime?: number;
  overview?: string;
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

function toRaw(r: Raw): CineboxItem | null {
  const type: CineboxType =
    r.media_type === 'tv' || (!r.media_type && !!r.first_air_date && !r.release_date)
      ? 'tv'
      : 'movie';
  const title = r.title || r.name;
  if (!r.id || !title) return null;
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

export async function trendingCinebox(type: CineboxType, page = 1): Promise<CineboxItem[]> {
  const body = await getJson(`${TMDB}/trending/${type}/week?api_key=${TMDB_KEY}&page=${page}`);
  const list = (body?.results ?? []) as Raw[];
  return list
    .map((r) => toRaw({ ...r, media_type: type }))
    .filter((x): x is CineboxItem => x !== null);
}

export async function searchCinebox(query: string, page = 1): Promise<CineboxItem[]> {
  const body = await getJson(
    `${TMDB}/search/multi?api_key=${TMDB_KEY}&query=${encodeURIComponent(query.trim())}&page=${page}`,
  );
  const list = (body?.results ?? []) as Raw[];
  return list
    .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
    .map((r) => toRaw(r))
    .filter((x): x is CineboxItem => x !== null);
}

/** Resolves detailed metadata and IMDb identifier needed for native stream lookup. */
export async function fetchCineboxDetails(item: CineboxItem): Promise<CineboxDetails | null> {
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
  return {
    imdbId: imdbId || undefined,
    genres,
    runtime,
    overview: body.overview || item.overview,
  };
}

export function backdropOrPoster(item: CineboxItem): string | undefined {
  return item.backdrop ?? item.poster;
}
