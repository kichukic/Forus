import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths, DownloadTask, type DownloadProgress } from 'expo-file-system';
import * as Notifications from 'expo-notifications';
import { colors, isTV } from '../theme';
import { showToast } from './toasts';

const STORAGE_KEY = '@forus_offline_downloads_v1';
const CHANNEL_PROGRESS = 'download_progress_v3';
const CHANNEL_COMPLETE = 'download_complete_v3';

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
  status: 'downloading' | 'completed' | 'paused' | 'failed';
  error?: string;
  createdAt: number;
};

let downloads: DownloadItem[] = [];
let loaded = false;
let channelsConfigured = false;
const listeners = new Set<() => void>();
const activeTasks = new Map<string, DownloadTask>();

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
      downloads = JSON.parse(raw);
      // Mark any interrupted downloads as paused so user can retry or delete
      downloads = downloads.map((d) =>
        d.status === 'downloading' ? { ...d, status: 'paused' } : d,
      );
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

/** Begins an offline download in the background without blocking the caller. */
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

  const existing = downloads.find((d) => d.id === params.id);
  if (existing && existing.status === 'completed') {
    showToast({ text: 'Title is already downloaded' });
    return;
  }

  const dir = getDownloadsDirectory();
  const filename = sanitizeFilename(params.id);
  const targetFile = new File(dir, filename);

  // Clear previous failed attempt file if present
  try {
    if (targetFile.exists) {
      targetFile.delete();
    }
  } catch {
    // ignore
  }

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
    status: 'downloading',
    createdAt: Date.now(),
  };

  downloads = [item, ...downloads.filter((d) => d.id !== params.id)];
  notify();
  persist();
  showToast({ text: `Downloading "${params.title}"…` });

  // Post initial sticky notification to Android status bar
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: `dl_${params.id}`,
      content: {
        title: `Downloading ${params.title}`,
        body: 'Connecting…',
        sticky: true,
        autoDismiss: false,
        color: colors.accent,
        data: { kind: 'offline_download', id: params.id },
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

  // Run in background without awaiting so the UI does not block!
  void executeDownload(params, targetFile);
}

async function executeDownload(
  params: { id: string; title: string; poster?: string; url: string; kind: 'moviebox' | 'file' | 'stream' },
  targetFile: File,
) {
  let lastNotif = 0;
  try {
    const task = File.createDownloadTask(params.url, targetFile, {
      onProgress: (p: DownloadProgress) => {
        const total = p.totalBytes > 0 ? p.totalBytes : 0;
        const written = p.bytesWritten ?? 0;
        const pct = total > 0 ? Math.min(100, Math.round((written / total) * 100)) : 0;

        downloads = downloads.map((d) =>
          d.id === params.id
            ? {
                ...d,
                downloadedBytes: written,
                totalBytes: total,
                progress: pct,
                status: 'downloading',
              }
            : d,
        );
        notify();

        // Update status bar notification throttled every 1.2 seconds
        const now = Date.now();
        if (now - lastNotif > 1200) {
          lastNotif = now;
          const body =
            total > 0
              ? `${pct}% · ${formatBytes(written)} / ${formatBytes(total)}`
              : `${formatBytes(written)} downloaded`;
          Notifications.scheduleNotificationAsync({
            identifier: `dl_${params.id}`,
            content: {
              title: `Downloading ${params.title}`,
              body,
              sticky: true,
              autoDismiss: false,
              color: colors.accent,
              data: { kind: 'offline_download', id: params.id },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
              seconds: 1,
              channelId: CHANNEL_PROGRESS,
            },
          }).catch(() => {});
        }
      },
    });

    activeTasks.set(params.id, task);
    const result = await task.downloadAsync();
    activeTasks.delete(params.id);

    // Dismiss the ongoing progress notification from the status bar
    try {
      await Notifications.dismissNotificationAsync(`dl_${params.id}`);
    } catch {
      // ignore
    }

    if (result && targetFile.exists) {
      downloads = downloads.map((d) =>
        d.id === params.id
          ? {
              ...d,
              status: 'completed',
              progress: 100,
              size: targetFile.size,
              localUri: targetFile.uri,
            }
          : d,
      );
      notify();
      persist();

      // Post completion notification to status bar
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Download Complete',
            body: `${params.title} is ready for offline playback.`,
            color: colors.accent,
            data: { kind: 'offline_download', id: params.id },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: 1,
            channelId: CHANNEL_COMPLETE,
          },
        });
      } catch {
        // ignore
      }
    } else {
      downloads = downloads.map((d) =>
        d.id === params.id ? { ...d, status: 'failed', error: 'Download stopped' } : d,
      );
      notify();
      persist();
    }
  } catch (err) {
    activeTasks.delete(params.id);
    try {
      await Notifications.dismissNotificationAsync(`dl_${params.id}`);
    } catch {
      // ignore
    }
    downloads = downloads.map((d) =>
      d.id === params.id
        ? { ...d, status: 'failed', error: (err as Error).message || 'Download failed' }
        : d,
    );
    notify();
    persist();
  }
}

/** Cancels and removes an active or failed download. */
export async function cancelDownload(id: string) {
  try {
    await Notifications.dismissNotificationAsync(`dl_${id}`);
  } catch {
    // ignore
  }

  const task = activeTasks.get(id);
  if (task) {
    try {
      task.cancel();
    } catch {
      // ignore
    }
    activeTasks.delete(id);
  }

  const item = downloads.find((d) => d.id === id);
  if (item) {
    try {
      const file = new File(item.localUri);
      if (file.exists) file.delete();
    } catch {
      // ignore
    }
  }

  downloads = downloads.filter((d) => d.id !== id);
  notify();
  persist();
}

/** Deletes a completed download from local storage. */
export async function deleteDownload(id: string) {
  await cancelDownload(id);
  showToast({ text: 'Deleted offline download' });
}
