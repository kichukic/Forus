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
];

export const SHOWS: VideoSource[] = [
  { name: 'Zee Keralam', channelId: 'UCbrfwFuwMVRtxUTtEYJUKKg' },
  { name: 'Mazhavil Manorama', channelId: 'UCUPD0jQo-EP0B1Nf4uzeIMA' },
  { name: 'Kairali TV', channelId: 'UCqIIigEiYyPnWRxwd3drHwg' },
  // Asianet keeps full episodes on JioHotstar; YouTube has promos and clips.
  { name: 'Asianet (promos & clips)', channelId: 'UCp_r6Z-Oh0YTf-ym71z5Nqg' },
];

// Verified distributor channels that upload complete films for free. They also
// post trailers, songs and scenes, so only titles that say "full movie" are kept.
const FULL_MOVIE = /full movie|full length/i;

export const MOVIES: VideoSource[] = [
  { name: 'Speed Audio & Video', channelId: 'UCCylGvN1jEnQ3dB4iajSMCA', titleFilter: FULL_MOVIE },
  { name: 'Matinee Now', channelId: 'UCN8O3J_z9fdoF1xrYK89uOQ', titleFilter: FULL_MOVIE },
  { name: 'Musiczone Movies', channelId: 'UCVgAX4cKkI3VhYtVmHUBASg', titleFilter: FULL_MOVIE },
];
