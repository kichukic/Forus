import { stripEmoji } from '../data/text';
import { fetchWithTimeout } from './http';
import { fetchDramaEpisodes, shortDramaEpisode1, shortDramaSubjects } from './moviebox';
import type { Playable } from '../types';

export type ReelCategory = 'all' | 'drama' | 'cinema' | 'comedy' | 'trailer' | 'scenes';
export type ReelLanguage = 'auto' | 'malayalam' | 'hindi';

export type ReelSource =
  | { type: 'youtube'; videoId: string }
  | { type: 'direct'; url: string };

export type ReelItem = {
  id: string;
  title: string;
  author: string;
  authorAvatar?: string;
  source: ReelSource;
  thumbnailUrl: string;
  category: ReelCategory;
  language: 'malayalam' | 'hindi';
  duration?: string;
  relatedPlayable?: Playable;
  likesCount: number;
};

type ChannelSource = {
  name: string;
  channelId: string;
  category: ReelCategory;
  language: 'malayalam' | 'hindi';
};

const REEL_CHANNELS: ChannelSource[] = [
  // --- Malayalam Channels ---
  // Short Drama / Serials
  { name: 'Asianet Serials', channelId: 'UCp_r6Z-Oh0YTf-ym71z5Nqg', category: 'drama', language: 'malayalam' },
  { name: 'Mazhavil Serials', channelId: 'UCUPD0jQo-EP0B1Nf4uzeIMA', category: 'drama', language: 'malayalam' },
  { name: 'Flowers TV', channelId: 'UCSrS91iCgFCv_3KwjWWHzSg', category: 'drama', language: 'malayalam' },
  { name: 'Zee Keralam', channelId: 'UCbrfwFuwMVRtxUTtEYJUKKg', category: 'drama', language: 'malayalam' },
  // Comedy
  { name: 'Flowers Comedy', channelId: 'UCmAPdImtXLGh5E-lTTH4Qmg', category: 'comedy', language: 'malayalam' },
  { name: 'Sun Surya Comedy', channelId: 'UCG9xw4kFo11e39yaaN09BtQ', category: 'comedy', language: 'malayalam' },
  // Cinema & Scenes
  { name: 'Aashirvad Cinemas', channelId: 'UC_J44kyEsEB8LPlhfm2Xb4g', category: 'cinema', language: 'malayalam' },
  { name: 'SUPER FILMS', channelId: 'UCliFkRxHlF30zCvMYvDwMwQ', category: 'cinema', language: 'malayalam' },
  { name: 'Mango Malayalam', channelId: 'UCiKN63TrDOa6pjslivoUZpQ', category: 'cinema', language: 'malayalam' },
  { name: 'Matinee Now HD', channelId: 'UCKH7E8Jr7_pFraJ9QEF5wdg', category: 'cinema', language: 'malayalam' },
  { name: 'Kaumudy', channelId: 'UCSVALYUGVruJ4I2RjhiudSQ', category: 'scenes', language: 'malayalam' },
  // Trailers
  { name: 'Speed Audio & Video', channelId: 'UCCylGvN1jEnQ3dB4iajSMCA', category: 'trailer', language: 'malayalam' },
  { name: 'Friday Film House', channelId: 'UCv65_DW-OzwBgJw99zWJy3g', category: 'trailer', language: 'malayalam' },

  // --- Hindi Channels ---
  // Short Drama
  { name: 'Dyar Entertainment', channelId: 'UC2lLHs_L-bVRaJvaKLP7gXA', category: 'drama', language: 'hindi' },
  { name: 'Rajshri Dramas', channelId: 'UCEKWXRsfUHkan-D_ljU8Asw', category: 'drama', language: 'hindi' },
  // Cinema
  { name: 'Ultra Bollywood', channelId: 'UCmL1WlDI8UkXDXCXcBQN9CA', category: 'cinema', language: 'hindi' },
  { name: 'Zee Movies Hindi', channelId: 'UCcWi9YwnWUsR53jV0T4ObKA', category: 'cinema', language: 'hindi' },
  { name: 'Ultra Movie Parlour', channelId: 'UCYauDsl-rswjQGpA0_-Z9Pw', category: 'cinema', language: 'hindi' },
  // Comedy
  { name: 'Shemaroo Comedy', channelId: 'UCBOmfqgTZi7yDp4-3Lr_3lA', category: 'comedy', language: 'hindi' },
];

// Strict adult/NSFW content filter to block 18+, suggestive, or nudity content
const ADULT_PATTERNS = [
  /\b18\+\b/i,
  /\badult\b/i,
  /\bnsfw\b/i,
  /\bnude\b/i,
  /\bnudity\b/i,
  /\bsexy\b/i,
  /\bhot scene\b/i,
  /\bbed scene\b/i,
  /\bintimate scene\b/i,
  /\bliplock\b/i,
  /\bkissing scene\b/i,
  /\berotic\b/i,
  /\bcleavage\b/i,
  /\bbikini\b/i,
  /\bnavel\b/i,
  /\buncensored\b/i,
  /\bexplicit\b/i,
  /\bbold scene\b/i,
  /\bromance scene\b/i,
  /\bhot romance\b/i,
  /\bitem song hot\b/i,
  /\bglamour\b/i,
  /\bseductive\b/i,
  /\bxxx\b/i,
  /\bporn\b/i,
  /\bweb series hot\b/i,
];

export function isFamilySafe(text: string): boolean {
  return !ADULT_PATTERNS.some((pattern) => pattern.test(text));
}

function decodeHtml(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
}

export function reelThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function parseShortsFeed(xml: string, channel: ChannelSource): ReelItem[] {
  const entries = xml.split('<entry>').slice(1);
  const reels: ReelItem[] = [];

  for (const entry of entries) {
    const videoId = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
    const rawTitle = entry.match(/<title>([^<]*)<\/title>/)?.[1];
    if (!videoId || rawTitle === undefined) continue;

    const title = stripEmoji(decodeHtml(rawTitle)).trim();
    if (!isFamilySafe(title)) continue;

    // Deterministic like count generator based on videoId characters for consistent UI
    let hash = 0;
    for (let i = 0; i < videoId.length; i++) hash = (hash * 31 + videoId.charCodeAt(i)) & 0xffffffff;
    const likesCount = 1200 + Math.abs(hash % 48000);

    reels.push({
      id: `yt-${videoId}`,
      title,
      author: channel.name,
      source: { type: 'youtube', videoId },
      thumbnailUrl: reelThumbnail(videoId),
      category: channel.category,
      language: channel.language,
      likesCount,
    });
  }

  return reels;
}

const FEED_TIMEOUT_MS = 6000;
const cache = new Map<string, { at: number; reels: ReelItem[] }>();
const CACHE_MS = 15 * 60 * 1000;

const mbDramaCache: { at: number; reels: ReelItem[] } = { at: 0, reels: [] };
const MB_DRAMA_CACHE_MS = 15 * 60 * 1000;

async function fetchMovieboxShortDramaReels(): Promise<ReelItem[]> {
  if (mbDramaCache.reels.length > 0 && Date.now() - mbDramaCache.at < MB_DRAMA_CACHE_MS) {
    return mbDramaCache.reels;
  }

  try {
    const subjects = await shortDramaSubjects();
    if (!subjects.length) return [];

    const safeSubjects = subjects.filter((s) => isFamilySafe(s.title));
    const targetSubjects = safeSubjects.slice(0, 16);

    const streamPromises = targetSubjects.map(async (subj) => {
      const streamUrl = await shortDramaEpisode1(subj.id);
      if (!streamUrl) return null;

      const isHindi =
        /[\u0900-\u097F]/i.test(subj.title) ||
        /hindi|boss|pati|dulhan|dulhaniya|pyaar|raja|shehzada|crorepati|arabpati|damaad|bahu/i.test(subj.title);

      let hash = 0;
      for (let i = 0; i < subj.id.length; i++) hash = (hash * 31 + subj.id.charCodeAt(i)) & 0xffffffff;
      const likesCount = 14000 + Math.abs(hash % 38000);

      const reel: ReelItem = {
        id: `mb-${subj.id}`,
        title: subj.title,
        author: 'MovieBox MiniTV',
        source: { type: 'direct', url: streamUrl },
        thumbnailUrl: subj.poster || subj.backdrop || '',
        category: 'drama',
        language: isHindi ? 'hindi' : 'malayalam',
        likesCount,
        relatedPlayable: {
          kind: 'moviebox',
          subjectId: subj.id,
          season: 1,
          episode: 1,
          title: subj.title,
          poster: subj.poster,
        },
      };
      return reel;
    });

    const settled = await Promise.all(streamPromises);
    const validReels = settled.filter((r): r is ReelItem => r !== null);
    if (validReels.length > 0) {
      mbDramaCache.at = Date.now();
      mbDramaCache.reels = validReels;
    }
    return validReels;
  } catch {
    return [];
  }
}

async function fetchChannelShorts(channel: ChannelSource): Promise<ReelItem[]> {
  const hit = cache.get(channel.channelId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.reels;

  try {
    const query = `playlist_id=UUSH${channel.channelId.slice(2)}`;
    const res = await fetchWithTimeout(`https://www.youtube.com/feeds/videos.xml?${query}`, {}, FEED_TIMEOUT_MS);
    if (!res.ok) return [];

    const xml = await res.text();
    const reels = parseShortsFeed(xml, channel);
    if (reels.length) {
      cache.set(channel.channelId, { at: Date.now(), reels });
    }
    return reels;
  } catch {
    return [];
  }
}

/**
 * Intelligent Language Recommendation Algorithm:
 * 1. Analyzes user watch history for language affinity.
 * 2. Checks system locale as fallback.
 * Returns either 'malayalam' or 'hindi'.
 */
export function detectPreferredLanguage(history: Playable[] = []): 'malayalam' | 'hindi' {
  let malScore = 0;
  let hinScore = 0;

  for (const item of history.slice(0, 35)) {
    const title = item.title || '';
    // Malayalam unicode range \u0D00-\u0D7F
    if (/[\u0D00-\u0D7F]/.test(title) || /malayalam|asianet|flowers|marimayam|mazhavil|surya|kairali/i.test(title)) {
      malScore += 2;
    }
    // Devanagari unicode range \u0900-\u097F
    if (/[\u0900-\u097F]/.test(title) || /hindi|bollywood|shemaroo|ultra|zee movies|rajshri/i.test(title)) {
      hinScore += 2;
    }
  }

  if (hinScore > malScore) return 'hindi';
  if (malScore > hinScore) return 'malayalam';

  // System locale fallback
  try {
    const loc = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase();
    if (loc.startsWith('hi')) return 'hindi';
  } catch {}

  return 'malayalam';
}

function shuffleInterleave(primary: ReelItem[][], secondary: ReelItem[][]): ReelItem[] {
  const result: ReelItem[] = [];
  const pFlat: ReelItem[] = [];
  const sFlat: ReelItem[] = [];

  const maxP = Math.max(...primary.map((l) => l.length), 0);
  for (let i = 0; i < maxP; i++) {
    for (const list of primary) {
      if (i < list.length) pFlat.push(list[i]);
    }
  }

  const maxS = Math.max(...secondary.map((l) => l.length), 0);
  for (let i = 0; i < maxS; i++) {
    for (const list of secondary) {
      if (i < list.length) sFlat.push(list[i]);
    }
  }

  // Interleave with 3:1 ratio (3 primary items for every 1 secondary item)
  let pIdx = 0;
  let sIdx = 0;
  while (pIdx < pFlat.length || sIdx < sFlat.length) {
    for (let k = 0; k < 3 && pIdx < pFlat.length; k++) {
      result.push(pFlat[pIdx++]);
    }
    if (sIdx < sFlat.length) {
      result.push(sFlat[sIdx++]);
    }
  }

  return result;
}

export async function fetchReels(
  category: ReelCategory = 'all',
  language: ReelLanguage = 'auto',
  history: Playable[] = [],
): Promise<ReelItem[]> {
  const activeLang = language === 'auto' ? detectPreferredLanguage(history) : language;

  const filterChannels = (lang: 'malayalam' | 'hindi') => {
    return REEL_CHANNELS.filter((c) => {
      const langMatch = c.language === lang;
      const catMatch = category === 'all' || c.category === category;
      return langMatch && catMatch;
    });
  };

  const primaryChannels = filterChannels(activeLang);
  const secondaryLang = activeLang === 'hindi' ? 'malayalam' : 'hindi';
  const secondaryChannels = filterChannels(secondaryLang);

  const shouldFetchMbDramas = category === 'drama' || category === 'all';
  const mbDramaPromise = shouldFetchMbDramas
    ? fetchMovieboxShortDramaReels()
    : Promise.resolve([] as ReelItem[]);

  const [primaryLists, secondaryLists, mbDramas] = await Promise.all([
    Promise.all(primaryChannels.map((c) => fetchChannelShorts(c))),
    Promise.all(secondaryChannels.map((c) => fetchChannelShorts(c))),
    mbDramaPromise,
  ]);

  const merged = shuffleInterleave(primaryLists, secondaryLists);

  if (mbDramas.length > 0) {
    if (category === 'drama') {
      const dramaList: ReelItem[] = [];
      const ytDrama = [...merged];
      let mbIdx = 0;
      let ytIdx = 0;
      while (mbIdx < mbDramas.length || ytIdx < ytDrama.length) {
        if (mbIdx < mbDramas.length) dramaList.push(mbDramas[mbIdx++]);
        if (ytIdx < ytDrama.length) dramaList.push(ytDrama[ytIdx++]);
      }
      merged.length = 0;
      merged.push(...dramaList);
    } else {
      let mbIdx = 0;
      for (let i = 2; i < merged.length && mbIdx < mbDramas.length; i += 4) {
        merged.splice(i, 0, mbDramas[mbIdx++]);
      }
      while (mbIdx < mbDramas.length && merged.length < 30) {
        merged.push(mbDramas[mbIdx++]);
      }
    }
  }

  // Eliminate potential duplicates and enforce family safety
  const seen = new Set<string>();
  const unique: ReelItem[] = [];
  for (const item of merged) {
    if (!isFamilySafe(item.title)) continue;
    if (!seen.has(item.id)) {
      seen.add(item.id);
      unique.push(item);
    }
  }

  return unique;
}

export function clearReelsCache() {
  cache.clear();
  mbDramaCache.at = 0;
  mbDramaCache.reels = [];
}

export type ReelDramaEpisode = {
  episode: number;
  title: string;
  streamUrl?: string;
  videoId?: string;
  duration?: number;
};

/**
 * Loads all episodes for a short drama or serial reel so users can browse
 * and watch every episode directly within the Reels player.
 */
export async function fetchReelEpisodes(item: ReelItem): Promise<ReelDramaEpisode[]> {
  // MovieBox short dramas
  if (item.relatedPlayable?.kind === 'moviebox') {
    const list = await fetchDramaEpisodes(item.relatedPlayable.subjectId);
    return list.map((ep) => ({
      episode: ep.episode,
      title: ep.title || `Episode ${ep.episode}`,
      streamUrl: ep.streamUrl,
      duration: ep.duration,
    }));
  }

  // YouTube serial shorts
  if (item.source.type === 'youtube') {
    const channel = REEL_CHANNELS.find((c) => c.name === item.author);
    if (channel) {
      const channelShorts = await fetchChannelShorts(channel);
      return channelShorts.map((cs, idx) => ({
        episode: idx + 1,
        title: cs.title,
        videoId: (cs.source as { videoId: string }).videoId,
      }));
    }
  }

  return [];
}

