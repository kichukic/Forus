import AsyncStorage from '@react-native-async-storage/async-storage';
import { showToast } from '../data/toasts';

const TRAKT_API = 'https://api.trakt.tv';
const STORAGE_KEY = '@forus_trakt_session_v1';
const SETTINGS_KEY = '@forus_trakt_settings_v1';

// Default public Trakt Client ID (can be overridden by user in settings if desired)
export const DEFAULT_TRAKT_CLIENT_ID = '3752e257dbda899320e8b233a7cb54c46f3d9ce459d81d582855f41dc7321526';

export type TraktSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  username: string;
  name?: string;
  avatar?: string;
};

export type DeviceCodeResponse = {
  device_code: string;
  user_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
};

export type TraktScrobblePayload = {
  title: string;
  year?: number;
  progress: number; // 0 - 100
  imdbId?: string;
  tmdbId?: number | string;
};

let currentSession: TraktSession | null = null;
let sessionLoaded = false;
let autoScrobbleEnabled = true;

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function subscribeTrakt(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export async function getTraktSession(): Promise<TraktSession | null> {
  if (!sessionLoaded) {
    sessionLoaded = true;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) currentSession = JSON.parse(raw);
      const rawSettings = await AsyncStorage.getItem(SETTINGS_KEY);
      if (rawSettings !== null) autoScrobbleEnabled = rawSettings === 'true';
    } catch {
      currentSession = null;
    }
  }
  return currentSession;
}

// Initial load
getTraktSession().then(() => notify());

export function useTrakt(): { session: TraktSession | null; autoScrobble: boolean } {
  return {
    session: currentSession,
    autoScrobble: autoScrobbleEnabled,
  };
}

export async function setAutoScrobble(enabled: boolean) {
  autoScrobbleEnabled = enabled;
  await AsyncStorage.setItem(SETTINGS_KEY, String(enabled));
  notify();
}

async function traktHeaders(token?: string): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'trakt-api-version': '2',
    'trakt-api-key': DEFAULT_TRAKT_CLIENT_ID,
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

/** Requests a device authorization code to show on screen. */
export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const res = await fetch(`${TRAKT_API}/oauth/device/code`, {
    method: 'POST',
    headers: await traktHeaders(),
    body: JSON.stringify({ client_id: DEFAULT_TRAKT_CLIENT_ID }),
  });
  if (!res.ok) throw new Error(`Trakt auth failed: ${res.statusText}`);
  return res.json();
}

/** Polls Trakt until user authorizes the code at trakt.tv/activate */
export async function pollDeviceToken(deviceCode: string): Promise<TraktSession> {
  const res = await fetch(`${TRAKT_API}/oauth/device/token`, {
    method: 'POST',
    headers: await traktHeaders(),
    body: JSON.stringify({
      code: deviceCode,
      client_id: DEFAULT_TRAKT_CLIENT_ID,
    }),
  });

  if (res.status === 400) throw new Error('Pending'); // Not yet authorized
  if (res.status === 404) throw new Error('Invalid code');
  if (res.status === 409) throw new Error('Code already used');
  if (res.status === 410) throw new Error('Code expired');
  if (res.status === 418) throw new Error('User denied access');
  if (res.status === 429) throw new Error('Rate limit exceeded');
  if (!res.ok) throw new Error(`Trakt poll error (${res.status})`);

  const tokenData = await res.json();
  const accessToken = tokenData.access_token;
  const refreshToken = tokenData.refresh_token;
  const expiresAt = Date.now() + (tokenData.expires_in ?? 7776000) * 1000;

  // Fetch username
  const userRes = await fetch(`${TRAKT_API}/users/me`, {
    headers: await traktHeaders(accessToken),
  });
  let username = 'TraktUser';
  let name = '';
  let avatar = '';
  if (userRes.ok) {
    const userData = await userRes.json();
    username = userData.username ?? 'TraktUser';
    name = userData.name ?? '';
    avatar = userData.images?.avatar?.full ?? '';
  }

  const session: TraktSession = {
    accessToken,
    refreshToken,
    expiresAt,
    username,
    name,
    avatar,
  };

  currentSession = session;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  notify();
  showToast({ text: `Connected to Trakt as @${username}` });
  return session;
}

/** Disconnects the Trakt account. */
export async function disconnectTrakt() {
  currentSession = null;
  await AsyncStorage.removeItem(STORAGE_KEY);
  notify();
  showToast({ text: 'Disconnected Trakt.tv' });
}

/** Sends a playback scrobble event (start, pause, or stop) to Trakt.tv */
export async function scrobble(
  action: 'start' | 'pause' | 'stop',
  media: TraktScrobblePayload,
) {
  const session = await getTraktSession();
  if (!session || !autoScrobbleEnabled) return;

  try {
    const cleanProgress = Math.min(100, Math.max(0, Math.round(media.progress)));
    const moviePayload: Record<string, unknown> = {
      title: media.title,
    };
    if (media.year) moviePayload.year = media.year;
    const ids: Record<string, unknown> = {};
    if (media.imdbId) ids.imdb = media.imdbId;
    if (media.tmdbId) ids.tmdb = Number(media.tmdbId) || media.tmdbId;
    if (Object.keys(ids).length > 0) moviePayload.ids = ids;

    await fetch(`${TRAKT_API}/scrobble/${action}`, {
      method: 'POST',
      headers: await traktHeaders(session.accessToken),
      body: JSON.stringify({
        movie: moviePayload,
        progress: cleanProgress,
      }),
    });
  } catch {
    // Scrobble failures are non-fatal
  }
}

/** Fetches the user's Trakt watchlist */
export async function getTraktWatchlist(): Promise<{ title: string; year?: number; imdb?: string; tmdb?: number }[]> {
  const session = await getTraktSession();
  if (!session) return [];

  try {
    const res = await fetch(`${TRAKT_API}/sync/watchlist/movies`, {
      headers: await traktHeaders(session.accessToken),
    });
    if (!res.ok) return [];
    const list = await res.json();
    return (list ?? []).map((item: any) => ({
      title: item.movie?.title ?? 'Untitled',
      year: item.movie?.year,
      imdb: item.movie?.ids?.imdb,
      tmdb: item.movie?.ids?.tmdb,
    }));
  } catch {
    return [];
  }
}
