// What the splash screen loads before it lets go: the feeds behind the All tab
// (its featured carousel and New today row) and the first pictures they show,
// so the home screen opens already filled in.
import { Image } from 'expo-image';
import { MOVIES, SHOWS } from '../data/channels';
import { loadVideos, type Video } from './youtube';

export type PreloadStep = { label: string; progress: number };

const HOME_CHANNELS = [...SHOWS, ...MOVIES];
// The carousel's slides and the first screenful of New today.
const HERO_PICTURES = 6;
const CARD_PICTURES = 8;

export async function preloadHome(onStep: (step: PreloadStep) => void): Promise<void> {
  onStep({ label: 'Tuning in to the channels…', progress: 0.05 });

  let loaded = 0;
  const lists = await Promise.all(
    HOME_CHANNELS.map((source) =>
      loadVideos(source)
        .catch(() => [] as Video[])
        .then((videos) => {
          loaded++;
          onStep({
            label: loaded < HOME_CHANNELS.length / 2 ? 'Tuning in to the channels…' : 'Fetching new episodes…',
            progress: 0.05 + 0.6 * (loaded / HOME_CHANNELS.length),
          });
          return videos.map((v) => ({ ...v, channel: source.name }));
        }),
    ),
  );

  // The same picks the carousel and New today make: newest first, and for the
  // carousel one per channel.
  const newest = lists.flat().sort((a, b) => b.published.localeCompare(a.published));
  const firstPerChannel = newest.filter((v, i) => newest.findIndex((o) => o.channel === v.channel) === i);
  const pictures = [
    ...firstPerChannel.slice(0, HERO_PICTURES).map((v) => `https://i.ytimg.com/vi/${v.id}/maxresdefault.jpg`),
    ...newest.slice(0, CARD_PICTURES).map((v) => v.thumbnail),
  ];

  onStep({ label: 'Getting the pictures ready…', progress: 0.7 });
  let fetched = 0;
  await Promise.all(
    pictures.map((uri) =>
      // The same cache the cards read from, so the pictures show instantly.
      Image.prefetch(uri, 'memory-disk')
        .catch(() => false)
        .then(() => {
          fetched++;
          onStep({ label: 'Getting the pictures ready…', progress: 0.7 + 0.28 * (fetched / pictures.length) });
        }),
    ),
  );
  onStep({ label: 'All set', progress: 1 });
}
