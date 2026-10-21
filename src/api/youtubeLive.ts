// YouTube removed permanent live-stream embeds, so a channel's current stream
// has to be looked up first. The channel's /live page carries a player
// response that says what is on air right now.

import { fetchWithTimeout } from './http';

const CACHE_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; videoId: string | null }>();

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
      // Fall through to the text markers below.
    }
  }

  const live = html.match(
    /"liveStreamability":\{"liveStreamabilityRenderer":\{"videoId":"([\w-]{11})"/,
  );
  if (live) return live[1];

  const details = html.match(/"videoDetails":\{[^{}]*?"videoId":"([\w-]{11})"[^{}]*?"isLive":true/);
  if (details) return details[1];

  return null;
}
