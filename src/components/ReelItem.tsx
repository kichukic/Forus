import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEvent } from 'expo';
import { Image } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';
import { WebView } from 'react-native-webview';
import { fetchReelEpisodes, type ReelDramaEpisode, type ReelItem as ReelItemType } from '../api/reels';
import { ORIGIN } from '../api/sources';
import { DramaEpisodesSheet } from './DramaEpisodesSheet';
import { ReelOverlay } from './ReelOverlay';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type Props = {
  item: ReelItemType;
  isActive: boolean;
  shouldLoad: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onPlayFullMovie?: () => void;
  onBack?: () => void;
};

export function ReelItem({
  item,
  isActive,
  shouldLoad,
  muted,
  onToggleMute,
  onPlayFullMovie,
  onBack,
}: Props) {
  const [paused, setPaused] = useState(false);
  const [prevActive, setPrevActive] = useState(isActive);
  if (prevActive !== isActive) {
    setPrevActive(isActive);
    if (isActive) setPaused(false);
  }

  const [showHeart, setShowHeart] = useState(false);
  const heartAnim = useState(() => new Animated.Value(0))[0];
  const lastTapRef = useRef<number>(0);

  // In-Reels Episodes State
  const [episodes, setEpisodes] = useState<ReelDramaEpisode[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [showEpisodesSheet, setShowEpisodesSheet] = useState(false);
  const [currentEpisode, setCurrentEpisode] = useState<ReelDramaEpisode | null>(null);

  // Background episode preloading without synchronous setState in effect
  useEffect(() => {
    let alive = true;
    if (isActive && (item.category === 'drama' || item.relatedPlayable?.kind === 'moviebox')) {
      fetchReelEpisodes(item)
        .then((list) => {
          if (alive) setEpisodes(list);
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [isActive, item]);

  const activeSource = currentEpisode?.streamUrl
    ? { type: 'direct' as const, url: currentEpisode.streamUrl }
    : currentEpisode?.videoId
    ? { type: 'youtube' as const, videoId: currentEpisode.videoId }
    : item.source;

  const displayTitle = currentEpisode
    ? `${item.title.replace(/\s*-\s*ep\s*\d+/i, '').replace(/\s*-\s*s\d+e\d+.*$/i, '')} · Ep ${currentEpisode.episode}`
    : item.title;

  const activeEpNum = currentEpisode?.episode ?? (item.category === 'drama' ? 1 : undefined);
  const nextEp = episodes.find((e) => e.episode === (activeEpNum ?? 1) + 1);

  const handleNextEpisode = () => {
    if (nextEp) {
      setCurrentEpisode(nextEp);
      setPaused(false);
    }
  };

  const handleSelectEpisode = (ep: ReelDramaEpisode) => {
    setCurrentEpisode(ep);
    setShowEpisodesSheet(false);
    setPaused(false);
  };

  const handleOpenEpisodes = () => {
    setShowEpisodesSheet(true);
    if (episodes.length === 0 && !episodesLoading) {
      setEpisodesLoading(true);
      fetchReelEpisodes(item)
        .then((list) => {
          setEpisodes(list);
        })
        .catch(() => {})
        .finally(() => {
          setEpisodesLoading(false);
        });
    }
  };

  const handlePress = () => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;

    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      // Double tap detected: trigger heart burst
      setShowHeart(true);
      heartAnim.setValue(0);
      Animated.sequence([
        Animated.spring(heartAnim, { toValue: 1, friction: 4, useNativeDriver: true }),
        Animated.timing(heartAnim, { toValue: 0, duration: 250, delay: 350, useNativeDriver: true }),
      ]).start(() => setShowHeart(false));
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
      // Single tap after a brief delay if not a double tap
      setTimeout(() => {
        if (Date.now() - lastTapRef.current >= DOUBLE_TAP_DELAY - 50 && lastTapRef.current !== 0) {
          setPaused((p) => !p);
        }
      }, DOUBLE_TAP_DELAY);
    }
  };

  const playerKey = activeSource.type === 'youtube' ? activeSource.videoId : activeSource.url;
  const isDrama = item.category === 'drama' || item.relatedPlayable?.kind === 'moviebox' || episodes.length > 0;

  // Zero-flicker poster overlay: smoothly dissolves once video playback begins
  const posterOpacity = useState(() => new Animated.Value(1))[0];

  useEffect(() => {
    if (!shouldLoad) {
      posterOpacity.setValue(1);
      return;
    }

    // Safety timeout: ensure poster dissolves after 2.8s even if playing event was delayed
    const timer = setTimeout(() => {
      Animated.timing(posterOpacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }, 2800);

    return () => clearTimeout(timer);
  }, [shouldLoad, playerKey, posterOpacity]);

  const handleVideoPlaying = useCallback(() => {
    Animated.timing(posterOpacity, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [posterOpacity]);

  return (
    <View style={styles.container}>
      {/* Background Poster / Thumbnail while loading or when inactive */}
      <Image
        source={{ uri: item.thumbnailUrl }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />

      {/* Media Player - rendered strictly when active to eliminate Chromium multi-process contention */}
      {shouldLoad && (
        <View style={StyleSheet.absoluteFill}>
          {activeSource.type === 'youtube' ? (
            <YouTubePlayer
              key={playerKey}
              videoId={activeSource.videoId}
              playing={isActive && !paused}
              muted={muted}
              onPlaying={handleVideoPlaying}
            />
          ) : (
            <DirectPlayer
              key={playerKey}
              url={activeSource.url}
              playing={isActive && !paused}
              muted={muted}
              onPlaying={handleVideoPlaying}
            />
          )}
        </View>
      )}

      {/* Seamless Poster Overlay: Dissolves into the video with 0 black flash or loading spinner */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            opacity: posterOpacity,
          },
        ]}
        pointerEvents="none"
      >
        <Image
          source={{ uri: item.thumbnailUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
      </Animated.View>

      {/* Tap Gesture Catcher (covers full screen behind overlay buttons) */}
      <Pressable style={StyleSheet.absoluteFill} onPress={handlePress} />

      {/* Paused Indicator */}
      {paused && isActive && (
        <View style={styles.centerIconWrap} pointerEvents="none">
          <View style={styles.pauseCircle}>
            <Ionicons name="play" size={38} color="rgba(255,255,255,0.9)" style={{ marginLeft: 4 }} />
          </View>
        </View>
      )}

      {/* Animated Heart Burst on Double Tap */}
      {showHeart && (
        <Animated.View
          style={[
            styles.centerIconWrap,
            {
              opacity: heartAnim,
              transform: [
                {
                  scale: heartAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.3, 1.3],
                  }),
                },
              ],
            },
          ]}
          pointerEvents="none"
        >
          <Ionicons name="heart" size={90} color="#ff3b30" />
        </Animated.View>
      )}

      {/* Overlay Actions & Details */}
      <ReelOverlay
        item={item}
        displayTitle={displayTitle}
        muted={muted}
        onToggleMute={onToggleMute}
        onPlayFullMovie={onPlayFullMovie}
        onBack={onBack}
        activeEpisode={activeEpNum}
        totalEpisodes={episodes.length > 0 ? episodes.length : undefined}
        onOpenEpisodes={isDrama ? handleOpenEpisodes : undefined}
        onNextEpisode={nextEp ? handleNextEpisode : undefined}
      />

      {/* In-Reels All Episodes Drawer */}
      <DramaEpisodesSheet
        visible={showEpisodesSheet}
        onClose={() => setShowEpisodesSheet(false)}
        dramaTitle={item.title}
        author={item.author}
        currentEpisode={activeEpNum ?? 1}
        episodes={episodes}
        loading={episodesLoading}
        onSelectEpisode={handleSelectEpisode}
        onPlayFullMovie={onPlayFullMovie}
      />
    </View>
  );
}

function DirectPlayer({
  url,
  playing,
  muted,
  onPlaying,
}: {
  url: string;
  playing: boolean;
  muted: boolean;
  onPlaying?: () => void;
}) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.muted = muted;
    if (playing) p.play();
  });

  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });

  useEffect(() => {
    if (isPlaying) {
      onPlaying?.();
    }
  }, [isPlaying, onPlaying]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    player.muted = muted;
  }, [player, muted]);

  useEffect(() => {
    if (playing) {
      player.play();
    } else {
      player.pause();
    }
  }, [player, playing]);

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      nativeControls={false}
    />
  );
}

function YouTubePlayer({
  videoId,
  playing,
  muted,
  onPlaying,
}: {
  videoId: string;
  playing: boolean;
  muted: boolean;
  onPlaying?: () => void;
}) {
  const webViewRef = useRef<WebView>(null);

  useEffect(() => {
    if (!webViewRef.current) return;
    const cmd = playing ? 'play' : 'pause';
    webViewRef.current.injectJavaScript(`try { window.cmd('${cmd}'); } catch (e) {} true;`);
  }, [playing]);

  useEffect(() => {
    if (!webViewRef.current) return;
    const cmd = muted ? 'mute' : 'unmute';
    webViewRef.current.injectJavaScript(`try { window.cmd('${cmd}'); } catch (e) {} true;`);
  }, [muted]);

  const embedHtml = `
<!doctype html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 100%;
    height: 100%;
    background: #000000;
    overflow: hidden;
  }
  .video-container {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 100vw;
    height: 100vh;
    min-height: 100vh;
    min-width: 100vw;
    /* Full-bleed edge crop: 1.22x scale pushes YouTube top header and bottom watermark outside viewport */
    transform: translate(-50%, -50%) scale(1.22);
    transform-origin: center center;
    overflow: hidden;
  }
  iframe {
    width: 100%;
    height: 100%;
    border: 0;
    pointer-events: none;
  }
</style>
</head><body>
<div class="video-container">
  <iframe
    id="p"
    src="https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1&playsinline=1&controls=0&rel=0&iv_load_policy=3&fs=0&disablekb=1&cc_load_policy=0&modestbranding=1&showinfo=0&autohide=1&origin=${encodeURIComponent(ORIGIN)}"
    allow="autoplay; encrypted-media"
  ></iframe>
</div>
<script>
  var player;
  function sendMsg(type) {
    try {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: type }));
      }
    } catch (e) {}
  }
  function onYouTubeIframeAPIReady() {
    player = new YT.Player('p', {
      events: {
        onReady: function(e) {
          if (${muted ? 'true' : 'false'}) e.target.mute();
          if (${playing ? 'true' : 'false'}) e.target.playVideo();
        },
        onStateChange: function(e) {
          if (e.data === 1) {
            sendMsg('playing');
          } else if (e.data === 0) {
            e.target.seekTo(0);
            e.target.playVideo();
          }
        }
      }
    });
  }
  window.cmd = function(action) {
    if (!player) return;
    if (action === 'play') { try { player.playVideo(); } catch(e){} }
    else if (action === 'pause') { try { player.pauseVideo(); } catch(e){} }
    else if (action === 'mute') { try { player.mute(); } catch(e){} }
    else if (action === 'unmute') { try { player.unMute(); } catch(e){} }
  };
</script>
<script src="https://www.youtube.com/iframe_api"></script>
</body></html>
  `;

  return (
    <WebView
      ref={webViewRef}
      source={{ html: embedHtml, baseUrl: ORIGIN }}
      style={StyleSheet.absoluteFill}
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      androidLayerType="hardware"
      javaScriptEnabled
      domStorageEnabled
      scrollEnabled={false}
      pointerEvents="none"
      onMessage={(event) => {
        try {
          const data = JSON.parse(event.nativeEvent.data);
          if (data?.type === 'playing') {
            onPlaying?.();
          }
        } catch {}
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
  centerIconWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  pauseCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
