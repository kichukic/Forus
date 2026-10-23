import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { getApiKey, getStreamUrl } from '../api/torbox';
import { searchByName as searchSubtitles, loadSubtitle } from '../api/opensubtitles';
import { cueAt, type SubtitleCue } from '../api/subtitles';
import type { ShellControls } from '../components/PlayerShell';
import { useFullscreenOrientation } from '../hooks/useFullscreenOrientation';
import { Loader } from '../components/Loader';
import { RelatedPanel } from '../components/RelatedPanel';
import { VideoOverlay } from '../components/VideoOverlay';
import { useRemoteSeek } from '../hooks/useRemoteSeek';
import { colors, isTV, sz } from '../theme';
import type { FilePlayable, Playable } from '../types';

type Props = {
  item: FilePlayable;
  onClose: () => void;
  // Plays something from the related list under the video.
  onPlay: (item: Playable) => void;
  // Set when the player sits in the mini-player shell (which also pads the top).
  shell?: ShellControls;
};

// Plays a file from the user's TorBox cloud in the app's own video player.
export function FilePlayerScreen({ item, onClose, onPlay, shell }: Props) {
  const { width, height } = useWindowDimensions();
  const mini = shell?.mini ?? false;
  // A phone held upright shows the video at the top with its title below.
  const portraitPhone = !isTV && height > width;
  const player = useVideoPlayer(null, (p) => {
    p.staysActiveInBackground = false;
  });
  const fullscreenOrientation = useFullscreenOrientation();
  const { status, error } = useEvent(player, 'statusChange', { status: player.status });
  const { currentTime } = useEvent(player, 'timeUpdate', { currentTime: 0, currentLiveTimestamp: 0, currentOffsetFromLive: 0, bufferedPosition: 0 });
  const [showOverlay, setShowOverlay] = useState(true);
  useRemoteSeek(player, () => setShowOverlay(true));
  useEffect(() => {
    if (!showOverlay) return;
    const timer = setTimeout(() => setShowOverlay(false), 4000);
    return () => clearTimeout(timer);
  }, [showOverlay, currentTime]);
  const [linkError, setLinkError] = useState<string | null>(null);
  // Subtitles for this file, searched on OpenSubtitles.
  const [captionOptions, setCaptionOptions] = useState<{ id: string; name: string; language: string; rating: string; downloads: number; url: string }[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ id: string; list: SubtitleCue[] } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLang, setSearchLang] = useState('eng');
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const key = await getApiKey();
      if (!key) throw new Error('TorBox is not connected.');
      const url = await getStreamUrl(key, item);
      if (cancelled) return;
      await player.replaceAsync({ uri: url });
      player.play();
    })().catch((e) => !cancelled && setLinkError(String(e.message ?? e)));
    return () => {
      cancelled = true;
    };
  }, [item, player]);

  const spoken =
    loaded && loaded.id === chosen && loaded.list.length > 0
      ? cueAt(loaded.list, currentTime ?? 0)
      : null;

  // Bring down the subtitle file when one is chosen.
  useEffect(() => {
    const option = captionOptions.find((o) => o.id === chosen);
    if (!option) return;
    let cancelled = false;
    loadSubtitle(option.url)
      .then((list) => !cancelled && setLoaded({ id: option.id, list }))
      .catch(() => !cancelled && setLoaded({ id: option.id, list: [] }));
    return () => {
      cancelled = true;
    };
  }, [chosen, captionOptions]);

  const failure = linkError ?? (status === 'error' ? error?.message ?? 'This file could not be played.' : null);

  const runSubtitleSearch = async () => {
    const q = searchQuery.trim() || cleanName(item.title);
    if (q.length < 2) return;
    setSearching(true);
    try {
      const results = await searchSubtitles(q, searchLang);
      setCaptionOptions(results.map((r) => ({ id: r.id, name: r.name, language: r.language, rating: r.rating, downloads: r.downloads, url: r.url })));
    } catch {
      setCaptionOptions([]);
    } finally {
      setSearching(false);
    }
  };

  const cleanName = (name: string) =>
    name.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();

  return (
    <View style={styles.screen}>
      <VideoView
        player={player}
        style={portraitPhone ? styles.videoPortrait : styles.video}
        // In the corner window a tap opens the player instead.
        nativeControls={!mini && !isTV}
        contentFit="contain"
        fullscreenOptions={{ enable: !isTV }}
        onFullscreenEnter={fullscreenOrientation.onFullscreenEnter}
        onFullscreenExit={fullscreenOrientation.onFullscreenExit}
      />

      {spoken ? (
        <View style={[styles.cue, { bottom: 28 }]} pointerEvents="none">
          <Text style={styles.cueText}>{spoken}</Text>
        </View>
      ) : null}

      {!failure && status !== 'readyToPlay' && (
        <View style={styles.overlay} pointerEvents="none">
          <Loader size="large" />
          <Text style={styles.overlayText} numberOfLines={2}>
            {item.title}
          </Text>
        </View>
      )}

      {failure && (
        <View style={styles.overlay}>
          <Text style={styles.errorTitle}>Couldn&apos;t play this file</Text>
          <Text style={styles.overlayText}>{failure}</Text>
          <Text style={styles.hint}>
            Some MKV files use audio (like DTS) that phones and TVs can&apos;t decode.
          </Text>
        </View>
      )}

      {!isTV && !mini && (
        <Pressable
          onPress={() => {
            setSearchQuery(cleanName(item.title));
            setSearchOpen(true);
          }}
          style={styles.ccButton}
        >
          <Text style={styles.ccText}>CC</Text>
        </Pressable>
      )}

      {searchOpen && (
        <View style={styles.searchOverlay}>
          <View style={styles.searchCard}>
            <Text style={styles.searchTitle}>Subtitles</Text>
            <View style={styles.searchRow}>
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Film name…"
                placeholderTextColor={colors.muted}
                style={styles.searchInput}
                autoCorrect={false}
              />
              <Pressable onPress={runSubtitleSearch} style={styles.searchGo}>
                <Text style={styles.searchGoText}>{searching ? '…' : 'Search'}</Text>
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.langRow}>
              {['eng', 'hin', 'mal', 'tam', 'tel', 'spa', 'fre', 'ger', 'ita', 'por', 'rus', 'ara', 'chi', 'jpn', 'kor'].map((lang) => (
                <Pressable
                  key={lang}
                  onPress={() => setSearchLang(lang)}
                  style={({ focused, pressed }) => [styles.langChip, searchLang === lang && styles.langChipActive, (focused || pressed) && styles.langChipFocused]}
                >
                  <Text style={[styles.langText, searchLang === lang && styles.langTextActive]}>{lang}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <ScrollView style={styles.results} contentContainerStyle={styles.resultsContent}>
              {captionOptions.length === 0 && !searching ? (
                <Text style={styles.resultNote}>No subtitles yet. Type a name and search.</Text>
              ) : null}
              {captionOptions.map((opt) => (
                <Pressable
                  key={opt.id}
                  onPress={() => {
                    setChosen(opt.id);
                    setSearchOpen(false);
                  }}
                  style={({ focused, pressed }) => [styles.result, (focused || pressed) && styles.resultActive]}
                >
                  <Text style={styles.resultName} numberOfLines={1}>{opt.name}</Text>
                  <Text style={styles.resultMeta}>{opt.language} · ★ {opt.rating} · {opt.downloads} downloads</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable onPress={() => setSearchOpen(false)} style={styles.closeSearch}>
              <Text style={styles.closeSearchText}>Close</Text>
            </Pressable>
          </View>
        </View>
      )}

      {portraitPhone && !mini && (
        // Dragging the title block down shrinks the player into the corner.
        <RelatedPanel item={item} onPlay={onPlay} dragHandlers={shell?.dragHandlers}>
          <Text style={styles.infoTitle}>{item.title}</Text>
          <Text style={styles.infoNote}>From your TorBox</Text>
        </RelatedPanel>
      )}

      {isTV && !mini && (
        <VideoOverlay
          player={player}
          paused={!player.playing}
          time={{ t: currentTime ?? 0, d: player.duration ?? 0 }}
          buffering={status !== 'readyToPlay'}
          show={showOverlay}
          onToggle={() => (player.playing ? player.pause() : player.play())}
          onSeekBy={(seconds) => player.seekBy(seconds)}
        />
      )}

      {!isTV && !mini && (
        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={[styles.close, { top: (portraitPhone ? (width * 9) / 16 : 0) + 8 }]}
        >
          <Ionicons name="close" size={20} color="#fff" />
        </Pressable>
      )}

      {!isTV && !mini && shell && (
        <Pressable onPress={shell.minimize} hitSlop={12} style={styles.minimize}>
          <Ionicons name="chevron-down" size={22} color="#fff" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  video: { flex: 1 },
  videoPortrait: { width: '100%', aspectRatio: 16 / 9 },
  infoTitle: { color: colors.text, fontSize: 17, fontWeight: '700', lineHeight: 24 },
  infoNote: { color: colors.muted, fontSize: 13, marginTop: 6 },
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
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  overlayText: { color: colors.text, fontSize: sz(16, 20), marginTop: 16, textAlign: 'center' },
  errorTitle: { color: colors.text, fontSize: sz(20, 26), fontWeight: '800' },
  hint: { color: colors.muted, fontSize: sz(13, 16), marginTop: 12, textAlign: 'center' },
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
  ccButton: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  ccText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  cue: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
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
  searchOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    zIndex: 60,
  },
  searchCard: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '80%',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 10 },
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchGo: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.accent, justifyContent: 'center' },
  searchGoText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  langRow: { gap: 6, paddingVertical: 6 },
  langChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  langChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  langChipFocused: { borderColor: colors.text },
  langText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  langTextActive: { color: '#fff' },
  results: { maxHeight: 260, marginTop: 8 },
  resultsContent: { gap: 6 },
  result: { padding: 10, borderRadius: 10, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  resultActive: { borderColor: colors.accent },
  resultName: { color: colors.text, fontSize: 13, fontWeight: '700' },
  resultMeta: { color: colors.muted, fontSize: 11, marginTop: 2 },
  resultNote: { color: colors.muted, fontSize: 12, textAlign: 'center', paddingVertical: 20 },
  closeSearch: { marginTop: 12, alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 14, backgroundColor: colors.surfaceRaised },
  closeSearchText: { color: colors.text, fontSize: 13, fontWeight: '700' },
});
