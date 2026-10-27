import { stripEmoji } from '../data/text';
import { fetchWithTimeout } from './http';
import type { Playable } from '../types';

export type ReelCategory = 'all' | 'cinema' | 'comedy' | 'trailer' | 'scenes';

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
  duration?: string;
  relatedPlayable?: Playable;
  likesCount: number;
};

type ChannelSource = {
  name: string;
  channelId: string;
  category: ReelCategory;
};

const REEL_CHANNELS: ChannelSource[] = [
  { name: 'Flowers Comedy', channelId: 'UCmAPdImtXLGh5E-lTTH4Qmg', category: 'comedy' },
  { name: 'Asianet', channelId: 'UCp_r6Z-Oh0YTf-ym71z5Nqg', category: 'scenes' },
  { name: 'Mazhavil Manorama', channelId: 'UCUPD0jQo-EP0B1Nf4uzeIMA', category: 'scenes' },
  { name: 'Aashirvad Cinemas', channelId: 'UC_J44kyEsEB8LPlhfm2Xb4g', category: 'cinema' },
  { name: 'Speed Audio & Video', channelId: 'UCCylGvN1jEnQ3dB4iajSMCA', category: 'trailer' },
  { name: 'SUPER FILMS', channelId: 'UCliFkRxHlF30zCvMYvDwMwQ', category: 'cinema' },
  { name: 'Sun Surya Comedy', channelId: 'UCG9xw4kFo11e39yaaN09BtQ', category: 'comedy' },
  { name: 'Mango Malayalam', channelId: 'UCiKN63TrDOa6pjslivoUZpQ', category: 'cinema' },
  { name: 'Friday Film House', channelId: 'UCv65_DW-OzwBgJw99zWJy3g', category: 'trailer' },
  { name: 'Matinee Now HD', channelId: 'UCKH7E8Jr7_pFraJ9QEF5wdg', category: 'cinema' },
  { name: 'Kaumudy', channelId: 'UCSVALYUGVruJ4I2RjhiudSQ', category: 'scenes' },
];

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
      likesCount,
    });
  }

  return reels;
}

const FEED_TIMEOUT_MS = 6000;
const cache = new Map<string, { at: number; reels: ReelItem[] }>();
const CACHE_MS = 15 * 60 * 1000;

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

// Interleave items from multiple channels to produce a diverse feed
function shuffleInterleave(lists: ReelItem[][]): ReelItem[] {
  const result: ReelItem[] = [];
  const maxLen = Math.max(...lists.map((l) => l.length), 0);

  for (let i = 0; i < maxLen; i++) {
    for (const list of lists) {
      if (i < list.length) {
        result.push(list[i]);
      }
    }
  }

  return result;
}

export async function fetchReels(category: ReelCategory = 'all'): Promise<ReelItem[]> {
  const channels = category === 'all'
    ? REEL_CHANNELS
    : REEL_CHANNELS.filter((c) => c.category === category);

  const lists = await Promise.all(channels.map((c) => fetchChannelShorts(c)));
  const merged = shuffleInterleave(lists);

  // Eliminate potential duplicates
  const seen = new Set<string>();
  const unique: ReelItem[] = [];
  for (const item of merged) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      unique.push(item);
    }
  }

  return unique;
}

export function clearReelsCache() {
  cache.clear();
}
