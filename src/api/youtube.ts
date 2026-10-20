import type { VideoSource } from '../data/channels';

export type Video = {
  id: string;
  title: string;
  published: string;
  thumbnail: string;
};

const CACHE_MS = 15 * 60 * 1000;
const cache = new Map<string, { at: number; videos: Video[] }>();

// mqdefault is 16:9, so cards don't get black bars.
export function thumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

function decode(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
}

function parseFeed(xml: string): Video[] {
  const entries = xml.split('<entry>').slice(1);
  const videos: Video[] = [];
  for (const entry of entries) {
    const id = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
    const title = entry.match(/<title>([^<]*)<\/title>/)?.[1];
    if (!id || title === undefined) continue;
    videos.push({
      id,
      title: decode(title),
      published: entry.match(/<published>([^<]+)<\/published>/)?.[1] ?? '',
      thumbnail: thumbnailUrl(id),
    });
  }
  return videos;
}

async function fetchFeed(query: string): Promise<Video[] | null> {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?${query}`);
  if (!res.ok) return null;
  return parseFeed(await res.text());
}

// The "UULF" uploads playlist holds a channel's long-form videos only, which
// keeps Shorts out of the rows. Fall back to the plain channel feed.
export async function loadVideos(source: VideoSource): Promise<Video[]> {
  const hit = cache.get(source.channelId);
  let videos = hit && Date.now() - hit.at < CACHE_MS ? hit.videos : null;

  if (!videos) {
    videos =
      (await fetchFeed(`playlist_id=UULF${source.channelId.slice(2)}`)) ??
      (await fetchFeed(`channel_id=${source.channelId}`)) ??
      [];
    // Channels sometimes list the same upload twice.
    videos = videos.filter((v, i, all) => all.findIndex((o) => o.id === v.id) === i);
    cache.set(source.channelId, { at: Date.now(), videos });
  }

  const filter = source.titleFilter;
  return filter ? videos.filter((v) => filter.test(v.title)) : videos;
}
