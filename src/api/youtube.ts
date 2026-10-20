import type { VideoSource } from '../data/channels';

export type Video = {
  id: string;
  title: string;
  published: string;
  thumbnail: string;
  duration?: string;
};

const CACHE_MS = 15 * 60 * 1000;
const cache = new Map<string, { at: number; videos: Video[] }>();
const pageCache = new Map<string, { at: number; page: VideoPage }>();

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

// Pull-to-refresh: the next loadVideos call goes back to YouTube.
export function clearVideoCache() {
  cache.clear();
  pageCache.clear();
}

export type VideoPage = { videos: Video[]; continuation?: string };

type Lockup = { id: string; title: string; duration?: string; channelId?: string };

// YouTube's newer list items ("lockups"), as used by playlists and "watch next",
// plus the token for the following page when there is one.
function collectLockups(json: any): { lockups: Lockup[]; continuation?: string } {
  const lockups: Lockup[] = [];
  let continuation: string | undefined;
  const walk = (o: any) => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== 'object') return;
    const lockup = o.lockupViewModel;
    if (lockup?.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO' && lockup.contentId) {
      const meta = lockup.metadata?.lockupMetadataViewModel;
      lockups.push({
        id: lockup.contentId,
        title: meta?.title?.content ?? '',
        // Both sit deep in nested view models; searching the text is simplest.
        duration: JSON.stringify(lockup.contentImage ?? {}).match(/"thumbnailBadgeViewModel":\{"text":"([^"]+)"/)?.[1],
        channelId: JSON.stringify(meta ?? {}).match(/"browseId":"(UC[\w-]{22})"/)?.[1],
      });
      return;
    }
    const command = o.continuationCommand;
    if (command?.request === 'CONTINUATION_REQUEST_TYPE_BROWSE' && command.token) continuation = command.token;
    Object.values(o).forEach(walk);
  };
  walk(json);
  return { lockups, continuation };
}

const BROWSE_URL = 'https://www.youtube.com/youtubei/v1/browse?prettyPrint=false';
// A filtered page can come back nearly empty; keep reading until it doesn't.
const MIN_PAGE_RESULTS = 8;
const MAX_PAGES_PER_CALL = 4;

// A channel's whole long-form upload list, a page (about 100 uploads) at a
// time, newest first. Pass the previous page's continuation for the next one.
export async function loadVideoPage(source: VideoSource, continuation?: string): Promise<VideoPage> {
  const first = !continuation;
  const hit = first ? pageCache.get(source.channelId) : undefined;
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.page;

  const videos: Video[] = [];
  let next = continuation;
  for (let i = 0; i < MAX_PAGES_PER_CALL && videos.length < MIN_PAGE_RESULTS; i++) {
    const body = next ? { continuation: next } : { browseId: `VLUULF${source.channelId.slice(2)}` };
    const res = await fetch(BROWSE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: { client: SEARCH_CLIENT }, ...body }),
    });
    if (!res.ok) break;
    const { lockups, continuation: after } = collectLockups(await res.json());
    for (const l of lockups) {
      if (source.titleFilter && !source.titleFilter.test(l.title)) continue;
      videos.push({ id: l.id, title: l.title, published: '', thumbnail: thumbnailUrl(l.id), duration: l.duration });
    }
    next = after;
    if (!next) break;
  }

  // If YouTube's list endpoint fails, the RSS feed still gives the latest few.
  if (first && videos.length === 0) return { videos: await loadVideos(source) };

  const page = { videos, continuation: next };
  if (first) pageCache.set(source.channelId, { at: Date.now(), page });
  return page;
}

export type SearchResult = Video & { channel: string; duration?: string; live: boolean };

const SEARCH_URL = 'https://www.youtube.com/youtubei/v1/search?prettyPrint=false';
const SEARCH_CLIENT = { clientName: 'WEB', clientVersion: '2.20250101.00.00', hl: 'en', gl: 'IN' };
const MAX_PAGES = 3;
const ENOUGH_RESULTS = 15;

type SearchPage = { results: SearchResult[]; continuation?: string };

function text(node: any): string {
  return node?.simpleText ?? node?.runs?.map((r: any) => r.text).join('') ?? '';
}

function parseSearch(json: any, trusted: Map<string, string>): SearchPage {
  const page: SearchPage = { results: [] };
  const walk = (o: any) => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== 'object') return;
    if (o.videoRenderer) {
      const v = o.videoRenderer;
      const channelId = v.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId;
      const channel = channelId && trusted.get(channelId);
      if (v.videoId && channel) {
        page.results.push({
          id: v.videoId,
          title: text(v.title),
          published: text(v.publishedTimeText),
          thumbnail: thumbnailUrl(v.videoId),
          channel,
          duration: text(v.lengthText) || undefined,
          // Live streams are the only results without a length.
          live: !v.lengthText,
        });
      }
      return;
    }
    if (o.continuationCommand?.token) page.continuation = o.continuationCommand.token;
    Object.values(o).forEach(walk);
  };
  walk(json);
  return page;
}

// YouTube's "watch next" list for a video, kept to the trusted official channels.
export async function relatedVideos(videoId: string, trusted: Map<string, string>): Promise<SearchResult[]> {
  const res = await fetch('https://www.youtube.com/youtubei/v1/next?prettyPrint=false', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context: { client: SEARCH_CLIENT }, videoId }),
  });
  if (!res.ok) return [];
  const results: SearchResult[] = [];
  for (const l of collectLockups(await res.json()).lockups) {
    const channel = l.channelId && trusted.get(l.channelId);
    if (!channel || l.id === videoId) continue;
    results.push({
      id: l.id,
      title: l.title,
      published: '',
      thumbnail: thumbnailUrl(l.id),
      channel,
      duration: l.duration,
      live: l.duration === 'LIVE',
    });
  }
  return results;
}

// YouTube's own web search, kept to the trusted official channels. Fetches a
// few pages, since most results on a page come from other channels.
export async function searchVideos(
  query: string,
  trusted: Map<string, string>,
  // Narrow scopes keep fewer results per page, so they may read further.
  maxPages = MAX_PAGES,
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  let continuation: string | undefined;
  for (let i = 0; i < maxPages && results.length < ENOUGH_RESULTS; i++) {
    const body = { context: { client: SEARCH_CLIENT }, ...(continuation ? { continuation } : { query }) };
    const res = await fetch(SEARCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) break;
    const page = parseSearch(await res.json(), trusted);
    for (const r of page.results) {
      if (!results.some((o) => o.id === r.id)) results.push(r);
    }
    if (!page.continuation) break;
    continuation = page.continuation;
  }
  return results;
}
