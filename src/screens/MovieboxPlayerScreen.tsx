// Plays a film or an episode from MovieBox. The file is asked for by name
// first, because the link itself expires and has to be fetched again when it
// has gone stale.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useEvent, useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { captions, directStream, playableRows, seasonList, type MovieboxCaption, type MovieboxSeason } from '../api/moviebox';
import { shareMoviebox } from '../chat/share';
import { cueAt, parseSrt, type SubtitleCue } from '../api/subtitles';
import { RelatedPanel } from '../components/RelatedPanel';
import { VideoOverlay } from '../components/VideoOverlay';
import { AudioTrackPicker } from '../components/AudioTrackPicker';
import { useAudioTracks, audioTrackLabel } from '../hooks/useAudioTracks';
import { useTraktScrobble } from '../hooks/useTraktScrobble';
import { showToast } from '../data/toasts';
import { loadProgress, saveProgress } from '../data/movieboxProgress';
import { useRemoteSeek } from '../hooks/useRemoteSeek';
import { useFullscreenOrientation } from '../hooks/useFullscreenOrientation';
import type { ShellControls } from '../components/PlayerShell';
import { colors, isTV, sz } from '../theme';
import type { MovieboxPlayable, Playable } from '../types';

type Props = {
  item: MovieboxPlayable;
  onClose: () => void;
  // Plays something else from the list under the video.
  onPlay: (item: Playable) => void;
  // Set when the player sits in the mini-player shell (which also pads the top).
  shell?: ShellControls;
};

// How many times a stale link is fetched again before giving up.
const MAX_ATTEMPTS = 3;

export function MovieboxPlayerScreen({ item, onClose, onPlay, shell }: Props) {
  const { width, height } = useWindowDimensions();
  const mini = shell?.mini ?? false;
  // A phone held upright shows the video at the top with its title below.
  const portraitPhone = !isTV && height > width;
  const player = useVideoPlayer(null, (p) => {
    p.staysActiveInBackground = false;
  });
  const fullscreenOrientation = useFullscreenOrientation();
  const { status, error } = useEvent(player, 'statusChange', { status: player.status });
  const { currentTime } = useEvent(player, 'timeUpdate', {
    currentTime: 0,
    currentLiveTimestamp: 0,
    currentOffsetFromLive: 0,
    bufferedPosition: 0,
  });
  const [linkError, setLinkError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // How many times a stale link has been fetched again.
  const attempts = useRef(0);
  // Whether the saved place has already been put back.
  const resumed = useRef(false);
  // The latest time, kept for saving on the way out.
  const latestTime = useRef(0);
  // Stops the next episode from being started twice.
  const playedNext = useRef(false);
  // The subtitles the file has, and the one being shown.
  const [captionOptions, setCaptionOptions] = useState<MovieboxCaption[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  // The words of the subtitle being shown, kept with the language they are
  // for, so the right ones are shown while a new one is on its way.
  const [loaded, setLoaded] = useState<{ id: string; list: SubtitleCue[] } | null>(null);
  useEffect(() => {
    latestTime.current = currentTime ?? 0;
  }, [currentTime]);
  const audio = useAudioTracks(player);
  const [audioPickerOpen, setAudioPickerOpen] = useState(false);
  useTraktScrobble(item.title, currentTime ?? 0, player.duration ?? 0, player.playing);

  const cycleAudio = () => {
    if (!audio.tracks.length) return;
    const currentIdx = audio.tracks.findIndex(
      (t) => (t.id && t.id === audio.selected?.id) || (t.language && t.language === audio.selected?.language),
    );
    const nextIdx = (currentIdx + 1) % audio.tracks.length;
    const nextTrack = audio.tracks[nextIdx];
    audio.select(nextTrack);
    showToast({ text: `Audio: ${audioTrackLabel(nextTrack, nextIdx)}` });
  };

  // On a TV the remote's seek and play/pause keys drive the player, and the
  // native controls are switched off (they eat the D-pad). The overlay below
  // gives the same buttons for anyone who prefers the remote to focus them.
  const [showOverlay, setShowOverlay] = useState(true);
  useRemoteSeek(player, () => setShowOverlay(true));
  useEffect(() => {
    if (!showOverlay) return;
    const timer = setTimeout(() => setShowOverlay(false), 4000);
    return () => clearTimeout(timer);
  }, [showOverlay, currentTime]);

  // A fresh link, fetched from the file's own name.
  const resolve = useCallback(async () => {
    setLoading(true);
    setLinkError(null);
    try {
      const rows = await playableRows(item.subjectId, item.season, item.episode);
      if (rows.length === 0) throw new Error('There is no file for this episode.');
      // The best quality the service has for it.
      const best = rows.reduce((pick, row) => (row.resolution > pick.resolution ? row : pick));
      const stream = await directStream(item.subjectId, best);
      await player.replaceAsync({ uri: stream.url });
      player.play();
      // Put the film back where it was left, once.
      if (!resumed.current) {
        resumed.current = true;
        loadProgress(item.subjectId, item.season, item.episode).then((saved) => {
          if (saved && saved.position > 5 && player.duration > 0 && saved.position < player.duration * 0.95) {
            player.currentTime = saved.position;
          }
        });
      }
      // The subtitles belong to the file, so they are asked for now.
      captions(item.subjectId, best.resourceId)
        .then((list) => {
          setCaptionOptions(list);
          // The first one is shown straight away, if there is one.
          if (list.length > 0) setChosen(list[0].id);
          else setChosen(null);
        })
        .catch(() => setCaptionOptions([]));
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : "This episode can't be played.");
    } finally {
      setLoading(false);
    }
  }, [item.episode, item.season, item.subjectId, player]);

  useEffect(() => {
    // Remember where this film or episode was left.
    const timer = setInterval(() => {
      const t = latestTime.current;
      if (t > 5) saveProgress(item.subjectId, item.season, item.episode, t, player.duration ?? 0);
    }, 10000);
    return () => {
      clearInterval(timer);
      const t = latestTime.current;
      if (t > 5) saveProgress(item.subjectId, item.season, item.episode, t, player.duration ?? 0);
    };
  }, [item.subjectId, item.season, item.episode, player]);

  useEffect(() => {
    playedNext.current = false;
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await resolve();
    })();
    return () => {
      cancelled = true;
    };
  }, [resolve]);

  // A link that has gone stale shows up as a player error, so a new one is
  // fetched and the video is tried again.
  useEffect(() => {
    if (status !== 'error' || attempts.current >= MAX_ATTEMPTS) return;
    attempts.current += 1;
    resolve();
  }, [status, resolve]);

  // Choosing a language brings down its subtitle file.
  useEffect(() => {
    const caption = captionOptions.find((option) => option.id === chosen);
    if (!caption) return;
    let cancelled = false;
    fetch(caption.url)
      .then((res) => res.text())
      .then((text) => !cancelled && setLoaded({ id: caption.id, list: parseSrt(text) }))
      .catch(() => !cancelled && setLoaded({ id: caption.id, list: [] }));
    return () => {
      cancelled = true;
    };
  }, [chosen, captionOptions]);

  // When an episode ends, the next one starts on its own. Films have no
  // "next", so they are left alone.
  useEventListener(player, 'playToEnd', async () => {
    if (item.season === 0 || playedNext.current) return;
    playedNext.current = true;
    try {
      const seasons = await seasonList(item.subjectId);
      const current = seasons.find((s: MovieboxSeason) => s.season === item.season);
      const baseTitle = item.title.replace(/ · Episode \d+$/, '');
      if (current && item.episode < current.episodes) {
        onPlay({ kind: 'moviebox', subjectId: item.subjectId, season: item.season, episode: item.episode + 1, title: `${baseTitle} · Episode ${item.episode + 1}`, poster: item.poster });
        return;
      }
      const nextSeason = seasons.find((s: MovieboxSeason) => s.season === item.season + 1);
      if (nextSeason) {
        onPlay({ kind: 'moviebox', subjectId: item.subjectId, season: nextSeason.season, episode: 1, title: `${baseTitle} · Episode 1`, poster: item.poster });
      }
    } catch {
      // No next episode; leave the player where it is.
    }
  });

  const failure = linkError ?? (status === 'error' ? error?.message ?? 'This file could not be played.' : null);
  const spoken =
    loaded && loaded.id === chosen && loaded.list.length > 0
      ? cueAt(loaded.list, currentTime ?? 0)
      : null;

  return (
    <View style={styles.screen}>
      <VideoView
        player={player}
        style={portraitPhone ? styles.videoPortrait : styles.video}
        // In the corner window a tap opens the player instead.
        nativeControls={!mini && !isTV}
        contentFit="contain"
        fullscreenOptions={{
          enable: !isTV,
          orientation: 'landscape',
          autoExitOnRotate: true,
        }}
        onFullscreenEnter={fullscreenOrientation.onFullscreenEnter}
        onFullscreenExit={fullscreenOrientation.onFullscreenExit}
      />

      {isTV && !mini && (
        <VideoOverlay
          player={player}
          paused={!player.playing}
          time={{ t: currentTime ?? 0, d: player.duration ?? 0 }}
          buffering={loading || status !== 'readyToPlay'}
          show={showOverlay}
          onToggle={() => (player.playing ? player.pause() : player.play())}
          onSeekBy={(seconds) => player.seekBy(seconds)}
          hasMultipleAudio={audio.hasMultiple}
          onCycleAudio={cycleAudio}
        />
      )}

      {/* The words being said, over the video. */}
      {spoken ? (
        <View style={[styles.cue, { bottom: portraitPhone ? (width * 9) / 16 - 44 : 28 }]} pointerEvents="none">
          <Text style={styles.cueText}>{spoken}</Text>
        </View>
      ) : null}

      {!failure && (loading || status !== 'readyToPlay') && (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.overlayText} numberOfLines={2}>
            {item.title}
          </Text>
        </View>
      )}

      {failure && (
        <View style={styles.overlay}>
          <Text style={styles.errorTitle}>{"Couldn&apos;t play this episode"}</Text>
          <Text style={styles.overlayText}>{failure}</Text>
          <Pressable onPress={resolve} style={styles.retry}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      )}

      {portraitPhone && !mini && (
        // Below the video: the title, the subtitles to choose from, and the
        // films to watch next. Dragging the title block down shrinks the
        // player into the corner.
        <RelatedPanel item={item} onPlay={onPlay} dragHandlers={shell?.dragHandlers}>
          <Text style={styles.infoTitle}>{item.title}</Text>
          <View style={styles.infoActions}>
            <Text style={styles.infoNote}>From MovieBox</Text>
            {audio.hasMultiple ? (
              <Pressable
                onPress={() => setAudioPickerOpen(true)}
                style={({ pressed }) => [styles.share, pressed && styles.sharePressed]}
              >
                <Ionicons name="volume-high-outline" size={15} color={colors.accent} />
                <Text style={[styles.shareText, { color: colors.accent }]}>
                  {audio.selected ? audioTrackLabel(audio.selected) : 'Audio'}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => shareMoviebox({ id: item.subjectId, title: item.title, poster: item.poster })}
              style={({ pressed }) => [styles.share, pressed && styles.sharePressed]}
            >
              <Ionicons name="paper-plane-outline" size={15} color={colors.text} />
              <Text style={styles.shareText}>Send to a friend</Text>
            </Pressable>
          </View>
          {captionOptions.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.captionRow}
            >
              {captionOptions.map((option) => (
                <Pressable
                  key={option.id}
                  onPress={() => setChosen(option.id === chosen ? '' : option.id)}
                  style={({ pressed }) => [
                    styles.caption,
                    chosen === option.id && styles.captionOn,
                    pressed && styles.captionPressed,
                  ]}
                >
                  <Text style={[styles.captionText, chosen === option.id && styles.captionTextOn]}>
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </RelatedPanel>
      )}

      {!isTV && !mini && (
        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={[styles.close, { top: (portraitPhone ? (width * 9) / 16 : 0) + 8 }]}
        >
          <Ionicons name="close" size={18} color="#fff" />
        </Pressable>
      )}

      {!isTV && !mini && shell && (
        <Pressable onPress={shell.minimize} hitSlop={12} style={styles.minimize}>
          <Ionicons name="chevron-down" size={20} color="#fff" />
        </Pressable>
      )}

      <AudioTrackPicker
        visible={audioPickerOpen}
        tracks={audio.tracks}
        selected={audio.selected}
        onSelect={audio.select}
        onClose={() => setAudioPickerOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  video: { flex: 1 },
  videoPortrait: { width: '100%', aspectRatio: 16 / 9 },
  infoTitle: { color: colors.text, fontSize: 17, fontWeight: '700', lineHeight: 24 },
  infoNote: { color: colors.muted, fontSize: 13 },
  infoActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, gap: 10, flexWrap: 'wrap' },
  share: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surfaceRaised,
  },
  sharePressed: { opacity: 0.6 },
  shareText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  captionRow: { gap: 8, paddingTop: 12, paddingRight: 40 },
  caption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  captionOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  captionPressed: { opacity: 0.7 },
  captionText: { color: colors.muted, fontSize: 12.5, fontWeight: '700' },
  captionTextOn: { color: '#fff' },
  cue: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  cueText: {
    color: '#fff',
    fontSize: sz(14, 18),
    lineHeight: sz(20, 25),
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  overlayText: { color: colors.text, fontSize: sz(16, 20), marginTop: 16, textAlign: 'center' },
  errorTitle: { color: colors.text, fontSize: sz(20, 26), fontWeight: '800' },
  retry: {
    marginTop: 18,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: colors.accent,
  },
  retryText: { color: '#fff', fontSize: sz(14, 16), fontWeight: '800' },
  minimize: {
    position: 'absolute',
    top: 8,
    left: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  minimizeText: { color: '#fff', fontSize: 22, fontWeight: '800', lineHeight: 22 },
  close: {
    position: 'absolute',
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  closeText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
