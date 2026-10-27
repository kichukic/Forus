import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';
import { WebView } from 'react-native-webview';
import type { ReelItem as ReelItemType } from '../api/reels';
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

  return (
    <View style={styles.container}>
      {/* Background Poster / Thumbnail while loading or when inactive */}
      <Image
        source={{ uri: item.thumbnailUrl }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />

      {/* Media Player */}
      {shouldLoad && (
        <View style={StyleSheet.absoluteFill}>
          {item.source.type === 'youtube' ? (
            <YouTubePlayer
              videoId={item.source.videoId}
              playing={isActive && !paused}
              muted={muted}
            />
          ) : (
            <DirectPlayer
              url={item.source.url}
              playing={isActive && !paused}
              muted={muted}
            />
          )}
        </View>
      )}

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
        muted={muted}
        onToggleMute={onToggleMute}
        onPlayFullMovie={onPlayFullMovie}
        onBack={onBack}
      />
    </View>
  );
}

function DirectPlayer({
  url,
  playing,
  muted,
}: {
  url: string;
  playing: boolean;
  muted: boolean;
}) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.muted = muted;
    if (playing) p.play();
  });

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
}: {
  videoId: string;
  playing: boolean;
  muted: boolean;
}) {
  const webViewRef = useRef<WebView>(null);

  useEffect(() => {
    if (!webViewRef.current) return;
    const cmd = playing ? 'playVideo' : 'pauseVideo';
    webViewRef.current.injectJavaScript(`
      try {
        var frame = document.querySelector('iframe');
        if (frame) {
          frame.contentWindow.postMessage('{"event":"command","func":"${cmd}","args":""}', '*');
        }
      } catch (e) {}
      true;
    `);
  }, [playing]);

  useEffect(() => {
    if (!webViewRef.current) return;
    const cmd = muted ? 'mute' : 'unMute';
    webViewRef.current.injectJavaScript(`
      try {
        var frame = document.querySelector('iframe');
        if (frame) {
          frame.contentWindow.postMessage('{"event":"command","func":"${cmd}","args":""}', '*');
        }
      } catch (e) {}
      true;
    `);
  }, [muted]);

  const embedHtml = `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; background-color: #000; }
  html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
  .video-container {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 100vw;
    height: 177.77vw;
    min-height: 100vh;
    min-width: 56.25vh;
    transform: translate(-50%, -50%);
  }
  iframe {
    width: 100%;
    height: 100%;
    border: none;
    pointer-events: none;
  }
</style>
</head>
<body>
  <div class="video-container">
    <iframe
      src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=${muted ? 1 : 0}&controls=0&loop=1&playlist=${videoId}&playsinline=1&rel=0&iv_load_policy=3&enablejsapi=1&origin=https://mytvstream.app"
      allow="autoplay; encrypted-media"
      allowfullscreen
    ></iframe>
  </div>
</body>
</html>
  `;

  return (
    <WebView
      ref={webViewRef}
      source={{ html: embedHtml }}
      style={StyleSheet.absoluteFill}
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      javaScriptEnabled
      scrollEnabled={false}
      pointerEvents="none"
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
