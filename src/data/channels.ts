// Every source here is an official channel that publishes for free on YouTube.
// To add a channel, find its ID (starts with "UC") on its YouTube "About" page
// and add an entry. Nothing else in the app needs to change.

export type LiveChannel = {
  name: string;
  channelId: string;
  color: string;
};

export type VideoSource = {
  name: string;
  channelId: string;
  // Only keep uploads whose title matches, e.g. /full movie/i for a movie row.
  titleFilter?: RegExp;
};

export const LIVE_NEWS: LiveChannel[] = [
  { name: 'Asianet News', channelId: 'UCf8w5m0YsRa8MHQ5bwSGmbw', color: '#c62828' },
  { name: 'Manorama News', channelId: 'UCP0uG-mcMImgKnJz-VjJZmQ', color: '#1565c0' },
  { name: '24 News', channelId: 'UCup3etEdjyF1L3sRbU-rKLw', color: '#ef6c00' },
  { name: 'MediaOne', channelId: 'UC-f7r46JhYv78q5pGrO6ivA', color: '#2e7d32' },
  { name: 'Reporter TV', channelId: 'UCFx1nseXKTc1Culiu3neeSQ', color: '#6a1b9a' },
  { name: 'News18 Kerala', channelId: 'UC-mMi78WJST4N5o8_i1FoXw', color: '#ad1457' },
  { name: 'Mathrubhumi News', channelId: 'UCwXrBBZnIh2ER4lal6WbAHw', color: '#00838f' },
  { name: 'Kairali News', channelId: 'UCnEvxaWfVL91XIYuyQRO5QA', color: '#4e342e' },
  { name: 'Amrita News', channelId: 'UC3OuQHDTc6TcA0O_Hq83BMg', color: '#283593' },
];

export const SHOWS: VideoSource[] = [
  { name: 'Zee Keralam', channelId: 'UCbrfwFuwMVRtxUTtEYJUKKg' },
  { name: 'Mazhavil Manorama', channelId: 'UCUPD0jQo-EP0B1Nf4uzeIMA' },
  { name: 'Kairali TV', channelId: 'UCqIIigEiYyPnWRxwd3drHwg' },
  // Manorama's own channel: full Marimayam and Oru Chiri episodes.
  { name: 'manoramaMAX', channelId: 'UCz1ht-a2eKE_s1vMh3OHtIg' },
  { name: 'Flowers TV', channelId: 'UCSrS91iCgFCv_3KwjWWHzSg' },
  // Uppum Mulakum and other comedy shows.
  { name: 'Flowers Comedy', channelId: 'UCmAPdImtXLGh5E-lTTH4Qmg' },
  { name: 'Sun Surya', channelId: 'UCHyU1e7YmhHgUnVwpP5hpYA' },
  { name: 'Sun Surya Comedy', channelId: 'UCG9xw4kFo11e39yaaN09BtQ' },
  { name: 'Amrita TV', channelId: 'UCSFDSevWU-OX8cjZPZZZAnQ' },
  // Aliyans and Kaumudy's other serials.
  { name: 'Kaumudy', channelId: 'UCSVALYUGVruJ4I2RjhiudSQ' },
  // Sancharam travelogues and history documentaries.
  { name: 'Safari TV', channelId: 'UCfyulcK9tP84epquAb460UQ' },
  // Asianet keeps full episodes on JioHotstar; YouTube has promos and clips.
  { name: 'Asianet (promos & clips)', channelId: 'UCp_r6Z-Oh0YTf-ym71z5Nqg' },
];

// Verified distributor channels that upload complete films for free. They also
// post trailers, songs and scenes, so only titles that say "full movie" are kept
// (Hindi studios write "Full Hindi Movie" or "Hindi Full Movie").
export const FULL_MOVIE = /full (hindi )?movie|hindi full movie|full length/i;

export const MOVIES: VideoSource[] = [
  { name: 'Speed Audio & Video', channelId: 'UCCylGvN1jEnQ3dB4iajSMCA', titleFilter: FULL_MOVIE },
  { name: 'Matinee Now', channelId: 'UCN8O3J_z9fdoF1xrYK89uOQ', titleFilter: FULL_MOVIE },
  { name: 'Matinee Now HD', channelId: 'UCKH7E8Jr7_pFraJ9QEF5wdg', titleFilter: FULL_MOVIE },
  { name: 'Musiczone Movies', channelId: 'UCVgAX4cKkI3VhYtVmHUBASg', titleFilter: FULL_MOVIE },
  { name: 'Central Talkies', channelId: 'UC-y6ddbfjQiKV43LVfOKiMw', titleFilter: FULL_MOVIE },
];

// For the "For Disha Chotu" tab: Hindi films from the big studios' own channels.
export const HINDI_MOVIES: VideoSource[] = [
  { name: 'Ultra Movie Parlour', channelId: 'UCYauDsl-rswjQGpA0_-Z9Pw', titleFilter: FULL_MOVIE },
  { name: 'Shemaroo Movies', channelId: 'UCBOmfqgTZi7yDp4-3Lr_3lA', titleFilter: FULL_MOVIE },
  { name: 'Ultra Bollywood', channelId: 'UCmL1WlDI8UkXDXCXcBQN9CA', titleFilter: FULL_MOVIE },
  { name: 'Zee Movies Hindi', channelId: 'UCcWi9YwnWUsR53jV0T4ObKA', titleFilter: FULL_MOVIE },
  { name: 'Rajshri', channelId: 'UCEKWXRsfUHkan-D_ljU8Asw', titleFilter: FULL_MOVIE },
  { name: 'Venus Movies', channelId: 'UCpcsv3Ow-8IhoUGDEfPetsQ', titleFilter: FULL_MOVIE },
];

// No official channel posts Korean dramas in Hindi (they are licensed to paid
// apps); these are the official channels for Chinese dramas dubbed in Hindi.
export const HINDI_DRAMAS: VideoSource[] = [
  { name: 'Dyar Entertainment', channelId: 'UC2lLHs_L-bVRaJvaKLP7gXA' },
  { name: 'CCAP Hindi', channelId: 'UCWpl0xU2QoCilabHBfT0YBQ' },
];

// Official channels that only appear in search results, with no row of their own.
const SEARCH_ONLY_FILMS: VideoSource[] = [
  // Mohanlal's production house; recent uploads are mostly scenes.
  { name: 'Aashirvad Cinemas', channelId: 'UC_J44kyEsEB8LPlhfm2Xb4g' },
  // Distributors and production houses whose recent uploads are mostly short films,
  // scenes and trailers, but whose films turn up in search.
  { name: 'Saina Movies', channelId: 'UCeM3IXubMXTH3LdsMQ3VAhw' },
  { name: 'Friday Film House', channelId: 'UCv65_DW-OzwBgJw99zWJy3g' },
  { name: 'Goodwill Entertainments', channelId: 'UCq6f9bBWaWTHl0FhH167RgA' },
];
const SEARCH_ONLY_SHOWS: VideoSource[] = [{ name: 'Asianet Plus', channelId: 'UCjtSIpqwfNEd4H2ulPgn9yQ' }];

type Channel = { name: string; channelId: string };
const byId = (list: Channel[]) => new Map(list.map((c) => [c.channelId, c.name]));

// Search covers YouTube as a whole, which is full of pirated re-uploads, so it
// only keeps results from these channels.
export const TRUSTED_CHANNELS = byId([
  ...LIVE_NEWS,
  ...SHOWS,
  ...MOVIES,
  ...HINDI_MOVIES,
  ...HINDI_DRAMAS,
  ...SEARCH_ONLY_FILMS,
  ...SEARCH_ONLY_SHOWS,
]);

// Search follows the tab it was opened from: each tab only searches its own channels.
export type SearchScope = 'all' | 'movies' | 'shows' | 'disha' | 'news' | 'torbox';

export const SCOPE_CHANNELS: Record<Exclude<SearchScope, 'torbox'>, Map<string, string>> = {
  all: TRUSTED_CHANNELS,
  movies: byId([...MOVIES, ...SEARCH_ONLY_FILMS]),
  shows: byId([...SHOWS, ...SEARCH_ONLY_SHOWS]),
  disha: byId([...HINDI_MOVIES, ...HINDI_DRAMAS]),
  news: byId(LIVE_NEWS),
};
