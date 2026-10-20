import type { YouTubePlayable } from '../types';
import {
  extractCobalt,
  extractConsumet,
  extractInvidious,
  extractPiped,
  invidiousEmbedInstances,
  type Media,
} from './extractors';
import { isBlocked, isCoolingDown, markFailed, markWorked } from './sourceHealth';
import { resolveLiveVideoId } from './youtubeLive';

// YouTube refuses embeds that arrive without a page origin, so the player page
// is given one. It doesn't need to exist.
export const ORIGIN = 'https://mytvstream.app';

// The app draws its own controls, so YouTube's are switched off, along with its
// annotations, keyboard shortcuts and fullscreen button.
const YT_PARAMS = [
  'autoplay=1',
  'enablejsapi=1',
  'playsinline=1',
  'controls=0',
  'rel=0',
  'iv_load_policy=3',
  'fs=0',
  'disablekb=1',
  'cc_load_policy=0',
  `origin=${encodeURIComponent(ORIGIN)}`,
].join('&');

export type Source = {
  /** Unique per source, also used as the health key. */
  id: string;
  label: string;
  /** Provider family: "youtube", "vidsrc", "cobalt", ... */
  provider: string;
  /** How it is played: the YouTube iframe API, a plain video element, or the native player. */
  transport: 'yt' | 'dom' | 'native';
  /** Loaded by the WebView. */
  url?: string;
  html?: string;
  /** Played by the native player instead of a WebView. */
  media?: { url: string; kind: 'hls' | 'file' };
};

/**
 * The contract every source has to meet:
 *   window.cmd('toggle' | 'seek' | 'play', arg) drives playback
 *   window.ReactNativeWebView.postMessage({type:'ready'|'state'|'error', data})
 * The YouTube iframe page implements it inline; every other page gets the
 * bridge injected once it has loaded.
 */
export const BRIDGE_JS = `
(function () {
  if (window.__mytvBridge) return;
  window.__mytvBridge = true;
  function post(type, data) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, data: data })); } catch (e) {}
  }
  function findVideo() {
    var v = document.querySelector('video');
    if (v) return v;
    // Some players sit in a same-origin frame of their own.
    var frames = document.querySelectorAll('iframe');
    for (var i = 0; i < frames.length; i++) {
      try {
        var doc = frames[i].contentDocument;
        var inner = doc && doc.querySelector('video');
        if (inner) return inner;
      } catch (e) {}
    }
    return null;
  }
  window.cmd = function (name, arg) {
    var v = findVideo();
    if (!v) return;
    if (name === 'toggle') { v.paused ? v.play() : v.pause(); }
    else if (name === 'seek') { try { v.currentTime = Math.max(0, (v.currentTime || 0) + (arg || 0)); } catch (e) {} }
    else if (name === 'seekTo') { try { v.currentTime = Math.max(0, arg || 0); } catch (e) {} }
    else if (name === 'play') { v.play(); }
    else if (name === 'pause') { v.pause(); }
  };
  function state() { var v = findVideo(); return v ? (v.paused ? 2 : 1) : 0; }
  var waits = 0;
  var timer = setInterval(function () {
    var v = findVideo();
    if (v) {
      clearInterval(timer);
      post('ready');
      v.addEventListener('error', function () { post('error', 'media'); });
      v.addEventListener('play', function () { post('state', 1); });
      v.addEventListener('pause', function () { post('state', 2); });
      setInterval(function () { post('state', state()); }, 1000);
      setInterval(function () { post('time', { t: v.currentTime || 0, d: v.duration || 0 }); }, 500);
    } else if (document.querySelector('iframe')) {
      // A player that lives on another site: it plays, but the remote can't steer it.
      clearInterval(timer);
      post('ready', 'external');
    } else if (++waits > 16) {
      clearInterval(timer);
      post('error', 'no-video');
    }
  }, 500);
})();`;

/** The official YouTube iframe player. */
function ytEmbedHtml(embedUrl: string): string {
  return `<!doctype html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}iframe{border:0;width:100%;height:100%;pointer-events:none}</style>
</head><body>
<iframe id="p" src="${embedUrl}" allow="autoplay; encrypted-media; fullscreen"></iframe>
<script>
  var player;
  function send(type, data) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, data: data }));
  }
  function onYouTubeIframeAPIReady() {
    player = new YT.Player('p', {
      events: {
        onReady: function (e) {
          e.target.playVideo();
          send('ready');
          // The app draws its own seek bar from these.
          setInterval(function () {
            if (!player.getCurrentTime) return;
            send('time', { t: player.getCurrentTime(), d: player.getDuration() });
          }, 500);
        },
        onError: function (e) { send('error', e.data); },
        onStateChange: function (e) { send('state', e.data); }
      }
    });
  }
  window.cmd = function (name, arg) {
    if (!player || !player.getPlayerState) return;
    if (name === 'toggle') {
      player.getPlayerState() === YT.PlayerState.PLAYING ? player.pauseVideo() : player.playVideo();
    } else if (name === 'seek') {
      player.seekTo(player.getCurrentTime() + arg, true);
    } else if (name === 'seekTo') {
      player.seekTo(arg, true);
    } else if (name === 'play') {
      player.playVideo();
    } else if (name === 'pause') {
      player.pauseVideo();
    }
  };
</script>
<script src="https://www.youtube.com/iframe_api"></script>
</body></html>`;
}

function ytSource(videoId: string): Source {
  return {
    id: 'youtube',
    label: 'YouTube',
    provider: 'youtube',
    transport: 'yt',
    html: ytEmbedHtml(ytEmbedUrl(videoId)),
  };
}

function ytEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}?${YT_PARAMS}`;
}

function pageSource(id: string, label: string, provider: string, url: string): Source {
  return { id, label, provider, transport: 'dom', url };
}

/** The official YouTube sources. These start playing right away. */
export async function getPrimarySources(item: YouTubePlayable): Promise<Source[]> {
  const sources: Source[] = [];

  if (item.kind === 'live') {
    const liveId = await resolveLiveVideoId(item.channelId);
    if (liveId && !isBlocked(`embed:${item.channelId}`)) {
      sources.push(ytSource(liveId));
    }
    sources.push(
      pageSource(
        'youtube-live',
        'YouTube live page',
        'youtube',
        `https://www.youtube.com/channel/${item.channelId}/live`,
      ),
    );
    sources.push({
      id: 'youtube-legacy',
      label: 'YouTube (legacy embed)',
      provider: 'youtube',
      transport: 'yt',
      html: ytEmbedHtml(
        `https://www.youtube.com/embed/live_stream?channel=${item.channelId}&${YT_PARAMS}`,
      ),
    });
    return sources;
  }

  const videoId = item.videoId;
  if (!isBlocked(`embed:${videoId}`)) {
    sources.push(ytSource(videoId));
  }
  sources.push(
    pageSource('youtube-page', 'YouTube watch page', 'youtube', `https://www.youtube.com/watch?v=${videoId}`),
  );
  sources.push(
    pageSource(
      'youtube-mobile',
      'YouTube mobile',
      'youtube',
      `https://m.youtube.com/watch?v=${videoId}`,
    ),
  );
  return sources;
}

/** Third-party embed frontends. They are tried after the direct streams. */
export async function getFrontendSources(item: YouTubePlayable): Promise<Source[]> {
  const sources: Source[] = [];

  if (item.kind === 'live') {
    const liveId = await resolveLiveVideoId(item.channelId);
    if (!liveId) return sources;
    sources.push(
      pageSource('vidsrc', 'VidSrc', 'vidsrc', `https://vidsrc.sh/embed/youtube/${liveId}`),
    );
    sources.push(
      pageSource('piped', 'Piped', 'piped', `https://piped.video/embed/watch?v=${liveId}`),
    );
    return sources;
  }

  const videoId = item.videoId;
  sources.push(
    pageSource('vidsrc', 'VidSrc', 'vidsrc', `https://vidsrc.sh/embed/youtube/${videoId}`),
  );
  sources.push(
    pageSource('vidsrc-alt', 'VidSrc (alt)', 'vidsrc', `https://vidsrc.me/embed/youtube/${videoId}`),
  );
  sources.push(
    pageSource('piped', 'Piped', 'piped', `https://piped.video/embed/watch?v=${videoId}`),
  );
  for (const host of await invidiousEmbedInstances()) {
    sources.push(
      pageSource(`invidious:${host}`, 'Invidious', 'invidious', `${host}/embed/${videoId}`),
    );
  }
  return sources;
}

/** Sources that resolve a direct stream through a third-party extractor. */
export async function getDirectSources(item: YouTubePlayable): Promise<Source[]> {
  if (item.kind !== 'video') return [];
  const videoId = item.videoId;

  // Every extractor is tried at the same time: they are independent, and
  // waiting for one that is down would hold up the others.
  const attempts: [string, string, () => Promise<Media | null>][] = [
    ['cobalt', 'Cobalt', () => extractCobalt(videoId)],
    ['piped-api', 'Piped (direct)', () => extractPiped(videoId)],
    ['invidious-api', 'Invidious (direct)', () => extractInvidious(videoId)],
    ['consumet', 'Consumet', () => extractConsumet(videoId)],
  ];

  const found = await Promise.all(
    attempts.map(async ([provider, label, run]): Promise<Source | null> => {
      if (isCoolingDown(provider)) return null;
      try {
        const media = await run();
        if (!media) {
          markFailed(provider);
          return null;
        }
        markWorked(provider);
        return {
          id: provider,
          label,
          provider,
          transport: 'native',
          media: { url: media.url, kind: media.kind },
        };
      } catch {
        markFailed(provider);
        return null;
      }
    }),
  );

  return found.filter((s): s is Source => s !== null);
}
