// A tiny in-app updater: the app polls a manifest on GitHub Releases and, when
// a newer versionCode is published, downloads the APK and hands it to Android's
// package installer. The manifest is a plain file (no API key, no rate limit).
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as FileSystem from 'expo-file-system';
import { getContentUriAsync } from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';

export type Update = {
  version: string;
  versionCode: number;
  url: string;
  size?: number;
  notes?: string;
};

// The manifest lives in the same release as the APK, so it is always current
// without needing a git push of the source tree.
const MANIFEST_URL = 'https://github.com/kichukic/Forus/releases/latest/download/version.json';
const CHECK_KEY = 'updater-last-check';
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

export function installedVersionCode(): number {
  const raw = Application.nativeBuildVersion;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function installedVersionName(): string {
  return Application.nativeApplicationVersion ?? '0';
}

export async function checkForUpdate(force = false): Promise<Update | null> {
  if (Platform.OS !== 'android') return null;
  try {
    const last = await AsyncStorage.getItem(CHECK_KEY);
    if (!force && last) {
      const { at, versionCode } = JSON.parse(last);
      if (Date.now() - at < CHECK_EVERY_MS) {
        // Still within the cache window; report "no update" unless the cached
        // answer said there was one.
        return null;
      }
    }
    const res = await fetch(MANIFEST_URL, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const manifest = (await res.json()) as Partial<Update>;
    const remoteCode = Number(manifest.versionCode);
    if (!Number.isFinite(remoteCode) || !manifest.url) return null;
    await AsyncStorage.setItem(CHECK_KEY, JSON.stringify({ at: Date.now(), versionCode: remoteCode }));
    if (remoteCode <= installedVersionCode()) return null;
    return {
      version: String(manifest.version ?? remoteCode),
      versionCode: remoteCode,
      url: String(manifest.url),
      size: manifest.size,
      notes: manifest.notes,
    };
  } catch {
    return null;
  }
}

export async function downloadUpdate(update: Update, onProgress?: (written: number, total: number) => void): Promise<string> {
  const dir = FileSystem.Paths.cache;
  const file = new FileSystem.File(dir, `forus-${update.versionCode}.apk`);
  try {
    if (file.exists) file.delete();
  } catch {
    // ignore
  }
  const output = await FileSystem.File.downloadFileAsync(update.url, file, {
    onProgress: onProgress ? (p) => onProgress(p.bytesWritten, p.totalBytes) : undefined,
  });
  return output.uri;
}

export async function installUpdate(fileUri: string): Promise<void> {
  const contentUri = await getContentUriAsync(fileUri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    type: 'application/vnd.android.package-archive',
    flags: 1,
  });
}

export async function openInstallUnknownAppsSettings(): Promise<void> {
  try {
    await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.MANAGE_UNKNOWN_APP_SOURCES, {
      data: `package:${Application.applicationId}`,
    });
  } catch {
    // Fall back to the general settings if the specific screen isn't available.
    await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS, {
      data: `package:${Application.applicationId}`,
    });
  }
}
