// Live TV playlists and their cached channels. Playlists can be remote M3U
// links or files picked from the phone; the parsed channels live in the app's
// documents so the list opens without another download.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { fetchWithTimeout } from './http';
import { parseM3u, type M3uChannel } from './m3u';
import { parseXmltv, type EpgProgramme } from './xmltv';

const PLAYLISTS_KEY = '@forus_iptv_playlists_v1';
const MAX_PLAYLIST_BYTES = 15 * 1024 * 1024;
const MAX_GUIDE_BYTES = 25 * 1024 * 1024;

export type IptvPlaylist = {
  id: string;
  name: string;
  kind: 'url' | 'file';
  source: string;
  /** A saved copy of a picked file, so it can be refreshed later. */
  sourceUri?: string;
  epgUrl?: string;
  channelCount: number;
  addedAt: number;
  updatedAt: number;
};

export type IptvChannel = M3uChannel & { playlistId: string };
export type IptvGuide = Record<string, EpgProgramme[]>;
export type IptvData = {
  playlists: IptvPlaylist[];
  channels: IptvChannel[];
  guide: IptvGuide;
};

function folder(): Directory {
  const dir = new Directory(Paths.document, 'iptv');
  if (!dir.exists) dir.create({ idempotent: true, intermediates: true });
  return dir;
}

function channelsFile(id: string): File {
  return new File(folder(), `channels-${id}.json`);
}

function guideFile(id: string): File {
  return new File(folder(), `guide-${id}.json`);
}

function sourceFile(id: string): File {
  return new File(folder(), `source-${id}.m3u`);
}

async function readJson<T>(file: File): Promise<T | null> {
  try {
    if (!file.exists) return null;
    return JSON.parse(await file.text()) as T;
  } catch {
    return null;
  }
}

function writeJson(file: File, value: unknown): void {
  file.write(JSON.stringify(value));
}

async function loadPlaylists(): Promise<IptvPlaylist[]> {
  try {
    const raw = await AsyncStorage.getItem(PLAYLISTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is IptvPlaylist =>
        !!entry && typeof entry.id === 'string' && typeof entry.name === 'string',
    );
  } catch {
    return [];
  }
}

function savePlaylists(playlists: IptvPlaylist[]): Promise<void> {
  return AsyncStorage.setItem(PLAYLISTS_KEY, JSON.stringify(playlists));
}

function newId(): string {
  return `iptv_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

function playlistName(raw: string, fallback: string): string {
  const trimmed = raw.trim();
  if (trimmed) return trimmed.slice(0, 80);
  try {
    return new URL(fallback).hostname.replace(/^www\./i, '') || 'Live TV playlist';
  } catch {
    return 'Live TV playlist';
  }
}

async function fetchText(url: string, maxBytes: number): Promise<string> {
  if (!/^https?:\/\//i.test(url)) throw new Error('Playlist address must start with http:// or https://');
  const response = await fetchWithTimeout(
    url,
    {
      headers: {
        Accept: 'application/x-mpegURL, application/vnd.apple.mpegurl, application/xml, text/xml, text/plain, */*',
        'User-Agent': 'ForUs/1.0',
      },
    },
    30000,
  );
  if (!response.ok) throw new Error(`The playlist server answered ${response.status}.`);
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > maxBytes) throw new Error('That playlist is too large (over 15 MB).');
  const text = await response.text();
  if (text.length > maxBytes) throw new Error('That playlist is too large (over 15 MB).');
  return text;
}

async function fetchGuide(url: string | undefined): Promise<IptvGuide> {
  if (!url) return {};
  try {
    const text = await fetchText(url, MAX_GUIDE_BYTES);
    return parseXmltv(text);
  } catch {
    // A guide is a bonus; the channels still work without one.
    return {};
  }
}

function mergeGuide(target: IptvGuide, extra: IptvGuide): void {
  for (const [channelId, programmes] of Object.entries(extra)) {
    target[channelId] = [...(target[channelId] ?? []), ...programmes].sort((a, b) => a.start - b.start);
  }
}

/** Every saved playlist, its channels, and whatever guide was cached. */
export async function loadIptv(): Promise<IptvData> {
  const playlists = await loadPlaylists();
  const channels: IptvChannel[] = [];
  const guide: IptvGuide = {};
  for (const playlist of playlists) {
    const list = await readJson<M3uChannel[]>(channelsFile(playlist.id));
    if (list) {
      for (const channel of list) channels.push({ ...channel, playlistId: playlist.id });
    }
    const cachedGuide = await readJson<IptvGuide>(guideFile(playlist.id));
    if (cachedGuide) mergeGuide(guide, cachedGuide);
  }
  return { playlists, channels, guide };
}

export async function addPlaylistFromUrl(
  url: string,
  name?: string,
): Promise<{ playlist: IptvPlaylist; channels: number }> {
  const clean = url.trim();
  const text = await fetchText(clean, MAX_PLAYLIST_BYTES);
  const parsed = parseM3u(text);
  if (parsed.channels.length === 0) {
    throw new Error('No channels were found in that playlist.');
  }
  const id = newId();
  const now = Date.now();
  const playlist: IptvPlaylist = {
    id,
    name: playlistName(name ?? '', clean),
    kind: 'url',
    source: clean,
    ...(parsed.epgUrl ? { epgUrl: parsed.epgUrl } : {}),
    channelCount: parsed.channels.length,
    addedAt: now,
    updatedAt: now,
  };
  writeJson(channelsFile(id), parsed.channels);
  writeJson(guideFile(id), await fetchGuide(playlist.epgUrl));
  await savePlaylists([...(await loadPlaylists()), playlist]);
  return { playlist, channels: parsed.channels.length };
}

export async function addPlaylistFromFile(
  file: File,
  name?: string,
): Promise<{ playlist: IptvPlaylist; channels: number }> {
  if (file.size && file.size > MAX_PLAYLIST_BYTES) {
    throw new Error('That playlist is too large (over 15 MB).');
  }
  const text = await file.text();
  const parsed = parseM3u(text);
  if (parsed.channels.length === 0) {
    throw new Error('No channels were found in that playlist.');
  }
  const id = newId();
  const now = Date.now();
  const saved = sourceFile(id);
  saved.write(text);
  const playlist: IptvPlaylist = {
    id,
    name: playlistName(name ?? '', file.name.replace(/\.(m3u8?|txt)$/i, '')),
    kind: 'file',
    source: file.name,
    sourceUri: saved.uri,
    ...(parsed.epgUrl ? { epgUrl: parsed.epgUrl } : {}),
    channelCount: parsed.channels.length,
    addedAt: now,
    updatedAt: now,
  };
  writeJson(channelsFile(id), parsed.channels);
  writeJson(guideFile(id), await fetchGuide(playlist.epgUrl));
  await savePlaylists([...(await loadPlaylists()), playlist]);
  return { playlist, channels: parsed.channels.length };
}

/** Reloads one playlist from where it came, and its guide when it has one. */
export async function refreshPlaylist(id: string): Promise<number> {
  const playlists = await loadPlaylists();
  const playlist = playlists.find((entry) => entry.id === id);
  if (!playlist) throw new Error('Playlist not found.');

  const text =
    playlist.kind === 'url'
      ? await fetchText(playlist.source, MAX_PLAYLIST_BYTES)
      : await new File(playlist.sourceUri ?? '').text();
  const parsed = parseM3u(text);
  if (parsed.channels.length === 0) throw new Error('The playlist has no channels.');

  writeJson(channelsFile(id), parsed.channels);
  const epgUrl = parsed.epgUrl ?? playlist.epgUrl;
  const guide = await fetchGuide(epgUrl);
  if (Object.keys(guide).length > 0) writeJson(guideFile(id), guide);

  const updated: IptvPlaylist = {
    ...playlist,
    ...(epgUrl ? { epgUrl } : {}),
    channelCount: parsed.channels.length,
    updatedAt: Date.now(),
  };
  await savePlaylists(playlists.map((entry) => (entry.id === id ? updated : entry)));
  return parsed.channels.length;
}

export async function removePlaylist(id: string): Promise<void> {
  await savePlaylists((await loadPlaylists()).filter((entry) => entry.id !== id));
  for (const file of [channelsFile(id), guideFile(id), sourceFile(id)]) {
    try {
      if (file.exists) file.delete();
    } catch {
      // A leftover cache file is harmless.
    }
  }
}

/** The playlist a channel came from, for the "remove" question in the UI. */
export function playlistFor(data: IptvData, channel: IptvChannel): IptvPlaylist | undefined {
  return data.playlists.find((entry) => entry.id === channel.playlistId);
}
