// Voice messages in a conversation: holding the mic records (letting go
// sends, a very short hold is dropped), and a voice bubble plays the copy kept
// on this phone, collecting it from the server first if it's a friend's.
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
import { MAX_VOICE_MS, VOICE_RECORDING, fetchVoice, formatDuration, hasVoiceFile, voiceFile } from './voice';

// Shorter than this counts as a slip of the finger, not a message.
const MIN_VOICE_MS = 700;

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
    if (!send || !uri) return;
    if (duration < MIN_VOICE_MS) {
      showToast({ text: 'Hold the mic to record, then let go to send.' });
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
export function RecordingBar({ elapsedMs }: { elapsedMs: number }) {
  return (
    <View style={styles.recordingBar}>
      <View style={styles.recordingDot} />
      <Text style={styles.recordingTime}>{formatDuration(elapsedMs)}</Text>
      <Text style={styles.recordingHint}>Let go to send</Text>
    </View>
  );
}

export function MicButton({ recording, onStart, onFinish }: { recording: boolean; onStart: () => void; onFinish: () => void }) {
  return (
    <Pressable
      onPressIn={onStart}
      onPressOut={onFinish}
      accessibilityLabel="Hold to record a voice message"
      style={[styles.mic, recording && styles.micRecording]}
    >
      <Ionicons name="mic" size={20} color="#fff" />
    </Pressable>
  );
}

type Availability = 'checking' | 'downloading' | 'ready' | 'missing';

/** A voice message: play/pause, how far along, and the length. */
export function VoiceBubble({ message, mine, time }: { message: ChatMessage; mine: boolean; time: string }) {
  const [availability, setAvailability] = useState<Availability>('checking');
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const player = useRef<AudioPlayer | null>(null);
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

  // The player is made on the first play and let go with the bubble.
  useEffect(
    () => () => {
      player.current?.release();
      player.current = null;
    },
    [],
  );

  const toggle = () => {
    if (availability !== 'ready') return;
    if (!player.current) {
      const p = createAudioPlayer({ uri: voiceFile(message.id) }, { updateInterval: 200 });
      p.addListener('playbackStatusUpdate', (s) => {
        setPlaying(s.playing);
        setPosition(s.currentTime * 1000);
        if (s.didJustFinish) {
          p.seekTo(0);
          setPosition(0);
        }
      });
      player.current = p;
    }
    const p = player.current;
    if (p.playing) p.pause();
    else {
      setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
      p.play();
    }
  };

  const progress = duration > 0 ? Math.min(1, position / duration) : 0;
  const unavailable = availability === 'missing';
  return (
    <View style={[styles.voice, mine ? styles.voiceMine : styles.voiceTheirs]}>
      <Pressable
        onPress={toggle}
        disabled={availability !== 'ready'}
        accessibilityLabel={playing ? 'Pause' : 'Play voice message'}
        style={[styles.play, unavailable && styles.playOff]}
      >
        <Ionicons
          name={
            unavailable
              ? 'mic-off'
              : availability === 'ready'
                ? playing
                  ? 'pause'
                  : 'play'
                : 'cloud-download-outline'
          }
          size={18}
          color="#fff"
          style={availability === 'ready' && !playing ? styles.playIcon : undefined}
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
          <Text style={styles.voiceTime}>{formatDuration(playing || position > 0 ? position : duration)}</Text>
          <Text style={styles.voiceTime}>{time}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  recordingBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: colors.surface,
  },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.live },
  recordingTime: { color: colors.text, fontSize: 15.5, fontWeight: '800', fontVariant: ['tabular-nums'] },
  recordingHint: { flex: 1, textAlign: 'right', color: colors.muted, fontSize: 13 },
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
