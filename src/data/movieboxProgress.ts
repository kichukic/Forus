// Remembers where a MovieBox film or episode was left, so playback can resume.
// Stored on the phone; the chat account's history already records what was
// watched, and this fills in how far.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'moviebox-progress';

type Progress = { position: number; duration: number; at: number };

function storageKey(subjectId: string, season: number, episode: number): string {
  return `${KEY}:${subjectId}:${season}:${episode}`;
}

export async function loadProgress(
  subjectId: string,
  season: number,
  episode: number,
): Promise<Progress | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(subjectId, season, episode));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Progress;
    if (!parsed || typeof parsed.position !== 'number') return null;
    // A finished film starts again from the beginning.
    if (parsed.duration > 0 && parsed.position >= parsed.duration * 0.95) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveProgress(
  subjectId: string,
  season: number,
  episode: number,
  position: number,
  duration: number,
): Promise<void> {
  if (!Number.isFinite(position) || position < 5) return;
  try {
    const value: Progress = { position, duration: duration || 0, at: Date.now() };
    await AsyncStorage.setItem(storageKey(subjectId, season, episode), JSON.stringify(value));
  } catch {
    // Storage is best-effort.
  }
}

export async function clearProgress(
  subjectId: string,
  season: number,
  episode: number,
): Promise<void> {
  try {
    await AsyncStorage.removeItem(storageKey(subjectId, season, episode));
  } catch {}
}
