import { directStream, playableRows, searchSubjects, seasonEpisodes, type MovieboxSubject } from './moviebox';
import type { Playable } from '../types';

export type DirectStreamOption = {
  title: string;
  quality: string;
  size?: string;
  url: string;
  playable: Playable;
  subject: MovieboxSubject;
};

/**
 * Resolves high-speed direct CDN streams (.mp4 / .m3u8) for any movie title
 * from the app's built-in MovieBox library, enabling instant playback in the native
 * video player with zero TorBox key required.
 */
export async function resolveDirectMovieStreams(
  title: string,
  year?: string,
): Promise<DirectStreamOption[]> {
  try {
    const cleanTitle = title.trim();
    if (!cleanTitle) return [];

    const res = await searchSubjects(cleanTitle, 1);
    const subjects = res?.subjects ?? [];
    if (subjects.length === 0) return [];

    const norm = cleanTitle.toLowerCase();
    // 1. Exact title & year match (excluding [Hindi]/[CAM] tags)
    let match = subjects.find((s) => {
      const sTitle = s.title.toLowerCase().replace(/\[[^\]]*\]/g, '').trim();
      return sTitle === norm && (!year || !s.year || s.year === String(year));
    });

    // 2. Title match without year constraint
    if (!match) {
      match = subjects.find((s) => {
        const sTitle = s.title.toLowerCase().replace(/\[[^\]]*\]/g, '').trim();
        return sTitle === norm;
      });
    }

    // 3. Partial substring match
    if (!match) {
      match = subjects.find((s) => {
        const sTitle = s.title.toLowerCase().replace(/\[[^\]]*\]/g, '').trim();
        return sTitle.includes(norm) || norm.includes(sTitle);
      });
    }

    // 4. First result fallback if relevance is high
    if (!match) {
      match = subjects[0];
    }

    if (!match) return [];

    const rows = await playableRows(match.id, 0, 0);
    if (rows.length === 0) return [];

    const options: DirectStreamOption[] = [];
    for (const row of rows) {
      try {
        const stream = await directStream(match.id, row);
        if (stream?.url) {
          const quality = row.resolution ? `${row.resolution}p` : 'HD';
          const size = row.size ? `${(row.size / 1e9).toFixed(1)} GB` : undefined;
          options.push({
            title: `${match.title} (${quality})`,
            quality,
            size,
            url: stream.url,
            subject: match,
            playable: {
              kind: 'moviebox',
              subjectId: match.id,
              season: 0,
              episode: 0,
              title: `${match.title} (${quality})`,
              poster: match.poster,
            },
          });
        }
      } catch {
        // Skip failed individual streams
      }
    }

    return options;
  } catch {
    return [];
  }
}

/**
 * Resolves a direct playable stream for an episode of a TV series.
 */
export async function resolveDirectSeriesEpisode(
  title: string,
  season: number,
  episode: number,
): Promise<{ url: string; playable: Playable } | null> {
  try {
    const cleanTitle = title.trim();
    if (!cleanTitle) return null;

    const res = await searchSubjects(cleanTitle, 1);
    const subjects = res?.subjects ?? [];
    if (subjects.length === 0) return null;

    const norm = cleanTitle.toLowerCase();
    let match = subjects.find((s) => {
      const sTitle = s.title.toLowerCase().replace(/\[[^\]]*\]/g, '').trim();
      return sTitle === norm;
    }) || subjects.find((s) => {
      const sTitle = s.title.toLowerCase().replace(/\[[^\]]*\]/g, '').trim();
      return sTitle.includes(norm) || norm.includes(sTitle);
    }) || subjects[0];

    if (!match) return null;

    const eps = await seasonEpisodes(match.id, season, episode);
    const ep = eps.find((e) => e.episode === episode) || eps[0];
    if (!ep) return null;

    const stream = await directStream(match.id, ep);
    if (!stream?.url) return null;

    return {
      url: stream.url,
      playable: {
        kind: 'moviebox',
        subjectId: match.id,
        season,
        episode,
        title: `${match.title} · S${season}E${episode}`,
        poster: match.poster,
      },
    };
  } catch {
    return null;
  }
}
