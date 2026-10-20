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

export type Source = {
  /** Unique per source, also used as the health key. */
  id: string;
  label: string;
  /** Provider family: "youtube", "vidsrc", "cobalt", ... */
  provider: string;
  /** How playback is driven: the YouTube iframe API, or a plain video element. */
  transport: 'yt' | 'dom';
  /** Loaded by the WebView. */
  url?: string;
  html?: string;
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
    else if (name === 'play') { v.play(); }
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

/** A page that plays the stream itself, with the bridge built in. */
function directHtml(media: Media): string {
  const setup =
    media.kind === 'hls'
      ? `
    if (window.Hls && Hls.isSupported()) {
      var hls = new Hls({ lowLatencyMode: true, backBufferLength: 60 });
      hls.loadSource(URL);
      hls.attachMedia(v);
    } else {
      v.src = URL;
    }`
      : `
    v.src = URL;`;

  return `<!doctype html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}video{width:100%;height:100%;object-fit:contain;background:#000}</style>
</head><body>
<video id="v" playsinline autoplay controls></video>
<script>${BRIDGE_JS}</script>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js"></script>
<script>
  var v = document.getElementById('v');
  var URL = ${JSON.stringify(media.url)};
  ${setup}
</script>
</body></html>`;
}

/** The official YouTube iframe player. */
function ytEmbedHtml(embedUrl: string): string {
  return `<!doctype html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}iframe{border:0;width:100%;height:100%}</style>
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
        onReady: function (e) { e.target.playVideo(); send('ready'); },
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
    } else if (name === 'play') {
      player.playVideo();
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
  const params = `autoplay=1&enablejsapi=1&playsinline=1&rel=0&origin=${encodeURIComponent(ORIGIN)}`;
  return `https://www.youtube.com/embed/${videoId}?${params}`;
}

function pageSource(id: string, label: string, provider: string, url: string): Source {
  return { id, label, provider, transport: 'dom', url };
}

/** Sources that need no network call, tried before the slower extractors. */
export async function getPrimarySources(item: YouTubePlayable): Promise<Source[]> {
  const sources: Source[] = [];

  if (item.kind === 'live') {
    const liveId = await resolveLiveVideoId(item.channelId);
    const blocked = isBlocked(`embed:${item.channelId}`);
    if (liveId && !blocked) {
      sources.push(ytSource(liveId));
      sources.push(
        pageSource('vidsrc', 'VidSrc', 'vidsrc', `https://vidsrc.net/embed/youtube/${liveId}`),
      );
      sources.push(
        pageSource('piped', 'Piped', 'piped', `https://piped.video/embed/watch?v=${liveId}`),
      );
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
        `https://www.youtube.com/embed/live_stream?channel=${item.channelId}&autoplay=1&enablejsapi=1&playsinline=1&rel=0&origin=${encodeURIComponent(ORIGIN)}`,
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
  sources.push(
    pageSource('vidsrc', 'VidSrc', 'vidsrc', `https://vidsrc.net/embed/youtube/${videoId}`),
  );
  sources.push(
    pageSource('piped', 'Piped', 'piped', `https://piped.video/embed/watch?v=${videoId}`),
  );
  return sources;
}

/** Sources that need an extra network call, so they arrive after playback starts. */
export async function getExtraSources(item: YouTubePlayable): Promise<Source[]> {
  const sources: Source[] = [];

  if (item.kind === 'video') {
    for (const host of await invidiousEmbedInstances()) {
      sources.push(
        pageSource(`invidious:${host}`, 'Invidious', 'invidious', `${host}/embed/${item.videoId}`),
      );
    }
  }

  sources.push(...(await getDirectSources(item)));
  return sources;
}

/** Sources that resolve a direct stream through a third-party extractor. */
async function getDirectSources(item: YouTubePlayable): Promise<Source[]> {
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
          transport: 'dom',
          html: directHtml(media),
        };
      } catch {
        markFailed(provider);
        return null;
      }
    }),
  );

  return found.filter((s): s is Source => s !== null);
}
