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
const POLL_MS = 5000;

type Listener = (list: Transfer[]) => void;
type Notice = { kind: 'added' | 'ready' | 'error' | 'needsKey'; transfer: Transfer };

const transfers = new Map<string, Transfer>();
// Which progress milestones have already been announced, so a transfer is not
// announced twice.
const announced = new Set<string>();
const listeners = new Set<Listener>();
const noticeListeners = new Set<(n: Notice) => void>();

let timer: ReturnType<typeof setInterval> | null = null;
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
  notifyTransferReady(ready, { kind: 'file', source: 'torrents', itemId: torrent.id, fileId: file.id, title: ready.title }).catch(() => {});
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
    let torrent: TorboxTorrent | null;
    if (existing) {
      torrent = existing;
      setTransfer(id, { state: 'downloading', torrentId: existing.id, progress: existing.progress, speed: existing.downloadSpeed, eta: existing.eta });
      if (existing.downloadFinished) {
        await finish(id, existing);
        return;
      }
    } else {
      const created = await createTorrent(key, option.magnet, option.name);
      setTransfer(id, { state: 'downloading', torrentId: created.torrentId, progress: 0 });
      torrent = await getTorrent(key, created.torrentId).catch(() => null);
      if (torrent) setTransfer(id, { progress: torrent.progress, speed: torrent.downloadSpeed, eta: torrent.eta });
    }
    if (torrent?.downloadFinished) {
      await finish(id, torrent);
      return;
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
  ensureTransferPermission().catch(() => {});
  notifyTransferAdded(transfer).catch(() => {});
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
  timer = setInterval(async () => {
    if (AppState.currentState !== 'active') return;
    const active = [...transfers.values()].filter((t) => t.state === 'downloading');
    if (active.length === 0) {
      clearInterval(timer!);
      timer = null;
      return;
    }
    const key = await getApiKey().catch(() => null);
    if (!key) return;
    for (const t of active) {
      if (!t.torrentId) continue;
      try {
        const torrent = await getTorrent(key, t.torrentId);
        if (!torrent) continue;
        if (!torrent.downloadFinished) {
          setTransfer(t.id, { state: "downloading", progress: torrent.progress, speed: torrent.downloadSpeed, eta: torrent.eta });
        } else {
          await finish(t.id, torrent);
        }
      } catch {
        // A hiccup is not the end of the download.
      }
    }
  }, POLL_MS);
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
    clearInterval(timer);
    timer = null;
  }
});
