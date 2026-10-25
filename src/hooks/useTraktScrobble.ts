import { useEffect, useRef } from 'react';
import { scrobble } from '../api/trakt';

/**
 * Automatically tracks and scrobbles playback progress to Trakt.tv.
 * Sends 'start' when playback begins, and 'stop' (marking watched) when
 * progress reaches 80% or greater.
 */
export function useTraktScrobble(
  title: string,
  currentTime: number = 0,
  duration: number = 0,
  isPlaying: boolean = false,
  year?: number,
  imdbId?: string,
  tmdbId?: number | string,
) {
  const started = useRef(false);
  const scrobbled = useRef(false);

  useEffect(() => {
    if (!started.current && isPlaying && duration > 60) {
      started.current = true;
      const progress = Math.min(100, Math.max(0, (currentTime / duration) * 100));
      scrobble('start', { title, year, imdbId, tmdbId, progress });
    }
  }, [isPlaying, duration, currentTime, title, year, imdbId, tmdbId]);

  useEffect(() => {
    if (duration > 60 && !scrobbled.current) {
      const progress = (currentTime / duration) * 100;
      if (progress >= 80) {
        scrobbled.current = true;
        scrobble('stop', { title, year, imdbId, tmdbId, progress });
      }
    }
  }, [currentTime, duration, title, year, imdbId, tmdbId]);
}
