// The MovieBox API: the catalogue and the streams behind the MovieBoxTV app.
// Every request has to be signed, and one with a bad signature is turned away
// with "Signature invalid", so the signing lives here instead of being spread
// over the app.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAdultGenre, isAdultTitle } from '../data/safe';
import { stripEmoji } from '../data/text';
import { hexBytes, hmacMd5Base64, md5Hex, utf8Bytes } from './md5';

// The API answers on several hosts, and one of them being down is no reason
// to show the user an error.
const HOSTS = [
  'https://api6.aoneroom.com',
  'https://api5.aoneroom.com',
  'https://api4.aoneroom.com',
  'https://api6sg.aoneroom.com',
  'https://api.inmoviebox.com',
];

// The key the app signs its requests with.
const SECRET = 'efa891974eecd3148df63aa611602defd101259ba521022c57ae0566bd8e';

const BFF = '/wefeed-mobile-bff';
const TOKEN_KEY = 'moviebox-token';
const DEVICE_KEY = 'moviebox-device';
// A request that takes longer than this has failed.
const TIMEOUT_MS = 20000;
// The sections that hold something else entirely: live channels, music,
// football, games, and the one for adults.
const EXCLUDED_TABS = [9, 33, 4, 11];

export type MovieboxSubject = {
  id: string;
  title: string;
  /** A film is one subject, a series is several. */
  kind: 'movie' | 'series';
  poster?: string;
  backdrop?: string;
  year?: string;
  genre?: string;
  rating?: string;
  description?: string;
  duration?: string;
  country?: string;
  language?: string;
  contentRating?: string;
  /** How many seasons a series has. */
  seasons?: number;
  hasResource: boolean;
  /** Whether the full film is behind a membership in the app. */
  membersOnly: boolean;
  /**
   * The other language versions of the same film, each a subject of its own.
   * A film dubbed into Hindi is listed there as "Hindi dub".
   */
  dubs: MovieboxDub[];
};

export type MovieboxDub = {
  id: string;
  /** "Hindi dub", "Original Audio" and so on. */
  name: string;
  /** "hi", "te" and so on. */
  code: string;
  original: boolean;
};

export type MovieboxShelf = {
  title: string;
  subjects: MovieboxSubject[];
};

export type MovieboxEpisode = {
  season: number;
  episode: number;
  title: string;
  resolution: number;
  /** In bytes, as the API gives it. */
  size: number;
  /** In seconds. */
  duration: number;
  resourceId: string;
  /** The short file the API offers without a membership. */
  previewUrl: string;
};

export type MovieboxCast = { name: string; character: string }[];

type Param = [string, string];

// The posters come in sizes up to 3000 by 4000, and decoding one of those
// takes long enough to make the page stutter as it is scrolled. The picture
// service can make a smaller copy on the fly, which is what the app asks for.
export function smallerImage(
  url: string | undefined,
  width: number,
  height: number,
): string | undefined {
  if (!url) return undefined;
  if (!url.includes('pbcdn')) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}x-oss-process=image/resize,m_lfit,w_${width},h_${height}`;
}

type RawCover = { url?: string; width?: number; height?: number; averageHueLight?: string };

type RawSubject = {
  subjectId?: string;
  subjectType?: number;
  title?: string;
  description?: string;
  releaseDate?: string;
  genre?: string;
  duration?: string;
  durationSeconds?: number;
  countryName?: string;
  language?: string;
  contentRating?: string;
  imdbRatingValue?: string;
  seNum?: number;
  hasResource?: boolean;
  // The service marks the films that are not for children.
  restrictKid?: number;
  cover?: RawCover;
  stills?: RawCover;
  vipInfo?: { requireMemberType?: number; previewSeconds?: number };
  staffList?: { name?: string; character?: string }[];
  dubs?: { subjectId?: string; lanName?: string; lanCode?: string; original?: boolean }[];
};

// Whether the service has marked this film as one for adults.
function isAdult(raw: RawSubject): boolean {
  // The service also flags ordinary films that are rated for adults only.
  if (raw.restrictKid === 1) return true;
  if (isAdultGenre(raw.genre)) return true;
  return isAdultTitle(raw.title ?? '');
}

function toSubject(raw: RawSubject): MovieboxSubject | null {
  if (!raw?.subjectId || !raw.title) return null;
  // Films for adults are left out, so they turn up nowhere in the app.
  if (isAdult(raw)) return null;
  // Skip cam rips.
  if (/\bcam\b/i.test(raw.title ?? '')) return null;
  return {
    id: String(raw.subjectId),
    // The service puts emoji in its titles too, so they are taken out.
    title: stripEmoji(raw.title),
    // A film is one subject. Everything else is a series of episodes: the
    // usual one, and the short dramas, which the app counts separately.
    kind: (raw.subjectType ?? 1) === 1 ? 'movie' : 'series',
    poster: smallerImage(raw.cover?.url, 360, 540),
    backdrop: smallerImage(raw.stills?.url ?? raw.cover?.url, 720, 1080),
    year: raw.releaseDate ? String(raw.releaseDate).slice(0, 4) : undefined,
    genre: raw.genre,
    rating: raw.imdbRatingValue,
    description: raw.description,
    duration: raw.duration,
    country: raw.countryName,
    language: raw.language,
    contentRating: raw.contentRating,
    seasons: raw.seNum,
    hasResource: raw.hasResource !== false,
    membersOnly: (raw.vipInfo?.requireMemberType ?? 0) > 0,
    dubs: (raw.dubs ?? [])
      .filter((dub) => dub.subjectId)
      .map((dub) => ({
        id: String(dub.subjectId),
        name: dub.lanName || 'Original Audio',
        code: dub.lanCode ?? '',
        original: dub.original === true,
      })),
  };
}

// The device the app pretends to be. It is kept between launches, so the
// service sees the same phone each time.
type Device = { deviceId: string; gaid: string; userAgent: string };
let device: Device | null = null;

function randomHex(length: number): string {
  let out = '';
  while (out.length < length) out += Math.floor(Math.random() * 16).toString(16);
  return out;
}

function randomId(): string {
  return `${randomHex(8)}-${randomHex(4)}-${randomHex(4)}-${randomHex(4)}-${randomHex(12)}`;
}

async function getDevice(): Promise<Device> {
  if (device) return device;
  let saved: Partial<Device> | null = null;
  try {
    const raw = await AsyncStorage.getItem(DEVICE_KEY);
    saved = raw ? JSON.parse(raw) : null;
  } catch {
    saved = null;
  }
  const versionCode = 50020117;
  device = {
    deviceId: saved?.deviceId ?? randomHex(32),
    gaid: saved?.gaid ?? randomId(),
    userAgent:
      saved?.userAgent ??
      `com.community.oneroom/${versionCode} (Linux; U; Android 13; en_US; M2012K11AG; Build/TQ2A.230405.003; Cronet/135.0.7012.3)`,
  };
  if (!saved) AsyncStorage.setItem(DEVICE_KEY, JSON.stringify(device)).catch(() => {});
  return device;
}

function clientInfo(info: Device): string {
  return JSON.stringify({
    package_name: 'com.community.oneroom',
    version_name: '4.0.01.0813.03',
    version_code: 50020117,
    os: 'android',
    os_version: '13',
    install_ch: 'ps',
    device_id: info.deviceId,
    install_store: 'ps',
    gaid: info.gaid,
    brand: 'Xiaomi',
    model: 'M2012K11AG',
    system_language: 'en',
    net: 'NETWORK_WIFI',
    region: 'US',
    timezone: 'Asia/Kolkata',
    sp_code: '40401',
    'X-Play-Mode': '2',
  });
}

// The service is told the request came from somewhere else, the way the app
// does it, so a phone's own address is never the reason a request is refused.
function forwardedFor(): string {
  return `103.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}.${
    Math.floor(Math.random() * 254) + 1
  }`;
}

// The signature is made over the query in the same order every time, so the
// parts of it are sorted by name before they are hashed.
function canonicalQuery(params: Param[]): string {
  if (params.length === 0) return '';
  return params
    .map((param, index) => ({ key: param[0], value: param[1], index }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.index - b.index))
    .map((part) => `${part.key}=${part.value}`)
    .join('&');
}

let token: string | null = null;
let signingIn: Promise<string> | null = null;

async function storedToken(): Promise<string | null> {
  if (token) return token;
  try {
    token = await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    token = null;
  }
  return token;
}

async function signIn(): Promise<string> {
  const body = await request<{ token: string }>(
    'POST',
    `${BFF}/user-api/visitor-login`,
    [],
    {},
    false,
  );
  const fresh = body?.token;
  if (!fresh) throw new Error('MovieBox would not let the app in.');
  token = fresh;
  AsyncStorage.setItem(TOKEN_KEY, fresh).catch(() => {});
  return fresh;
}

async function getToken(): Promise<string> {
  const saved = await storedToken();
  if (saved) return saved;
  // One sign-in at a time, however many calls are waiting for it.
  if (!signingIn) {
    signingIn = signIn().finally(() => {
      signingIn = null;
    });
  }
  return signingIn;
}

async function request<T>(
  method: 'GET' | 'POST',
  path: string,
  params: Param[] = [],
  body?: unknown,
  auth = true,
  attempt = 0,
): Promise<T> {
  const query = params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
  const fullPath = query ? `${path}?${query}` : path;
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const ts = Date.now();
  const info = await getDevice();

  // What the service hashes: the request, the timestamp and the body.
  const canonical = [
    method,
    'application/json',
    'application/json',
    payload === undefined ? '' : String(utf8Bytes(payload).length),
    String(ts),
    payload === undefined ? '' : md5Hex(payload),
    canonicalQuery(params) ? `${path}?${canonicalQuery(params)}` : path,
  ].join('\n');

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Connection: 'keep-alive',
    'x-client-token': `${ts},${md5Hex(String(ts).split('').reverse().join(''))}`,
    'x-tr-signature': `${ts}|2|${hmacMd5Base64(hexBytes(SECRET), canonical)}`,
    'x-client-info': clientInfo(info),
    'x-client-status': '0',
    'x-forwarded-for': forwardedFor(),
    'User-Agent': info.userAgent,
  };
  if (auth) headers.Authorization = `Bearer ${await getToken()}`;

  let lastError = 'Could not reach MovieBox.';
  for (const host of HOSTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${host}${fullPath}`, {
        method,
        headers,
        body: payload,
        signal: controller.signal,
      });
      if (res.status === 401 || res.status === 407) {
        // The token is no good. A new one is fetched and the request tried again.
        if (attempt === 0) {
          token = null;
          AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
          return request<T>(method, path, params, body, auth, 1);
        }
        throw new Error('MovieBox turned the request away.');
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        lastError = text ? `MovieBox said ${res.status}.` : `MovieBox said ${res.status}.`;
        continue;
      }
      const json = await res.json();
      if (json && typeof json.code === 'number' && json.code !== 0) {
        throw new Error(json.message || 'MovieBox turned the request away.');
      }
      return (json?.data ?? json) as T;
    } catch (error) {
      if (error instanceof Error && error.message.includes('turned the request away')) throw error;
      lastError = error instanceof Error ? error.message : String(error);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(lastError);
}

// --- The catalogue --------------------------------------------------------

/** The sections of the app: Trending, Movie, Anime, TV and the rest. */
export async function browseTabs(): Promise<{ id: number; name: string }[]> {
  const data = await request<{
    bottomTabs?: { subTabs?: { tabId?: number; name?: string; type?: string }[] }[];
  }>('GET', `${BFF}/subject-api/bottom-tab`);
  const tabs: { id: number; name: string }[] = [];
  const seen = new Set<number>();
  for (const bottom of data?.bottomTabs ?? []) {
    for (const sub of bottom.subTabs ?? []) {
      const id = sub.tabId ?? 0;
      // The tabs that are films, series and shows. The rest are live channels,
      // music, football and games, which are not this app's business.
      if (!['TrenTab', 'OperateTab', 'SubjTab'].includes(sub.type ?? '')) continue;
      if (!id || seen.has(id) || EXCLUDED_TABS.includes(id)) continue;
      seen.add(id);
      tabs.push({ id, name: sub.name ?? 'Films' });
    }
  }
  return tabs;
}

// The sections are kept for a few minutes, so a tab opens straight away.
const shelfCache = new Map<number, { at: number; shelves: MovieboxShelf[] }>();
const SHELF_CACHE_MS = 3 * 60 * 1000;

/** The rows of films on one of those sections. */
export async function browseShelves(tabId: number): Promise<MovieboxShelf[]> {
  const held = shelfCache.get(tabId);
  if (held && Date.now() - held.at < SHELF_CACHE_MS) return held.shelves;
  const data = await request<{ items?: { title?: string; subjects?: RawSubject[] }[] }>(
    'GET',
    '/wefeed-mobile-bff/tab-operating',
    [
      ['page', '1'],
      ['tabId', String(tabId)],
      ['version', '1'],
    ],
  );
  const shelves: MovieboxShelf[] = [];
  for (const item of data?.items ?? []) {
    const subjects = (item.subjects ?? [])
      .map(toSubject)
      .filter((s): s is MovieboxSubject => s !== null);
    // Only the rows that actually hold films are shown.
    if (subjects.length === 0) continue;
    // The headings come with emojis of their own.
    shelves.push({ title: stripEmoji(item.title || 'Films'), subjects });
  }
  if (shelves.length > 0) shelfCache.set(tabId, { at: Date.now(), shelves });
  return shelves;
}

/** Forgets the sections, so the next visit fetches them again. */
export function clearMovieboxCache(): void {
  shelfCache.clear();
}

export type MovieboxSearch = {
  subjects: MovieboxSubject[];
  hasMore: boolean;
  nextPage: number;
};

/** Films and series matching what someone typed. */
export async function searchSubjects(keyword: string, page = 1): Promise<MovieboxSearch> {
  const data = await request<{
    results?: { subjects?: RawSubject[] }[];
    pager?: { hasMore?: boolean; nextPage?: string | number };
  }>('POST', `${BFF}/subject-api/search/v2`, [], {
    keyword: keyword.trim(),
    page,
    perPage: 15,
    subjectType: 0,
  });

  const subjects: MovieboxSubject[] = [];
  const seen = new Set<string>();
  for (const group of data?.results ?? []) {
    for (const raw of group.subjects ?? []) {
      const subject = toSubject(raw);
      if (!subject || seen.has(subject.id)) continue;
      seen.add(subject.id);
      subjects.push(subject);
    }
  }
  const next = Number(data?.pager?.nextPage ?? page + 1);
  return {
    subjects,
    // The page's own count is the surest sign that there is more to come.
    hasMore: (data?.pager?.hasMore ?? false) || subjects.length >= 15,
    nextPage: Number.isFinite(next) && next > page ? next : page + 1,
  };
}

/** Everything known about one film or series. */
export async function subjectDetails(id: string): Promise<{ subject: MovieboxSubject; cast: MovieboxCast }> {
  const data = await request<RawSubject>('GET', `${BFF}/subject-api/get`, [['subjectId', id]]);
  const subject = toSubject(data ?? {});
  if (!subject) throw new Error('MovieBox has nothing for this title.');
  const cast: MovieboxCast = (data?.staffList ?? [])
    .filter((person) => person?.name)
    .map((person) => ({ name: person.name ?? '', character: person.character ?? '' }));
  return { subject, cast };
}

export type MovieboxSeason = { season: number; episodes: number; resolution: number };

/** The seasons of a series, and how many episodes each one has. */
export async function seasonList(id: string): Promise<MovieboxSeason[]> {
  const data = await request<{
    seasons?: { se?: number; maxEp?: number; resolutions?: { resolution?: number }[] }[];
  }>('GET', `${BFF}/subject-api/season-info`, [['subjectId', id]]);
  return (data?.seasons ?? [])
    .filter((season) => (season.se ?? 0) > 0)
    .map((season) => ({
      season: season.se ?? 0,
      episodes: season.maxEp ?? 0,
      resolution: season.resolutions?.[0]?.resolution ?? 0,
    }));
}

// The service hands out at most twenty episodes of a season at a time.
const EPISODES_PER_CALL = 20;

type RawEpisode = {
  title?: string;
  se?: number;
  ep?: number;
  resolution?: number;
  size?: string | number;
  duration?: number;
  resourceId?: string;
  resourceLink?: string;
};

function toEpisode(raw: RawEpisode, season: number): MovieboxEpisode | null {
  if (!raw?.resourceId) return null;
  return {
    season: raw.se ?? season,
    episode: raw.ep ?? 0,
    title: raw.title || '',
    resolution: raw.resolution ?? 0,
    size: Number(raw.size ?? 0),
    duration: raw.duration ?? 0,
    resourceId: String(raw.resourceId),
    previewUrl: raw.resourceLink ?? '',
  };
}

/** The episodes of one season. */
export async function seasonEpisodes(
  id: string,
  season: number,
  count: number,
): Promise<MovieboxEpisode[]> {
  const episodes: MovieboxEpisode[] = [];
  const total = Math.min(count || EPISODES_PER_CALL, 100);
  for (let from = 1; from <= total; from += EPISODES_PER_CALL) {
    const to = Math.min(from + EPISODES_PER_CALL - 1, total);
    const data = await request<{ list?: RawEpisode[] }>(
      'GET',
      `${BFF}/subject-api/resource/v2`,
      [
        ['subjectId', id],
        ['page', '1'],
        ['perPage', String(EPISODES_PER_CALL)],
        ['all', '0'],
        ['startPosition', '1'],
        ['endPosition', '1'],
        ['pagerMode', '2'],
        ['resolution', '0'],
        ['se', String(season)],
        ['epFrom', String(from)],
        ['epTo', String(to)],
        ['isVip', 'true'],
      ],
    );
    for (const raw of data?.list ?? []) {
      const episode = toEpisode(raw, season);
      if (episode) episodes.push(episode);
    }
  }
  // The same episode can come back in several qualities; the best one is kept.
  const best = new Map<number, MovieboxEpisode>();
  for (const episode of episodes) {
    const held = best.get(episode.episode);
    if (!held || episode.resolution > held.resolution) best.set(episode.episode, episode);
  }
  return [...best.values()].sort((a, b) => a.episode - b.episode);
}

/** The files of one film, or of one episode of a series. */
export async function playableRows(
  id: string,
  season: number,
  episode: number,
): Promise<MovieboxEpisode[]> {
  const rows = await fetchRows(id, season, episode);
  if (rows.length > 0) return rows;
  // A film is sometimes filed as the first episode of a first season, so the
  // other way round is tried before giving up.
  if (season === 0 && episode === 0) return fetchRows(id, 1, 1);
  return [];
}

async function fetchRows(
  id: string,
  season: number,
  episode: number,
): Promise<MovieboxEpisode[]> {
  const data = await request<{ list?: RawEpisode[] }>(
    'GET',
    `${BFF}/subject-api/resource/v2`,
    [
      ['subjectId', id],
      ['page', '1'],
      ['perPage', '8'],
      ['all', '0'],
      ['startPosition', '1'],
      ['endPosition', '1'],
      ['pagerMode', '2'],
      ['resolution', '0'],
      ['se', String(season)],
      ['epFrom', String(episode)],
      ['epTo', String(episode)],
      ['isVip', 'true'],
    ],
  );
  return (data?.list ?? [])
    .map((raw) => toEpisode(raw, season))
    .filter((row): row is MovieboxEpisode => row !== null);
}

export type MovieboxStream = {
  /** A link to the whole file. */
  url: string;
  size: number;
  resolution: number;
  /** True when the link is the whole film and not the short preview. */
  whole: boolean;
};

/**
 * The link to the file itself.
 *
 * The service offers a short preview to everyone, and keeps the whole file
 * behind one more request: the same one the patched app uses, which asks for
 * the file by its id and gets the full-length file back.
 */
export async function directStream(
  id: string,
  episode: MovieboxEpisode,
): Promise<MovieboxStream> {
  const preview: MovieboxStream = {
    url: episode.previewUrl,
    size: episode.size,
    resolution: episode.resolution,
    whole: false,
  };
  if (!episode.resourceId) return preview;

  const data = await request<{ list?: { resourceLink?: string; size?: string | number; resolution?: number }[] }>(
    'GET',
    `${BFF}/subject-api/resource-position/v2`,
    [
      ['subjectId', id],
      ['resourceId', episode.resourceId],
      ['failUrl', episode.previewUrl],
      ['failCode', '404'],
      ['resourceNum', '0'],
      ['isVip', 'true'],
    ],
  );
  const found = data?.list?.[0];
  const url = found?.resourceLink;
  if (!url) return preview;
  const size = Number(found?.size ?? episode.size);
  return {
    url,
    size,
    resolution: found?.resolution ?? episode.resolution,
    // The preview is a small file; anything bigger is the whole thing.
    whole: size > episode.size * 4,
  };
}

export type MovieboxCaption = {
  id: string;
  /** The language, as the service writes it: en, ml, hi. */
  language: string;
  /** The name of the language, for the person watching. */
  label: string;
  url: string;
};

/**
 * The subtitles for one film or episode.
 *
 * They belong to the file, so the id of the file is needed as well.
 */
export async function captions(
  subjectId: string,
  resourceId: string,
): Promise<MovieboxCaption[]> {
  if (!resourceId) return [];
  const data = await request<{
    extCaptions?: { id?: string; lan?: string; lanName?: string; url?: string }[];
  }>('GET', `${BFF}/subject-api/get-ext-captions`, [
    ['subjectId', subjectId],
    ['resourceId', resourceId],
  ]);
  return (data?.extCaptions ?? [])
    .filter((caption) => !!caption.url)
    .map((caption) => ({
      id: caption.id ?? caption.lan ?? 'caption',
      language: caption.lan ?? 'und',
      label: caption.lanName ?? caption.lan ?? 'Subtitles',
      url: caption.url as string,
    }));
}

/**
 * Films to watch next.
 *
 * The service has no "more like this" of its own, so the films are taken
 * from the sections it shows, with the ones of the same sort first.
 */
export async function recommendations(subject: {
  id: string;
  genre?: string;
}): Promise<MovieboxSubject[]> {
  const shelves = await browseShelves(1).catch(() => [] as MovieboxShelf[]);
  const all: MovieboxSubject[] = [];
  const seen = new Set<string>();
  for (const shelf of shelves) {
    for (const candidate of shelf.subjects) {
      if (candidate.id === subject.id || seen.has(candidate.id)) continue;
      seen.add(candidate.id);
      all.push(candidate);
    }
  }
  // The same sort of film comes first, then the rest.
  const genre = subject.genre?.split(',')[0]?.trim().toLowerCase();
  if (!genre) return all.slice(0, 12);
  const same = all.filter((candidate) => candidate.genre?.toLowerCase().includes(genre));
  const rest = all.filter((candidate) => !same.includes(candidate));
  return [...same, ...rest].slice(0, 12);
}

/** Drops the saved visitor token, so the next call signs in again. */
export function forgetMovieboxToken(): void {
  token = null;
  AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
}
