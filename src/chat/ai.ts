import { searchSubjects, type MovieboxSubject } from '../api/moviebox';
import type { AiTonightPick } from './api';

/** Lower-case, unpunctuated words, for comparing titles from different sources. */
function words(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

const normal = (value: string) => words(value).join(' ');

/**
 * Finds the MovieBox subject a concierge pick refers to. A suggestion is only
 * accepted when its name (and, when known, its year) actually matches: opening
 * the first unrelated search result would be worse than saying it isn't there.
 */
export async function findMovieboxSubject(pick: AiTonightPick): Promise<MovieboxSubject | null> {
  const wanted = normal(pick.title);
  if (!wanted) return null;

  try {
    const { subjects } = await searchSubjects(pick.title);
    let best: MovieboxSubject | null = null;
    let bestScore = 0;
    const wantedWords = new Set(words(pick.title));

    for (const subject of subjects) {
      const candidate = normal(subject.title);
      const exact = candidate === wanted;
      const candidateWords = new Set(words(subject.title));
      const contains = candidate.includes(wanted) || wanted.includes(candidate);
      // An exact name is enough. A looser match (a subtitle, or "US" added)
      // only counts when its release year also matches, so a similarly named
      // film isn't opened by mistake.
      const yearMatches = !!pick.year && Number(subject.year) === pick.year;
      if (!exact && !(contains && yearMatches)) continue;
      let score = exact ? 100 : 55;
      const shared = [...wantedWords].filter((word) => candidateWords.has(word)).length;
      score += (shared / Math.max(wantedWords.size, candidateWords.size)) * 15;
      if (yearMatches) score += 25;
      if (pick.kind && subject.kind === pick.kind) score += 8;
      if (score > bestScore) {
        best = subject;
        bestScore = score;
      }
    }

    return best && bestScore >= 55 ? best : null;
  } catch {
    return null;
  }
}
