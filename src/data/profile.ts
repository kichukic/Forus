// Builds a preference profile from activity and scores content against it.
// Content-based filtering, entirely on-device.
import { getStore } from './activity';
import type { MovieboxSubject } from '../api/moviebox';

export type Profile = {
  genreWeights: Record<string, number>;
  languageWeights: Record<string, number>;
  countryWeights: Record<string, number>;
  decadeWeights: Record<string, number>;
  /** Subject ids the user has watched (completed or not). */
  watchedIds: Set<string>;
  /** Subject ids the user favorited. */
  favoriteIds: Set<string>;
  /** Subject ids the user downloaded. */
  downloadedIds: Set<string>;
  /** Recent search terms. */
  recentSearches: string[];
  /** Total watch count. */
  watchCount: number;
  /** Average completion rate. */
  avgCompletion: number;
};

const GENRE_WEIGHT_WATCH = 3;
const GENRE_WEIGHT_COMPLETE = 5;
const GENRE_WEIGHT_FAVORITE = 6;
const GENRE_WEIGHT_DOWNLOAD = 4;
const GENRE_WEIGHT_OPEN = 1;
const LANGUAGE_WEIGHT = 2;
const COUNTRY_WEIGHT = 1.5;
const DECADE_WEIGHT = 1;
const ALREADY_WATCHED_PENALTY = -8;
const FAVORITE_BOOST = 4;

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function addWeight(map: Record<string, number>, key: string, amount: number) {
  if (!key) return;
  const k = normalize(key);
  map[k] = (map[k] ?? 0) + amount;
}

function decadeOf(year?: string): string {
  if (!year) return '';
  const n = parseInt(year, 10);
  if (!Number.isFinite(n) || n < 1900) return '';
  return `${Math.floor(n / 10) * 10}s`;
}

export function buildProfile(): Profile {
  const store = getStore();
  const genreWeights: Record<string, number> = {};
  const languageWeights: Record<string, number> = {};
  const countryWeights: Record<string, number> = {};
  const decadeWeights: Record<string, number> = {};
  const watchedIds = new Set<string>();
  const favoriteIds = new Set<string>();
  const downloadedIds = new Set<string>();
  const recentSearches: string[] = [];
  let totalCompletion = 0;
  let watchCount = 0;

  for (const w of store.watches) {
    watchedIds.add(w.id);
    watchCount += 1;
    totalCompletion += w.progress;
    const g = w.genre ? w.genre.split(/[,;]/) : [];
    for (const genre of g) addWeight(genreWeights, genre, w.completed ? GENRE_WEIGHT_COMPLETE : GENRE_WEIGHT_WATCH);
    addWeight(languageWeights, w.language ?? '', LANGUAGE_WEIGHT);
    addWeight(countryWeights, w.country ?? '', COUNTRY_WEIGHT);
    addWeight(decadeWeights, decadeOf(w.year), DECADE_WEIGHT);
  }

  for (const f of store.favorites) {
    favoriteIds.add(f.id);
    const g = f.genre ? f.genre.split(/[,;]/) : [];
    for (const genre of g) addWeight(genreWeights, genre, GENRE_WEIGHT_FAVORITE);
    addWeight(languageWeights, f.language ?? '', LANGUAGE_WEIGHT);
    addWeight(decadeWeights, decadeOf(f.year), DECADE_WEIGHT);
  }

  for (const d of store.downloads) {
    downloadedIds.add(d.id);
    const g = d.genre ? d.genre.split(/[,;]/) : [];
    for (const genre of g) addWeight(genreWeights, genre, GENRE_WEIGHT_DOWNLOAD);
  }

  for (const o of store.opens) {
    const g = (o as any).genre ? String((o as any).genre).split(/[,;]/) : [];
    for (const genre of g) addWeight(genreWeights, genre, GENRE_WEIGHT_OPEN);
  }

  // Recent searches (unique, newest first).
  const seenQ = new Set<string>();
  for (let i = store.searches.length - 1; i >= 0; i -= 1) {
    const q = normalize(store.searches[i].query);
    if (q && !seenQ.has(q)) {
      seenQ.add(q);
      recentSearches.push(store.searches[i].query);
      if (recentSearches.length >= 10) break;
    }
  }

  return {
    genreWeights,
    languageWeights,
    countryWeights,
    decadeWeights,
    watchedIds,
    favoriteIds,
    downloadedIds,
    recentSearches,
    watchCount,
    avgCompletion: watchCount > 0 ? totalCompletion / watchCount : 0,
  };
}

export function scoreSubject(subject: MovieboxSubject, profile: Profile): number {
  let score = 0;

  // Genre match.
  const genres = (subject.genre ?? '').split(/[,;]/).map(normalize).filter(Boolean);
  for (const g of genres) {
    score += profile.genreWeights[g] ?? 0;
  }

  // Language match.
  if (subject.language) {
    score += (profile.languageWeights[normalize(subject.language)] ?? 0) * 0.5;
  }

  // Country match.
  if (subject.country) {
    score += (profile.countryWeights[normalize(subject.country)] ?? 0) * 0.3;
  }

  // Decade match.
  const dec = decadeOf(subject.year);
  if (dec) {
    score += (profile.decadeWeights[dec] ?? 0) * 0.4;
  }

  // Rating boost (higher rated films slightly preferred).
  const rating = parseFloat(subject.rating ?? '0');
  if (Number.isFinite(rating) && rating > 0) {
    score += Math.min(rating, 10) * 0.3;
  }

  // Already watched → penalty (but not if favorited).
  if (profile.watchedIds.has(subject.id) && !profile.favoriteIds.has(subject.id)) {
    score += ALREADY_WATCHED_PENALTY;
  }

  // Favorited → strong boost.
  if (profile.favoriteIds.has(subject.id)) {
    score += FAVORITE_BOOST;
  }

  // Recency boost for new titles (within last 30 days unknown; use year as proxy).
  const year = parseInt(subject.year ?? '0', 10);
  if (Number.isFinite(year) && year >= new Date().getFullYear() - 1) {
    score += 2;
  }

  // If no activity yet, fall back to rating + recency.
  if (profile.watchCount === 0 && profile.favoriteIds.size === 0) {
    score = (Number.isFinite(rating) ? rating : 5) + (year >= new Date().getFullYear() - 2 ? 2 : 0);
  }

  return score;
}

export function rankSubjects(subjects: MovieboxSubject[], profile: Profile): MovieboxSubject[] {
  return [...subjects].sort((a, b) => scoreSubject(b, profile) - scoreSubject(a, profile));
}

export function topGenres(profile: Profile, n = 5): string[] {
  return Object.entries(profile.genreWeights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([g]) => g);
}
