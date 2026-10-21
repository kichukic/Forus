// Transfers that run in the background: a release that was sent to TorBox
// keeps being fetched there even after the screen that started it is gone.
//
// The store owns the polling, so it lives at module level and survives every
// screen change. Persistence means a transfer that is still running when the
// app is closed is picked up again on the next launch.

import { AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createTorrent, findTorrentByHash, getApiKey, getTorrent, mainVideoFile, type TorboxTorrent } from '../api/torbox';
import type { TorrentOption } from '../api/torrents';
import type { Playable } from '../types';
import { ensureTransferPermission, notifyTransferAdded, notifyTransferProgress, notifyTransferReady } from './transferNotices';

export type TransferState = 'sending' | 'downloading' | 'ready' | 'error';

export type Transfer = {
  id: string;
  hash: string;
  title: string;
  quality?: string;
  state: TransferState;
  progress: number;
  speed?: number;
  eta?: number;
  message?: string;
  torrentId?: number;
  fileId?: number;
};

const STORAGE_KEY = 'torbox-transfers';
const POLL_MS = 20000;

type Listener = (list: Transfer[]) => void;
type Notice = { kind: 'added' | 'ready' | 'error' | 'needsKey'; transfer: Transfer };

const transfers = new Map<string, Transfer>();
// Which progress milestones have already been announced, so a transfer is not
// announced twice.
const announced = new Set<string>();
const listeners = new Set<Listener>();
const noticeListeners = new Set<(n: Notice) => void>();

let timer: ReturnType<typeof setTimeout> | null = null;
// How many polls in a row have shown no progress. Used to back the interval off
// so an idle transfer does not wake the app every twenty seconds forever.
let stallCount = 0;
const prevProgress = new Map<string, number>();
let loaded = false;

function notify() {
  const list = [...transfers.values()];
  listeners.forEach((fn) => fn(list));
  persist();
}

function persist() {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...transfers.values()])).catch(() => {});
}

export function listTransfers(): Transfer[] {
  return [...transfers.values()];
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  listener(listTransfers());
  return () => listeners.delete(listener);
}

export function onNotice(listener: (n: Notice) => void): () => void {
  noticeListeners.add(listener);
  return () => noticeListeners.delete(listener);
}

function emitNotice(n: Notice) {
  noticeListeners.forEach((fn) => fn(n));
}

function setTransfer(id: string, patch: Partial<Transfer>) {
  const current = transfers.get(id);
  if (!current) return;
  const next = { ...current, ...patch };
  transfers.set(id, next);
  notify();
  if (next.state === 'downloading') ensurePoller();
}

export function dismiss(id: string) {
  transfers.delete(id);
  notify();
}

async function finish(id: string, torrent: TorboxTorrent) {
  const file = mainVideoFile(torrent);
  if (!file) {
    setTransfer(id, { state: 'error', message: 'That download has no video file in it.' });
    emitNotice({ kind: 'error', transfer: transfers.get(id)! });
    return;
  }
  const ready: Transfer = { ...transfers.get(id)!, state: 'ready', progress: 100, torrentId: torrent.id, fileId: file.id };
  transfers.set(id, ready);
  notify();
  emitNotice({ kind: 'ready', transfer: ready });
  ensureTransferPermission()
    .then((granted) => {
      if (granted) notifyTransferReady(ready, { kind: 'file', source: 'torrents', itemId: torrent.id, fileId: file.id, title: ready.title }).catch(() => {});
    })
    .catch(() => {});
}

async function runSend(id: string, option: TorrentOption) {
  const key = await getApiKey();
  if (!key) {
    setTransfer(id, { state: 'error', message: 'Connect your TorBox first, then pick a release.' });
    emitNotice({ kind: 'needsKey', transfer: transfers.get(id)! });
    return;
  }
  try {
    const existing = await findTorrentByHash(key, option.hash);
    let torrent: TorboxTorrent | null = null;
    if (existing) {
      torrent = existing;
      // A cached or completed torrent is ready right away, even when its
      // progress field says 0.
      if (existing.downloadFinished) {
        await finish(id, existing);
        return;
      }
      setTransfer(id, { state: 'downloading', torrentId: existing.id, progress: existing.progress, speed: existing.downloadSpeed, eta: existing.eta });
    } else {
      const created = await createTorrent(key, option.magnet, option.name);
      // TorBox may already have the file cached; the create response says so.
      if (created.downloadFinished) {
        // Build a torrent-like object from the create response.
        const cached: TorboxTorrent = {
          id: created.torrentId,
          hash: created.hash || option.hash,
          name: option.name,
          progress: 100,
          downloadState: created.downloadState || 'cached',
          downloadFinished: true,
          downloadPresent: true,
          files: (created.files ?? []).map((f) => ({
            id: f.id ?? 0,
            name: f.short_name || f.name || '',
            size: f.size ?? 0,
            mimetype: f.mimetype,
          })),
        };
        await finish(id, cached);
        return;
      }
      setTransfer(id, { state: 'downloading', torrentId: created.torrentId, progress: created.progress ?? 0 });
      // TorBox may take a moment to register a freshly created torrent, so
      // retry a few times before giving up and letting the poller take over.
      for (let attempt = 0; attempt < 5 && !torrent; attempt++) {
        await new Promise((r) => setTimeout(r, 1500));
        if (!transfers.has(id)) return;
        torrent = await getTorrent(key, created.torrentId).catch(() => null);
      }
      if (torrent) {
        if (torrent.downloadFinished) {
          await finish(id, torrent);
          return;
        }
        setTransfer(id, { progress: torrent.progress, speed: torrent.downloadSpeed, eta: torrent.eta });
      }
    }
    ensurePoller();
  } catch (e) {
    setTransfer(id, { state: 'error', message: String((e as Error).message ?? e) });
    emitNotice({ kind: 'error', transfer: transfers.get(id)! });
  }
}

export async function addTransfer(option: TorrentOption) {
  if (transfers.has(option.hash)) {
    const t = transfers.get(option.hash)!;
    emitNotice({ kind: 'added', transfer: t });
    return t;
  }
  const transfer: Transfer = {
    id: option.hash,
    hash: option.hash,
    title: option.name,
    quality: option.quality,
    state: 'sending',
    progress: 0,
  };
  transfers.set(option.hash, transfer);
  notify();
  emitNotice({ kind: 'added', transfer });
  ensureTransferPermission()
    .then((granted) => {
      if (granted) notifyTransferAdded(transfer).catch(() => {});
    })
    .catch(() => {});
  runSend(option.hash, option).catch(() => {});
  return transfer;
}

export function playableFrom(transfer: Transfer): Playable | null {
  if (transfer.state !== 'ready' || !transfer.torrentId || !transfer.fileId) return null;
  return {
    kind: 'file',
    source: 'torrents',
    itemId: transfer.torrentId,
    fileId: transfer.fileId,
    title: transfer.title,
  };
}

function ensurePoller() {
  if (timer) return;
  const tick = async () => {
    timer = null;
    if (AppState.currentState !== 'active') return;
    const active = [...transfers.values()].filter((t) => t.state === 'downloading');
    if (active.length === 0) {
      prevProgress.clear();
      return;
    }
    const key = await getApiKey().catch(() => null);
    if (!key) return;
    let moved = false;
    for (const t of active) {
      if (!t.torrentId) continue;
      try {
        const torrent = await getTorrent(key, t.torrentId);
        if (!torrent) continue;
        if (!torrent.downloadFinished) {
          const before = prevProgress.get(t.id);
          if (before === undefined || torrent.progress !== before) moved = true;
          prevProgress.set(t.id, torrent.progress);
          setTransfer(t.id, { state: "downloading", progress: torrent.progress, speed: torrent.downloadSpeed, eta: torrent.eta });
        } else {
          await finish(t.id, torrent);
          prevProgress.delete(t.id);
          moved = true;
        }
      } catch {
        // A hiccup is not the end of the download.
      }
    }
    // Back off when nothing is moving, so an idle transfer does not wake the
    // app every twenty seconds for an hour. The moment it moves, the beat is
    // back to twenty seconds.
    stallCount = moved ? 0 : stallCount + 1;
    const delay = stallCount >= 2 ? 60000 : 20000;
    timer = setTimeout(tick, delay);
  };
  timer = setTimeout(tick, 20000);
}

// Pick up transfers that were still running when the app was closed.
export async function loadTransfers() {
  if (loaded) return;
  loaded = true;
  let saved: Transfer[] = [];
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) saved = JSON.parse(raw) as Transfer[];
  } catch {
    saved = [];
  }
  for (const t of saved) {
    if (t.state === 'ready' || t.state === 'error') continue;
    transfers.set(t.id, { ...t, state: 'downloading' });
  }
  notify();
  const key = await getApiKey().catch(() => null);
  if (!key) return;
  for (const t of [...transfers.values()]) {
    if (t.state !== 'downloading' || !t.hash) continue;
    try {
      const existing = await findTorrentByHash(key, t.hash);
      if (existing) {
        if (existing.downloadFinished) {
          await finish(t.id, existing);
        } else {
          setTransfer(t.id, { state: 'downloading', torrentId: existing.id, progress: existing.progress, speed: existing.downloadSpeed, eta: existing.eta });
        }
      }
    } catch {
      // Leave it as it is.
    }
  }
  if ([...transfers.values()].some((t) => t.state === 'downloading')) ensurePoller();
}

// Pause polling when the app is in the background, and resume when it returns.
AppState.addEventListener('change', (status: AppStateStatus) => {
  if (status === 'active') {
    if ([...transfers.values()].some((t) => t.state === 'downloading')) ensurePoller();
  } else if (timer) {
    clearTimeout(timer);
    timer = null;
  }
});
