// What to list under the player: related videos from the official channels,
// topped up from the app's own rows so the list is never short.
import { FULL_MOVIE, HINDI_MOVIES, LIVE_NEWS, MOVIES, SHOWS, TRUSTED_CHANNELS } from '../data/channels';
import type { Playable } from '../types';
import { getApiKey, listVideoFiles } from './torbox';
import { loadVideos, relatedVideos, thumbnailUrl } from './youtube';

export type RelatedCard = {
  key: string;
  item: Playable;
  title: string;
  subtitle: string;
  thumbnail?: string; // YouTube videos
  liveColor?: string; // live channels, drawn as a coloured tile
  fileName?: string; // TorBox files, whose artwork is looked up
};

const MAX_CARDS = 20;

export async function getRelated(item: Playable): Promise<RelatedCard[]> {
  if (item.kind === 'file') return relatedFiles(item);
  if (item.kind === 'live') return relatedLive(item.channelId);
  // A MovieBox film has nothing on the channels to relate it to.
  if (item.kind === 'moviebox') return [];
  return relatedToVideo(item.videoId, item.title);
}

function videoCard(id: string, title: string, subtitle: string): RelatedCard {
  return { key: `video:${id}`, item: { kind: 'video', videoId: id, title }, title, subtitle, thumbnail: thumbnailUrl(id) };
}

async function relatedToVideo(videoId: string, title: string): Promise<RelatedCard[]> {
  const cards: RelatedCard[] = [];
  const seen = new Set([videoId]);
  const add = (card: RelatedCard, id: string) => {
    if (seen.has(id) || cards.length >= MAX_CARDS) return;
    seen.add(id);
    cards.push(card);
  };

  const related = await relatedVideos(videoId, TRUSTED_CHANNELS).catch(() => []);
  for (const r of related) {
    add(videoCard(r.id, r.title, [r.channel, r.live ? '● LIVE' : r.duration].filter(Boolean).join(' · ')), r.id);
  }

  // Films are followed by films (Hindi ones by Hindi ones), everything else by
  // the latest episodes.
  const pool = !FULL_MOVIE.test(title) ? SHOWS : /hindi|bollywood/i.test(title) ? HINDI_MOVIES : MOVIES;
  const lists = await Promise.all(pool.map((s) => loadVideos(s).catch(() => [])));
  const latest = lists
    .flatMap((list, i) => list.map((v) => ({ ...v, channel: pool[i].name })))
    .sort((a, b) => b.published.localeCompare(a.published));
  for (const v of latest) add(videoCard(v.id, v.title, v.channel), v.id);

  return cards;
}

function relatedLive(channelId: string): RelatedCard[] {
  return LIVE_NEWS.filter((c) => c.channelId !== channelId).map((c) => ({
    key: `live:${c.channelId}`,
    item: { kind: 'live', channelId: c.channelId, title: c.name },
    title: c.name,
    subtitle: 'Live now',
    liveColor: c.color,
  }));
}

async function relatedFiles(item: Extract<Playable, { kind: 'file' }>): Promise<RelatedCard[]> {
  const key = await getApiKey();
  if (!key) return [];
  const files = await listVideoFiles(key).catch(() => []);
  return files
    .filter((f) => !(f.source === item.source && f.itemId === item.itemId && f.fileId === item.fileId))
    .slice(0, MAX_CARDS)
    .map((f) => ({
      key: `file:${f.source}:${f.itemId}:${f.fileId}`,
      item: { kind: 'file', source: f.source, itemId: f.itemId, fileId: f.fileId, title: f.name },
      title: f.name,
      subtitle: 'From your TorBox',
      fileName: f.name,
    }));
}
