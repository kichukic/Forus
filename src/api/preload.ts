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

// Cinemeta's top lists give the wall its Hollywood and anime artwork. Their
// backgrounds are already 16:9, the shape of the splash tiles, and the image
// host is reachable where TMDB itself is not.
const CINEMA_CATALOGS = [
  // Hollywood: the mainstream film chart.
  { url: 'https://cinemeta-catalogs.strem.io/top/catalog/movie/top.json', count: 14 },
  // Anime series and anime films.
  { url: 'https://cinemeta-catalogs.strem.io/top/catalog/series/top/genre=Animation.json', count: 14 },
  { url: 'https://cinemeta-catalogs.strem.io/top/catalog/movie/top/genre=Animation.json', count: 8 },
];
// The wall must not hold the splash up when one of these is slow.
const CATALOG_TIMEOUT_MS = 2000;

// A curated set of well-known Hollywood and anime backdrops, so the wall is
// already mixed on the very first launch instead of waiting on the charts.
// Every one of these was checked against the image host. The live charts join
// in as they arrive and keep the wall current.
const SEED_HOLLYWOOD = [
  'https://images.metahub.space/background/small/tt1375666/img', // Inception
  'https://images.metahub.space/background/small/tt0468569/img', // The Dark Knight
  'https://images.metahub.space/background/small/tt0816692/img', // Interstellar
  'https://images.metahub.space/background/small/tt0499549/img', // Avatar
  'https://images.metahub.space/background/small/tt0120338/img', // Titanic
  'https://images.metahub.space/background/small/tt0133093/img', // The Matrix
  'https://images.metahub.space/background/small/tt4154796/img', // Avengers: Endgame
  'https://images.metahub.space/background/small/tt10872600/img', // Spider-Man: No Way Home
  'https://images.metahub.space/background/small/tt1160419/img', // Dune
  'https://images.metahub.space/background/small/tt15398776/img', // Oppenheimer
  'https://images.metahub.space/background/small/tt1517268/img', // Barbie
  'https://images.metahub.space/background/small/tt1745960/img', // Top Gun: Maverick
  'https://images.metahub.space/background/small/tt2911666/img', // John Wick
  'https://images.metahub.space/background/small/tt1392190/img', // Mad Max: Fury Road
  'https://images.metahub.space/background/small/tt0068646/img', // The Godfather
  'https://images.metahub.space/background/small/tt0110912/img', // Pulp Fiction
  'https://images.metahub.space/background/small/tt0107290/img', // Jurassic Park
  'https://images.metahub.space/background/small/tt0241527/img', // Harry Potter
  'https://images.metahub.space/background/small/tt0120737/img', // The Lord of the Rings
  'https://images.metahub.space/background/small/tt0076759/img', // Star Wars
];
const SEED_ANIME = [
  'https://images.metahub.space/background/small/tt2560140/img', // Attack on Titan
  'https://images.metahub.space/background/small/tt0388629/img', // One Piece
  'https://images.metahub.space/background/small/tt9335498/img', // Demon Slayer
  'https://images.metahub.space/background/small/tt12343534/img', // Jujutsu Kaisen
  'https://images.metahub.space/background/small/tt0409591/img', // Naruto
  'https://images.metahub.space/background/small/tt0877057/img', // Death Note
  'https://images.metahub.space/background/small/tt1355642/img', // Fullmetal Alchemist: Brotherhood
  'https://images.metahub.space/background/small/tt2098220/img', // Hunter x Hunter
  'https://images.metahub.space/background/small/tt5626028/img', // My Hero Academia
  'https://images.metahub.space/background/small/tt13616990/img', // Chainsaw Man
  'https://images.metahub.space/background/small/tt13706018/img', // Spy x Family
  'https://images.metahub.space/background/small/tt3741634/img', // Tokyo Ghoul
  'https://images.metahub.space/background/small/tt2250192/img', // Sword Art Online
  'https://images.metahub.space/background/small/tt0214341/img', // Dragon Ball Z
  'https://images.metahub.space/background/small/tt0434665/img', // Bleach
  'https://images.metahub.space/background/small/tt7441658/img', // Black Clover
  'https://images.metahub.space/background/small/tt12590266/img', // Cyberpunk: Edgerunners
  'https://images.metahub.space/background/small/tt11126994/img', // Arcane
  'https://images.metahub.space/background/small/tt0112159/img', // Neon Genesis Evangelion
  'https://images.metahub.space/background/small/tt2359704/img', // JoJo's Bizarre Adventure
];
const CINEMA_SEED = interleave([SEED_HOLLYWOOD, SEED_ANIME]);

/** The posters saved last time, always mixed with the cinema set so the wall
 *  opens with Hollywood and anime even on an install that has no cache yet. */
export async function loadSavedPosters(): Promise<string[]> {
  try {
    const saved = JSON.parse((await AsyncStorage.getItem(POSTERS_KEY)) ?? '[]') as unknown;
    const list = Array.isArray(saved) ? saved.filter((uri): uri is string => typeof uri === 'string') : [];
    return interleave([list, CINEMA_SEED]);
  } catch {
    return CINEMA_SEED;
  }
}

/** One Cinemeta chart, asked for a few tile-sized 16:9 backgrounds and given up on if slow. */
async function catalogBackgrounds(url: string, count: number): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CATALOG_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return [];
    const data = (await response.json()) as { metas?: { background?: string }[] };
    const found: string[] = [];
    for (const meta of data?.metas ?? []) {
      // The charts hand out 1080p stills; the wall only needs a small copy.
      const uri = meta?.background?.replace('/background/medium/', '/background/small/');
      if (uri && !found.includes(uri)) found.push(uri);
      if (found.length >= count) break;
    }
    return found;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The Hollywood and anime half of the wall. Fetched together and mixed, so a
 * column never turns into one genre from top to bottom.
 */
async function loadCinemaPosters(): Promise<string[]> {
  const lists = await Promise.all(
    CINEMA_CATALOGS.map((catalog) => catalogBackgrounds(catalog.url, catalog.count).catch(() => [])),
  );
  return interleave(lists);
}

/** Alternates between lists, so the wall's subjects take turns. */
function interleave(lists: string[][]): string[] {
  const mixed: string[] = [];
  const seen = new Set<string>();
  const longest = Math.max(0, ...lists.map((list) => list.length));
  for (let i = 0; i < longest; i++) {
    for (const list of lists) {
      const uri = list[i];
      if (!uri || seen.has(uri)) continue;
      seen.add(uri);
      mixed.push(uri);
    }
  }
  return mixed;
}

export async function preloadHome(onStep: (step: PreloadStep) => void): Promise<void> {
  onStep({ label: 'Tuning in to the channels…', progress: 0.05 });

  let loaded = 0;
  const posters: string[] = [];

  // The cinema charts load alongside the channels. Their artwork joins the
  // wall as soon as it lands, so a slow channel feed never holds it back.
  let cinemaPosters: string[] = [];
  const cinema = loadCinemaPosters().then((list) => {
    cinemaPosters = list;
    if (list.length) {
      onStep({
        label: 'Rolling out the red carpet…',
        progress: 0.7,
        posters: interleave([posters, CINEMA_SEED, list]),
      });
    }
  });

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
            posters: interleave([posters, CINEMA_SEED, cinemaPosters]),
          });
          return videos.map((v) => ({ ...v, channel: source.name }));
        }),
    ),
  );

  // The wall gets a third act: Hollywood and anime among the channels.
  await cinema;
  const wall = interleave([posters, CINEMA_SEED, cinemaPosters]);
  onStep({ label: 'Rolling out the red carpet…', progress: 0.72, posters: wall });

  // The carousel features movies (one per channel), while New today mixes all newest.
  const movieVideos = lists.slice(SHOWS.length).flat().sort((a, b) => b.published.localeCompare(a.published));
  const movieFirstPerChannel = movieVideos.filter((v, i) => movieVideos.findIndex((o) => o.channel === v.channel) === i);
  const newest = lists.flat().sort((a, b) => b.published.localeCompare(a.published));
  const pictures = [
    ...movieFirstPerChannel.slice(0, HERO_PICTURES).map((v) => `https://i.ytimg.com/vi/${v.id}/maxresdefault.jpg`),
    ...newest.slice(0, CARD_PICTURES).map((v) => v.thumbnail),
  ];

  // Next launch's wall: the same mix of channels, Hollywood and anime.
  const next = wall.slice(0, POSTER_COUNT);
  if (next.length) AsyncStorage.setItem(POSTERS_KEY, JSON.stringify(next)).catch(() => {});

  // Prefetch only the immediate hero pictures to release the splash in < 800ms
  const heroOnly = pictures.slice(0, HERO_PICTURES);
  await Promise.all(
    heroOnly.map((uri) => Image.prefetch(uri, 'memory-disk').catch(() => false)),
  );

  onStep({ label: 'All set', progress: 1, posters: wall });

  // Prefetch the remaining images asynchronously in background without blocking startup
  setTimeout(() => {
    const remaining = [...pictures.slice(HERO_PICTURES), ...next];
    Promise.all(remaining.map((uri) => Image.prefetch(uri, 'memory-disk').catch(() => false))).catch(() => {});
  }, 120);
}
