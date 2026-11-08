// Voice messages in a conversation: holding the mic records (letting go
// sends, a very short hold is dropped), and a voice bubble plays the copy kept
// on this phone, collecting it from the server first if it's a friend's.
// Consecutive voice messages auto-advance seamlessly like WhatsApp.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import {
  createAudioPlayer,
  requestRecordingPermissionsAsync,
  getRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type AudioPlayer,
} from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { showToast } from '../data/toasts';
import { colors } from '../theme';
import type { ChatMessage } from './api';
import { sendVoice } from './store';
import {
  MAX_VOICE_MS,
  VOICE_RECORDING,
  fetchVoice,
  formatDuration,
  hasVoiceFile,
  removeLocalFile,
  voiceFile,
} from './voice';

// Shorter than this counts as a slip of the finger, not a message.
const MIN_VOICE_MS = 700;

export type VoicePlaybackController = {
  activeVoiceId: string | null;
  playing: boolean;
  position: number;
  duration: number;
  toggle: (id: string) => void;
  stop: () => void;
};

/** Coordinates conversation voice playback, stopping when finished and auto-advancing like WhatsApp. */
export function useVoicePlayback(
  messages: ChatMessage[],
  onAutoAdvance?: (nextId: string) => void,
): VoicePlaybackController {
  const [activeVoice, setActiveVoice] = useState<{
    id: string;
    playing: boolean;
    position: number;
    duration: number;
  } | null>(null);

  const playerRef = useRef<AudioPlayer | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>(messages);
  const finishingRef = useRef(false);
  const playVoiceRef = useRef<((id: string, isAutoAdvance?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const stop = useCallback(() => {
    activeIdRef.current = null;
    finishingRef.current = false;
    if (playerRef.current) {
      try {
        playerRef.current.pause();
        playerRef.current.release();
      } catch {}
      playerRef.current = null;
    }
    setActiveVoice(null);
  }, []);

  const getNextVoiceId = useCallback((currentId: string): string | null => {
    const list = messagesRef.current;
    const currentIdx = list.findIndex((m) => m.id === currentId);
    if (currentIdx <= 0) return null;
    // FlatList is inverted: index 0 is newest, higher indexes are older.
    // Chronological order flows from older to newer (towards index 0 / down the screen).
    for (let i = currentIdx - 1; i >= 0; i--) {
      if (list[i].voice) {
        return list[i].id;
      }
    }
    return null;
  }, []);

  const playVoice = useCallback(
    async (id: string, isAutoAdvance = false) => {
      const exists = await hasVoiceFile(id);
      if (!exists) {
        const ok = await fetchVoice(id);
        if (!ok) {
          if (isAutoAdvance) {
            const next = getNextVoiceId(id);
            if (next) void playVoiceRef.current?.(next, true);
          }
          return;
        }
      }

      if (playerRef.current) {
        try {
          playerRef.current.pause();
          playerRef.current.release();
        } catch {}
        playerRef.current = null;
      }

      activeIdRef.current = id;
      finishingRef.current = false;
      const targetMsg = messagesRef.current.find((m) => m.id === id);
      const initialDuration = targetMsg?.voice?.durationMs ?? 0;

      setActiveVoice({
        id,
        playing: true,
        position: 0,
        duration: initialDuration,
      });

      if (isAutoAdvance && onAutoAdvance) {
        onAutoAdvance(id);
      }

      try {
        await setAudioModeAsync({ playsInSilentMode: true });
        const p = createAudioPlayer({ uri: voiceFile(id) }, { updateInterval: 100 });
        p.loop = false;
        playerRef.current = p;

        p.addListener('playbackStatusUpdate', (s) => {
          if (activeIdRef.current !== id) return;

          const isDone = s.didJustFinish || (s.duration > 0 && s.currentTime >= s.duration - 0.05);
          if (isDone) {
            if (finishingRef.current) return;
            finishingRef.current = true;

            // Pause immediately and seek to start so it never loops
            try {
              p.pause();
              p.seekTo(0);
            } catch {}

            setActiveVoice(null);
            activeIdRef.current = null;

            // WhatsApp-style auto-playback of the next voice message in sequence
            const next = getNextVoiceId(id);
            if (next) {
              void playVoiceRef.current?.(next, true);
            }
            return;
          }

          setActiveVoice({
            id,
            playing: s.playing,
            position: Math.round((s.currentTime ?? 0) * 1000),
            duration: Math.round((s.duration ?? 0) * 1000) || initialDuration,
          });
        });

        p.play();
      } catch {
        stop();
      }
    },
    [getNextVoiceId, onAutoAdvance, stop],
  );

  useEffect(() => {
    playVoiceRef.current = playVoice;
  });

  const pauseVoice = useCallback(() => {
    if (playerRef.current) {
      try {
        playerRef.current.pause();
      } catch {}
    }
    setActiveVoice((prev) => (prev ? { ...prev, playing: false } : null));
  }, []);

  const resumeVoice = useCallback(() => {
    if (playerRef.current && activeIdRef.current) {
      setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
      try {
        playerRef.current.play();
      } catch {}
      setActiveVoice((prev) => (prev ? { ...prev, playing: true } : null));
    } else if (activeIdRef.current) {
      void playVoiceRef.current?.(activeIdRef.current);
    }
  }, []);

  const toggle = useCallback(
    (id: string) => {
      if (activeIdRef.current === id) {
        if (activeVoice?.playing) {
          pauseVoice();
        } else {
          resumeVoice();
        }
      } else {
        void playVoiceRef.current?.(id);
      }
    },
    [activeVoice?.playing, pauseVoice, resumeVoice],
  );

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    activeVoiceId: activeVoice?.id ?? null,
    playing: activeVoice?.playing ?? false,
    position: activeVoice?.position ?? 0,
    duration: activeVoice?.duration ?? 0,
    toggle,
    stop,
  };
}

/** Recording for one conversation: start on press, finish (send) on release. */
export function useVoiceRecorder(userId: string) {
  const recorder = useAudioRecorder(VOICE_RECORDING);
  const state = useAudioRecorderState(recorder, 200);
  const [active, setActive] = useState(false);
  const starting = useRef<Promise<boolean> | null>(null);

  const start = () => {
    starting.current = (async () => {
      const permission = await getRecordingPermissionsAsync();
      if (!permission.granted) {
        // Asking takes the finger off the button; the next hold records.
        const asked = await requestRecordingPermissionsAsync();
        if (!asked.granted) showToast({ text: 'Allow the microphone to send voice messages.' });
        return false;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setActive(true);
      return true;
    })().catch(() => false);
  };

  const finish = async (send: boolean) => {
    const recording = await starting.current;
    starting.current = null;
    if (!recording) return;
    const duration = recorder.currentTime * 1000;
    await recorder.stop().catch(() => {});
    setActive(false);
    await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    const uri = recorder.uri;
    if (!send || !uri) {
      if (uri) void removeLocalFile(uri);
      return;
    }
    if (duration < MIN_VOICE_MS) {
      showToast({ text: 'Voice message too short.' });
      if (uri) void removeLocalFile(uri);
      return;
    }
    try {
      await sendVoice(userId, uri, Math.min(duration, MAX_VOICE_MS));
    } catch (e) {
      showToast({ text: (e as Error).message });
    }
  };

  // A recording that runs too long is sent at the limit.
  useEffect(() => {
    if (active && state.durationMillis >= MAX_VOICE_MS) finish(true);
    // finish only reads refs and the recorder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, state.durationMillis]);

  return { recording: active, elapsedMs: state.durationMillis, start, finish };
}

/** The bar shown in place of the text box while recording. */
export function RecordingBar({
  elapsedMs,
  onCancel,
  onSend,
}: {
  elapsedMs: number;
  onCancel: () => void;
  onSend: () => void;
}) {
  const [slideX] = useState(() => new Animated.Value(0));
  const [pulseAnim] = useState(() => new Animated.Value(1));
  const discardedRef = useRef(false);
  const startXRef = useRef(0);
  const cancelRef = useRef(onCancel);
  useEffect(() => {
    cancelRef.current = onCancel;
  });

  useEffect(() => {
    discardedRef.current = false;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.25, duration: 650, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 650, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  const discard = () => {
    if (discardedRef.current) return;
    discardedRef.current = true;
    showToast({ text: 'Recording discarded' });
    cancelRef.current();
  };

  const handleTouchStart = (e: GestureResponderEvent) => {
    startXRef.current = e.nativeEvent.pageX;
  };

  const handleTouchMove = (e: GestureResponderEvent) => {
    if (discardedRef.current) return;
    const dx = e.nativeEvent.pageX - startXRef.current;
    if (dx < 0) {
      slideX.setValue(Math.min(0, Math.max(-120, dx)));
      if (dx < -65) {
        discard();
      }
    }
  };

  const handleTouchEnd = (e: GestureResponderEvent) => {
    if (discardedRef.current) return;
    const dx = e.nativeEvent.pageX - startXRef.current;
    if (dx < -65) {
      discard();
    } else {
      Animated.spring(slideX, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
    }
  };

  return (
    <View
      style={styles.recordingContainer}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <Pressable
        onPress={discard}
        hitSlop={10}
        accessibilityLabel="Discard recording"
        style={({ pressed }) => [styles.trashBtn, pressed && styles.trashPressed]}
      >
        <Ionicons name="trash-outline" size={20} color={colors.live} />
      </Pressable>

      <View style={styles.recordingCenter}>
        <Animated.View style={[styles.recordingDot, { opacity: pulseAnim }]} />
        <Text style={styles.recordingTime}>{formatDuration(elapsedMs)}</Text>
        <Animated.View style={[styles.slideHintWrap, { transform: [{ translateX: slideX }] }]}>
          <Ionicons name="chevron-back" size={14} color={colors.muted} />
          <Text style={styles.recordingHint}>Slide left to cancel</Text>
        </Animated.View>
      </View>

      <Pressable
        onPress={onSend}
        accessibilityLabel="Send voice message"
        style={({ pressed }) => [styles.sendBtn, pressed && styles.sendPressed]}
      >
        <Ionicons name="send" size={18} color="#fff" />
      </Pressable>
    </View>
  );
}

export function MicButton({
  recording,
  onPress,
  onSwipeCancel,
}: {
  recording: boolean;
  onPress: () => void;
  onSwipeCancel?: () => void;
}) {
  const startXRef = useRef(0);
  const swipeCancelRef = useRef(onSwipeCancel);
  useEffect(() => {
    swipeCancelRef.current = onSwipeCancel;
  });

  return (
    <Pressable
      onPress={onPress}
      onTouchStart={(e) => {
        startXRef.current = e.nativeEvent.pageX;
      }}
      onTouchMove={(e) => {
        const dx = e.nativeEvent.pageX - startXRef.current;
        if (dx < -60) {
          swipeCancelRef.current?.();
        }
      }}
      accessibilityLabel="Record voice message"
      style={[styles.mic, recording && styles.micRecording]}
    >
      <Ionicons name="mic" size={20} color="#fff" />
    </Pressable>
  );
}

type Availability = 'checking' | 'downloading' | 'ready' | 'missing';

/** A voice message: play/pause, how far along, and the length. */
export function VoiceBubble({
  message,
  mine,
  time,
  active = false,
  playing = false,
  position = 0,
  onToggle,
}: {
  message: ChatMessage;
  mine: boolean;
  time: string;
  active?: boolean;
  playing?: boolean;
  position?: number;
  onToggle?: () => void;
}) {
  const [availability, setAvailability] = useState<Availability>('checking');
  const duration = message.voice?.durationMs ?? 0;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (await hasVoiceFile(message.id)) return 'ready' as const;
      // A friend's recording waits on the server; your own lives only here.
      if (mine) return 'missing' as const;
      if (!cancelled) setAvailability('downloading');
      return (await fetchVoice(message.id)) ? ('ready' as const) : ('missing' as const);
    })().then((a) => !cancelled && setAvailability(a));
    return () => {
      cancelled = true;
    };
  }, [message.id, mine]);

  const toggle = () => {
    if (availability !== 'ready') return;
    onToggle?.();
  };

  const currentPos = active ? position : 0;
  const isPlaying = active && playing;
  const progress = duration > 0 ? Math.min(1, currentPos / duration) : 0;
  const unavailable = availability === 'missing';
  return (
    <View style={[styles.voice, mine ? styles.voiceMine : styles.voiceTheirs]}>
      <Pressable
        onPress={toggle}
        disabled={availability !== 'ready'}
        accessibilityLabel={isPlaying ? 'Pause' : 'Play voice message'}
        style={[styles.play, unavailable && styles.playOff]}
      >
        <Ionicons
          name={
            unavailable
              ? 'mic-off'
              : availability === 'ready'
                ? isPlaying
                  ? 'pause'
                  : 'play'
                : 'cloud-download-outline'
          }
          size={18}
          color="#fff"
          style={availability === 'ready' && !isPlaying ? styles.playIcon : undefined}
        />
      </Pressable>
      <View style={styles.voiceBody}>
        {unavailable ? (
          <Text style={styles.unavailable}>Voice message unavailable</Text>
        ) : (
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${progress * 100}%` }]} />
          </View>
        )}
        <View style={styles.voiceMeta}>
          <Text style={styles.voiceTime}>
            {formatDuration(isPlaying || currentPos > 0 ? currentPos : duration)}
          </Text>
          <Text style={styles.voiceTime}>{time}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  recordingContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 46,
  },
  trashBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 59, 92, 0.12)',
  },
  trashPressed: { opacity: 0.6 },
  recordingCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 22,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.live },
  recordingTime: { color: colors.text, fontSize: 15.5, fontWeight: '800', fontVariant: ['tabular-nums'] },
  slideHintWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2 },
  recordingHint: { color: colors.muted, fontSize: 12.5, fontWeight: '600' },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  sendPressed: { opacity: 0.6 },
  mic: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  micRecording: { backgroundColor: colors.live, transform: [{ scale: 1.15 }] },
  voice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: 240,
    paddingVertical: 8,
    paddingLeft: 8,
    paddingRight: 12,
    borderRadius: 20,
  },
  voiceMine: { backgroundColor: colors.accentDeep, borderBottomRightRadius: 6 },
  voiceTheirs: { backgroundColor: colors.surfaceRaised, borderBottomLeftRadius: 6 },
  play: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  playOff: { opacity: 0.5 },
  playIcon: { marginLeft: 2 },
  voiceBody: { flex: 1 },
  track: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden', marginTop: 6 },
  fill: { height: '100%', backgroundColor: '#fff' },
  unavailable: { color: 'rgba(255,255,255,0.7)', fontSize: 12.5, fontStyle: 'italic' },
  voiceMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
  voiceTime: { color: 'rgba(255,255,255,0.65)', fontSize: 11, fontVariant: ['tabular-nums'] },
});
