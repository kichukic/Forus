import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Directory,
  File,
  Paths,
  DownloadTask,
  type DownloadPauseState,
  type DownloadProgress,
} from 'expo-file-system';
import * as Notifications from 'expo-notifications';
import { colors, isTV } from '../theme';
import { showToast } from './toasts';

const STORAGE_KEY = '@forus_offline_downloads_v1';
const CHANNEL_PROGRESS = 'download_progress_v3';
const CHANNEL_COMPLETE = 'download_complete_v3';
// Two at a time keeps a queue moving without starving the stream being watched.
const MAX_ACTIVE = 2;

export type DownloadStatus = 'queued' | 'downloading' | 'paused' | 'completed' | 'failed';

export type DownloadItem = {
  id: string; // unique identifier (e.g. mb_12345 or tb_987)
  title: string;
  poster?: string;
  url: string;
  localUri: string;
  kind: 'moviebox' | 'file' | 'stream';
  size?: number;
  downloadedBytes: number;
  totalBytes: number;
  progress: number; // 0 to 100
  status: DownloadStatus;
  error?: string;
  /** Native resume data, kept while the download is paused or queued. */
  resumeState?: DownloadPauseState;
  createdAt: number;
};

let downloads: DownloadItem[] = [];
let loaded = false;
let channelsConfigured = false;
const listeners = new Set<() => void>();
const activeTasks = new Map<string, DownloadTask>();
const queue: string[] = [];
const pauseRequested = new Set<string>();
const lastNotice = new Map<string, number>();

function notify() {
  listeners.forEach((fn) => fn());
}

async function persist() {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(downloads));
  } catch {
    // ignore
  }
}

function itemById(id: string): DownloadItem | undefined {
  return downloads.find((entry) => entry.id === id);
}

function update(id: string, patch: Partial<DownloadItem>, save = true) {
  downloads = downloads.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry));
  notify();
  if (save) void persist();
}

export async function setupDownloadNotifications() {
  if (isTV || channelsConfigured) return;
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL_PROGRESS, {
      name: 'Download Progress',
      importance: Notifications.AndroidImportance.LOW,
      showBadge: false,
      enableVibrate: false,
      sound: null,
    });
    await Notifications.setNotificationChannelAsync(CHANNEL_COMPLETE, {
      name: 'Completed Downloads',
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: colors.accent,
      enableVibrate: true,
    });
    channelsConfigured = true;
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) {
      await Notifications.requestPermissionsAsync();
    }
  } catch {
    // ignore
  }
}

export async function initDownloads() {
  if (loaded) return;
  loaded = true;
  await setupDownloadNotifications();
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // A kill or a reboot leaves no resume data behind; keep the entries so
        // they can be retried, but never pretend they are still moving.
        downloads = parsed
          .filter((entry) => entry && typeof entry.id === 'string')
          .map((entry) =>
            entry.status === 'downloading' || entry.status === 'queued'
              ? { ...entry, status: 'paused' }
              : entry,
          );
      }
    }
  } catch {
    downloads = [];
  }
  notify();
}

// Initial load
initDownloads().catch(() => {});

export function useDownloads(): DownloadItem[] {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => downloads,
  );
}

function getDownloadsDirectory(): Directory {
  const dir = new Directory(Paths.document, 'downloads');
  if (!dir.exists) {
    dir.create({ idempotent: true });
  }
  return dir;
}

function sanitizeFilename(id: string): string {
  return `${id.replace(/[^a-zA-Z0-9_-]/g, '_')}.mp4`;
}

/** Formats byte sizes into human-readable strings (e.g. 1.25 GB, 350 MB). */
export function formatBytes(bytes: number = 0): string {
  if (!bytes || bytes <= 0) return '0 MB';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function dismissNotice(id: string) {
  lastNotice.delete(id);
  Notifications.dismissNotificationAsync(`dl_${id}`).catch(() => {});
}

function postProgressNotice(id: string, title: string, pct: number, written: number, total: number) {
  const now = Date.now();
  if (now - (lastNotice.get(id) ?? 0) < 1200) return;
  lastNotice.set(id, now);
  const body =
    total > 0 ? `${pct}% · ${formatBytes(written)} / ${formatBytes(total)}` : `${formatBytes(written)} downloaded`;
  Notifications.scheduleNotificationAsync({
    identifier: `dl_${id}`,
    content: {
      title: `Downloading ${title}`,
      body,
      sticky: true,
      autoDismiss: false,
      color: colors.accent,
      data: { kind: 'offline_download', id },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 1,
      channelId: CHANNEL_PROGRESS,
    },
  }).catch(() => {});
}

async function postStartingNotice(id: string, title: string) {
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: `dl_${id}`,
      content: {
        title: `Downloading ${title}`,
        body: 'Connecting…',
        sticky: true,
        autoDismiss: false,
        color: colors.accent,
        data: { kind: 'offline_download', id },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 1,
        channelId: CHANNEL_PROGRESS,
      },
    });
  } catch {
    // ignore
  }
}

function fail(id: string, error: unknown) {
  if (!itemById(id)) return;
  update(
    id,
    {
      status: 'failed',
      error: (error as Error)?.message || 'Download failed',
      resumeState: undefined,
    },
    true,
  );
  dismissNotice(id);
}

function onProgress(id: string, progress: DownloadProgress) {
  const item = itemById(id);
  if (!item || item.status !== 'downloading') return;
  const total = progress.totalBytes > 0 ? progress.totalBytes : item.totalBytes;
  const written = progress.bytesWritten ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((written / total) * 100)) : 0;
  downloads = downloads.map((entry) =>
    entry.id === id
      ? {
          ...entry,
          downloadedBytes: written,
          totalBytes: total,
          progress: pct,
        }
      : entry,
  );
  notify();
  postProgressNotice(id, item.title, pct, written, total);
}

async function run(id: string) {
  const item = itemById(id);
  if (!item || item.status !== 'queued') return;
  const targetFile = new File(item.localUri);
  let task: DownloadTask;
  try {
    if (item.resumeState) {
      task = DownloadTask.fromSavable(item.resumeState, {
        onProgress: (progress) => onProgress(id, progress),
      });
    } else {
      try {
        if (targetFile.exists) targetFile.delete();
      } catch {
        // A stale partial file can be overwritten by the download.
      }
      task = new DownloadTask(item.url, targetFile, {
        onProgress: (progress) => onProgress(id, progress),
      });
    }
  } catch (error) {
    fail(id, error);
    pump();
    return;
  }

  activeTasks.set(id, task);
  update(id, { status: 'downloading', error: undefined }, true);
  void postStartingNotice(id, item.title);

  try {
    const result = item.resumeState ? await task.resumeAsync() : await task.downloadAsync();
    if (pauseRequested.has(id)) return;
    const current = itemById(id);
    if (!current) return;
    if (result && targetFile.exists) {
      const size = targetFile.size ?? result.size ?? current.totalBytes;
      update(
        id,
        {
          status: 'completed',
          progress: 100,
          size,
          downloadedBytes: size,
          totalBytes: size,
          resumeState: undefined,
          error: undefined,
        },
        true,
      );
      dismissNotice(id);
      Notifications.scheduleNotificationAsync({
        content: {
          title: 'Download Complete',
          body: `${current.title} is ready for offline playback.`,
          color: colors.accent,
          data: { kind: 'offline_download', id },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 1,
          channelId: CHANNEL_COMPLETE,
        },
      }).catch(() => {});
    } else if (current.status !== 'paused') {
      fail(id, new Error('Download stopped before it finished.'));
    }
  } catch (error) {
    if (!pauseRequested.has(id)) fail(id, error);
  } finally {
    activeTasks.delete(id);
    pauseRequested.delete(id);
    pump();
  }
}

/** Starts anything queued while there is room for it. */
function pump() {
  while (activeTasks.size < MAX_ACTIVE && queue.length > 0) {
    const id = queue.shift();
    if (!id) break;
    const item = itemById(id);
    if (!item || item.status !== 'queued') continue;
    void run(id);
  }
}

/** Whether this exact item is already saved on the phone. */
export async function isDownloaded(id: string): Promise<boolean> {
  await initDownloads();
  return itemById(id)?.status === 'completed';
}

/** Adds a download to the queue; the active ones start right away. */
export async function startDownload(params: {
  id: string;
  title: string;
  poster?: string;
  url: string;
  kind: 'moviebox' | 'file' | 'stream';
}) {
  if (isTV) {
    showToast({ text: 'Downloads are only supported on mobile devices' });
    return;
  }

  await initDownloads();

  const existing = itemById(params.id);
  if (existing?.status === 'completed') {
    showToast({ text: 'Title is already downloaded' });
    return;
  }
  if (existing) {
    if (existing.status === 'paused' || existing.status === 'failed') {
      await resumeDownload(existing.id);
      showToast({ text: `Resuming "${existing.title}"…` });
    } else {
      showToast({ text: 'This title is already downloading' });
    }
    return;
  }

  const dir = getDownloadsDirectory();
  const targetFile = new File(dir, sanitizeFilename(params.id));
  const item: DownloadItem = {
    id: params.id,
    title: params.title,
    poster: params.poster,
    url: params.url,
    localUri: targetFile.uri,
    kind: params.kind,
    downloadedBytes: 0,
    totalBytes: 0,
    progress: 0,
    status: 'queued',
    createdAt: Date.now(),
  };

  downloads = [item, ...downloads];
  notify();
  void persist();
  showToast({ text: `Queued "${params.title}" for download` });
  queue.push(params.id);
  pump();
}

/** Pauses an active download, or takes a queued one back out of the queue. */
export async function pauseDownload(id: string) {
  const item = itemById(id);
  if (!item) return;
  if (item.status === 'queued') {
    const index = queue.indexOf(id);
    if (index >= 0) queue.splice(index, 1);
    update(id, { status: 'paused' }, true);
    return;
  }
  if (item.status !== 'downloading') return;

  const task = activeTasks.get(id);
  if (!task) {
    update(id, { status: 'paused' }, true);
    return;
  }

  pauseRequested.add(id);
  try {
    await task.pauseAsync();
    const current = itemById(id);
    if (!current) return;
    if (current.status === 'completed') return;
    update(id, { status: 'paused', resumeState: task.savable(), error: undefined }, true);
    dismissNotice(id);
  } catch (error) {
    pauseRequested.delete(id);
    // The transfer may have finished while the pause was on its way.
    if (itemById(id)?.status === 'downloading') fail(id, error);
  }
}

/** Puts a paused or failed item back in the queue. */
export async function resumeDownload(id: string) {
  const item = itemById(id);
  if (!item || item.status === 'completed' || item.status === 'downloading' || item.status === 'queued') {
    return;
  }
  update(id, { status: 'queued', error: undefined }, true);
  if (!queue.includes(id)) queue.push(id);
  pump();
}

/** Retries a failed item from the beginning when no resume data is left. */
export async function retryDownload(id: string) {
  const item = itemById(id);
  if (!item || item.status === 'completed' || item.status === 'downloading') return;
  update(
    id,
    {
      status: 'queued',
      progress: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      error: undefined,
      resumeState: undefined,
    },
    true,
  );
  if (!queue.includes(id)) queue.push(id);
  pump();
}

/** Cancels and removes an active or failed download. */
export async function cancelDownload(id: string) {
  const index = queue.indexOf(id);
  if (index >= 0) queue.splice(index, 1);
  pauseRequested.delete(id);
  dismissNotice(id);

  const task = activeTasks.get(id);
  if (task) {
    try {
      task.cancel();
    } catch {
      // ignore
    }
    activeTasks.delete(id);
  }

  const item = itemById(id);
  if (item) {
    try {
      const file = new File(item.localUri);
      if (file.exists) file.delete();
    } catch {
      // ignore
    }
  }

  downloads = downloads.filter((entry) => entry.id !== id);
  notify();
  pump();
  void persist();
}

/** Deletes a completed download from local storage. */
export async function deleteDownload(id: string) {
  await cancelDownload(id);
  showToast({ text: 'Deleted offline download' });
}
