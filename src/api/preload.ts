// What the splash screen loads before it lets go: the feeds behind the All tab
// (its featured carousel and New today row) and the first pictures they show,
// so the home screen opens already filled in. Along the way it hands the splash
// thumbnails for its poster wall, and saves some for the next launch.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { MOVIES, SHOWS } from '../data/channels';
import { loadVideos, type Video } from './youtube';

export type PreloadStep = {
  label: string;
  progress: number;
  // Thumbnails found so far, for the splash's poster wall.
  posters?: string[];
};

const HOME_CHANNELS = [...SHOWS, ...MOVIES];
// The carousel's slides and the first screenful of New today.
const HERO_PICTURES = 6;
const CARD_PICTURES = 8;
const POSTERS_KEY = 'splash-posters';
const POSTER_COUNT = 40;

/** The posters saved last time, so the wall is full from the first frame. */
export async function loadSavedPosters(): Promise<string[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(POSTERS_KEY)) ?? '[]');
  } catch {
    return [];
  }
}

export async function preloadHome(onStep: (step: PreloadStep) => void): Promise<void> {
  onStep({ label: 'Tuning in to the channels…', progress: 0.05 });

  let loaded = 0;
  const posters: string[] = [];
  const lists = await Promise.all(
    HOME_CHANNELS.map((source) =>
      loadVideos(source)
        .catch(() => [] as Video[])
        .then((videos) => {
          loaded++;
          // A few from each channel as it arrives, so the wall mixes channels.
          for (const v of videos.slice(0, 4)) if (!posters.includes(v.thumbnail)) posters.push(v.thumbnail);
          onStep({
            label: loaded < HOME_CHANNELS.length / 2 ? 'Tuning in to the channels…' : 'Fetching new episodes…',
            progress: 0.05 + 0.6 * (loaded / HOME_CHANNELS.length),
            posters: [...posters],
          });
          return videos.map((v) => ({ ...v, channel: source.name }));
        }),
    ),
  );

  // The carousel features movies (one per channel), while New today mixes all newest.
  const movieVideos = lists.slice(SHOWS.length).flat().sort((a, b) => b.published.localeCompare(a.published));
  const movieFirstPerChannel = movieVideos.filter((v, i) => movieVideos.findIndex((o) => o.channel === v.channel) === i);
  const newest = lists.flat().sort((a, b) => b.published.localeCompare(a.published));
  const pictures = [
    ...movieFirstPerChannel.slice(0, HERO_PICTURES).map((v) => `https://i.ytimg.com/vi/${v.id}/maxresdefault.jpg`),
    ...newest.slice(0, CARD_PICTURES).map((v) => v.thumbnail),
  ];

  // Next launch's wall: today's newest, which are also in the image cache now.
  const next = newest.slice(0, POSTER_COUNT).map((v) => v.thumbnail);
  if (next.length) AsyncStorage.setItem(POSTERS_KEY, JSON.stringify(next)).catch(() => {});

  // Prefetch only the immediate hero pictures to release the splash in < 800ms
  const heroOnly = pictures.slice(0, HERO_PICTURES);
  await Promise.all(
    heroOnly.map((uri) => Image.prefetch(uri, 'memory-disk').catch(() => false)),
  );

  onStep({ label: 'All set', progress: 1, posters: [...posters] });

  // Prefetch the remaining images asynchronously in background without blocking startup
  setTimeout(() => {
    const remaining = [...pictures.slice(HERO_PICTURES), ...next];
    Promise.all(remaining.map((uri) => Image.prefetch(uri, 'memory-disk').catch(() => false))).catch(() => {});
  }, 120);
}
