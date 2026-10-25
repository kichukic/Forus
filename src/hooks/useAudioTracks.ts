import { useEffect, useState } from 'react';
import type { AudioTrack, VideoPlayer } from 'expo-video';
import { useEventListener } from 'expo';

const LANGUAGES: Record<string, string> = {
  en: 'English',
  eng: 'English',
  hi: 'Hindi',
  hin: 'Hindi',
  ml: 'Malayalam',
  mal: 'Malayalam',
  ta: 'Tamil',
  tam: 'Tamil',
  te: 'Telugu',
  tel: 'Telugu',
  kn: 'Kannada',
  kan: 'Kannada',
  bn: 'Bengali',
  ben: 'Bengali',
  mr: 'Marathi',
  mar: 'Marathi',
  pa: 'Punjabi',
  pan: 'Punjabi',
  es: 'Spanish',
  spa: 'Spanish',
  fr: 'French',
  fra: 'French',
  de: 'German',
  ger: 'German',
  deu: 'German',
  it: 'Italian',
  ita: 'Italian',
  ja: 'Japanese',
  jpn: 'Japanese',
  ko: 'Korean',
  kor: 'Korean',
  zh: 'Chinese',
  zho: 'Chinese',
  chi: 'Chinese',
  ru: 'Russian',
  rus: 'Russian',
  pt: 'Portuguese',
  por: 'Portuguese',
  ar: 'Arabic',
  ara: 'Arabic',
};

export function audioTrackLabel(track: AudioTrack, index = 0): string {
  if (track.label && track.label.trim()) return track.label.trim();
  if (track.name && track.name.trim()) return track.name.trim();
  const code = (track.language ?? '').toLowerCase();
  if (code && LANGUAGES[code]) return LANGUAGES[code];
  if (code && code !== 'und') return code.toUpperCase();
  return `Track ${index + 1}`;
}

export function useAudioTracks(player: VideoPlayer) {
  const [tracks, setTracks] = useState<AudioTrack[]>(() => player.availableAudioTracks ?? []);
  const [selected, setSelected] = useState<AudioTrack | null>(() => player.audioTrack);

  const refresh = () => {
    try {
      const avail = player.availableAudioTracks ?? [];
      setTracks([...avail]);
      setSelected(player.audioTrack);
    } catch {
      // ignore
    }
  };

  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'readyToPlay') refresh();
  });

  useEventListener(player, 'audioTrackChange', ({ audioTrack }) => {
    setSelected(audioTrack);
    refresh();
  });

  useEffect(() => {
    refresh();
    // Some streams populate tracks slightly after initial mount
    const t = setTimeout(refresh, 1000);
    return () => clearTimeout(t);
  }, [player]);

  const select = (track: AudioTrack | null) => {
    try {
      player.audioTrack = track;
      setSelected(track);
    } catch {
      // ignore
    }
  };

  const cycle = () => {
    if (!tracks.length) return;
    const currentIdx = tracks.findIndex(
      (t) => (t.id && t.id === selected?.id) || (t.language && t.language === selected?.language),
    );
    const nextIdx = (currentIdx + 1) % tracks.length;
    select(tracks[nextIdx]);
  };

  return {
    tracks,
    selected,
    select,
    cycle,
    hasMultiple: tracks.length > 1,
  };
}
