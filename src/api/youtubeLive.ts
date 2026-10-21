// YouTube removed permanent live-stream embeds, so a channel's current stream
// has to be looked up first. The channel's /live page carries a player
// response that says what is on air right now.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { isTV } from '../theme';
import { fetchWithTimeout } from './http';

const CACHE_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; videoId: string | null }>();

// The last stream found for each channel, kept across launches. News channels
// run one stream for days, so the tiles can show its picture straight away.
const SAVED_KEY = 'live-video-ids';
let saved: Promise<Record<string, string>> | null = null;

function savedIds(): Promise<Record<string, string>> {
  saved ??= AsyncStorage.getItem(SAVED_KEY)
    .then((raw) => (raw ? JSON.parse(raw) : {}))
    .catch(() => ({}));
  return saved;
}

/** The stream last found for a channel, if any; no network. */
export async function savedLiveVideoId(channelId: string): Promise<string | null> {
  return (await savedIds())[channelId] ?? null;
}

async function remember(channelId: string, videoId: string) {
  const ids = await savedIds();
  if (ids[channelId] === videoId) return;
  ids[channelId] = videoId;
  AsyncStorage.setItem(SAVED_KEY, JSON.stringify(ids)).catch(() => {});
}

// TV: each /live page is over a megabyte to read, which a TV's chip feels. The
// tiles look theirs up one after another, starting once the home screen has
// settled, instead of all at once while it is opening.
const TV_START_DELAY_MS = 4000;
const TV_GAP_MS = 400;
let queue: Promise<unknown> | null = null;
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** The same lookup, for tiles: spaced out on TV. */
export function resolveLiveVideoIdForTile(channelId: string): Promise<string | null> {
  if (!isTV) return resolveLiveVideoId(channelId);
  const hit = cache.get(channelId);
  if (hit && Date.now() - hit.at < CACHE_MS) return Promise.resolve(hit.videoId);
  const run = (queue ?? wait(TV_START_DELAY_MS)).then(() => resolveLiveVideoId(channelId));
  queue = run.catch(() => null).then(() => wait(TV_GAP_MS));
  return run;
}

export async function resolveLiveVideoId(channelId: string): Promise<string | null> {
  const hit = cache.get(channelId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.videoId;

  let videoId: string | null = null;
  try {
    const res = await fetchWithTimeout(`https://www.youtube.com/channel/${channelId}/live`, {
      headers: { 'Accept-Language': 'en-US,en;q=0.9' },
    });
    if (res.ok) videoId = extractLiveVideoId(await res.text());
  } catch {
    videoId = null;
  }

  cache.set(channelId, { at: Date.now(), videoId });
  if (videoId) remember(channelId, videoId);
  return videoId;
}

/** Pulls the JSON that follows a marker out of an HTML page. */
function extractJsonAfter(html: string, marker: string): string | null {
  const at = html.indexOf(marker);
  if (at < 0) return null;
  const start = html.indexOf('{', at + marker.length);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  return null;
}

function extractLiveVideoId(html: string): string | null {
  // The markers are found by a quick text search, so they are tried first;
  // cutting out and reading the whole player response is far slower.
  const marked =
    html.match(/"liveStreamability":\{"liveStreamabilityRenderer":\{"videoId":"([\w-]{11})"/)?.[1] ??
    html.match(/"videoDetails":\{[^{}]*?"videoId":"([\w-]{11})"[^{}]*?"isLive":true/)?.[1];
  if (marked) return marked;

  // The player response on the /live page knows the current stream.
  const json = extractJsonAfter(html, 'ytInitialPlayerResponse = ');
  if (json) {
    try {
      const player = JSON.parse(json);
      const live = player?.liveStreamability?.liveStreamabilityRenderer?.videoId;
      if (live) return live;
      if (player?.videoDetails?.isLive && player.videoDetails.videoId) {
        return player.videoDetails.videoId as string;
      }
    } catch {
      // Nothing more to try.
    }
  }
  return null;
}
