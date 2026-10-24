// A tiny in-app updater: the app polls a manifest on GitHub Releases and, when
// a newer versionCode is published, downloads the APK and hands it to Android's
// package installer. The manifest is a plain file (no API key, no rate limit),
// and carries the SHA-256 of the exact APK it points at, so a truncated or
// tampered download is rejected before it can reach the installer.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as FileSystem from 'expo-file-system';
import { getContentUriAsync } from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';

import { Sha256 } from './sha256';

export type Update = {
  version: string;
  versionCode: number;
  url: string;
  size?: number;
  sha256?: string;
  notes?: string;
};

// The manifest lives in the same release as the APK, so it is always current
// without needing a git push of the source tree.
const MANIFEST_URL = 'https://github.com/kichukic/Forus/releases/latest/download/version.json';
const CHECK_KEY = 'updater-last-check-v2';
// The manifest is about 200 bytes, so checking often costs nothing.
const CHECK_EVERY_MS = 30 * 60 * 1000;

// A hash from a manifest, as lowercase hex, or undefined when absent or
// malformed (older manifests carry none; the check is skipped for those).
function checksum(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return /^[0-9a-fA-F]{64}$/.test(value) ? value.toLowerCase() : undefined;
}

// The SHA-256 of a file, read one megabyte at a time so a whole APK never sits
// in memory. `open()` lives on the native base class under the File class, so
// the read side is typed here by hand.
const READ_CHUNK = 1024 * 1024;

async function fileHash(file: FileSystem.File): Promise<string> {
  const readable = file as unknown as {
    open: (mode?: FileSystem.FileMode) => FileSystem.FileHandle;
  };
  const handle = readable.open(FileSystem.FileMode.ReadOnly);
  try {
    const hasher = new Sha256();
    for (;;) {
      const piece = handle.readBytes(READ_CHUNK);
      if (piece.length === 0) break;
      hasher.update(piece);
      // Hand a moment back so the interface can redraw between megabytes.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    return hasher.hex();
  } finally {
    handle.close();
  }
}

export function installedVersionCode(): number {
  const raw = Application.nativeBuildVersion;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function installedVersionName(): string {
  return Application.nativeApplicationVersion ?? '0';
}

// A release newer than the one installed, or null.
function newer(update: Update | null | undefined): Update | null {
  return update && update.versionCode > installedVersionCode() ? update : null;
}

export async function checkForUpdate(force = false): Promise<Update | null> {
  if (Platform.OS !== 'android') return null;
  let cached: { at: number; update: Update | null } | null = null;
  try {
    const raw = await AsyncStorage.getItem(CHECK_KEY);
    cached = raw ? JSON.parse(raw) : null;
  } catch {
    cached = null;
  }
  // Within the window the last answer stands, including "there is an update":
  // that one keeps being offered until it is installed.
  if (!force && cached?.update !== undefined && Date.now() - cached.at < CHECK_EVERY_MS) {
    return newer(cached.update);
  }
  try {
    // The time in the address stops a cached copy of an older manifest being
    // served in place of the one just published.
    const res = await fetch(`${MANIFEST_URL}?t=${Date.now()}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) return newer(cached?.update);
    const manifest = (await res.json()) as Partial<Update>;
    const remoteCode = Number(manifest.versionCode);
    const sha = checksum(manifest.sha256);
    if (!Number.isFinite(remoteCode) || !manifest.url || !sha) return newer(cached?.update);
    const update: Update = {
      version: String(manifest.version ?? remoteCode),
      versionCode: remoteCode,
      url: String(manifest.url),
      size: manifest.size,
      sha256: checksum(manifest.sha256),
      notes: manifest.notes,
    };
    await AsyncStorage.setItem(CHECK_KEY, JSON.stringify({ at: Date.now(), update }));
    return newer(update);
  } catch {
    // Offline: whatever was found last time still applies.
    return newer(cached?.update);
  }
}

export async function downloadUpdate(update: Update, onProgress?: (written: number, total: number) => void): Promise<string> {
  // Only accept HTTPS downloads from the trusted release host.
  if (!update.url || !/^https:\/\//i.test(update.url)) {
    throw new Error('The update URL is not a trusted HTTPS link.');
  }
  if (!/github\.com/i.test(update.url)) {
    throw new Error('The update URL is not from the trusted release host.');
  }
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

  // Require a checksum: without one we cannot verify integrity, so reject.
  if (!update.sha256) {
    try {
      file.delete();
    } catch {
      // ignore
    }
    throw new Error('The update manifest is missing an integrity checksum; refusing to install.');
  }
  const sum = await fileHash(output);
  if (sum !== update.sha256) {
    try {
      file.delete();
    } catch {
      // ignore
    }
    throw new Error('The downloaded update failed its integrity check and was discarded. Try again shortly.');
  }
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
