// A resilient in-app updater: the app checks for new releases on GitHub,
// downloads the APK with automated CDN/API fallback to prevent 504 Gateway
// Timeouts, and verifies the SHA-256 checksum before handing it to Android's
// package installer.
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

const MANIFEST_URLS = [
  'https://raw.githubusercontent.com/kichukic/Forus/dev/version.json',
  'https://raw.githubusercontent.com/kichukic/Forus/main/version.json',
  'https://github.com/kichukic/Forus/releases/latest/download/version.json',
];

const CHECK_KEY = 'updater-last-check-v2';
// Checking often costs nothing since the manifest is ~200 bytes.
const CHECK_EVERY_MS = 30 * 60 * 1000;

async function fetchWithTimeout(url: string, headers?: Record<string, string>, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// A hash from a manifest, as lowercase hex, or undefined when absent or malformed.
function checksum(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return /^[0-9a-fA-F]{64}$/.test(value) ? value.toLowerCase() : undefined;
}

// The SHA-256 of a file, read one megabyte at a time so a whole APK never sits
// in memory. `open()` lives on the native base class under the File class.
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

function newer(update: Update | null | undefined): Update | null {
  return update && update.versionCode > installedVersionCode() ? update : null;
}

async function fetchManifest(): Promise<Partial<Update> | null> {
  // 1. Try fast CDN raw URLs first, followed by GitHub releases download
  for (const rawUrl of MANIFEST_URLS) {
    try {
      const res = await fetchWithTimeout(`${rawUrl}?t=${Date.now()}`, { Accept: 'application/json' }, 5000);
      if (res.ok) {
        const manifest = (await res.json()) as Partial<Update>;
        if (Number.isFinite(Number(manifest?.versionCode)) && manifest?.url) {
          return manifest;
        }
      }
    } catch {
      // try next source
    }
  }

  // 2. Fall back to GitHub REST API if direct manifest links fail
  try {
    const res = await fetchWithTimeout('https://api.github.com/repos/kichukic/Forus/releases/latest', {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'ForUs-Updater',
    }, 6000);
    if (res.ok) {
      const release = (await res.json()) as any;
      const jsonAsset = Array.isArray(release?.assets)
        ? release.assets.find((a: any) => a.name === 'version.json')
        : null;

      if (jsonAsset?.url) {
        const jsonRes = await fetchWithTimeout(jsonAsset.url, {
          Accept: 'application/octet-stream',
          'User-Agent': 'ForUs-Updater',
        }, 6000);
        if (jsonRes.ok) {
          const manifest = (await jsonRes.json()) as Partial<Update>;
          if (Number.isFinite(Number(manifest?.versionCode)) && manifest?.url) {
            return manifest;
          }
        }
      }
    }
  } catch {
    // ignore
  }

  return null;
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

  if (!force && cached?.update !== undefined && Date.now() - cached.at < CHECK_EVERY_MS) {
    return newer(cached.update);
  }

  try {
    const manifest = await fetchManifest();
    if (!manifest) return newer(cached?.update);

    const remoteCode = Number(manifest.versionCode);
    const sha = checksum(manifest.sha256);
    if (!Number.isFinite(remoteCode) || !manifest.url || !sha) return newer(cached?.update);

    const update: Update = {
      version: String(manifest.version ?? remoteCode),
      versionCode: remoteCode,
      url: String(manifest.url),
      size: manifest.size,
      sha256: sha,
      notes: manifest.notes,
    };
    await AsyncStorage.setItem(CHECK_KEY, JSON.stringify({ at: Date.now(), update }));
    return newer(update);
  } catch {
    return newer(cached?.update);
  }
}

export async function downloadUpdate(update: Update, onProgress?: (written: number, total: number) => void): Promise<string> {
  if (!update.url || !/^https:\/\//i.test(update.url)) {
    throw new Error('The update URL is not a trusted HTTPS link.');
  }
  if (!/github\.com|githubusercontent\.com/i.test(update.url)) {
    throw new Error('The update URL is not from the trusted release host.');
  }
  const dir = FileSystem.Paths.cache;
  const file = new FileSystem.File(dir, `forus-${update.versionCode}.apk`);
  try {
    if (file.exists) file.delete();
  } catch {
    // ignore
  }

  let output: FileSystem.File | null = null;
  let primaryError: unknown = null;

  // 1. Primary: Download directly from update.url
  try {
    output = await FileSystem.File.downloadFileAsync(update.url, file, {
      idempotent: true,
      onProgress: onProgress ? (p) => onProgress(p.bytesWritten, p.totalBytes) : undefined,
    });
  } catch (err) {
    primaryError = err;
    try {
      if (file.exists) file.delete();
    } catch {
      // ignore
    }
  }

  // 2. Fallback: If primary download fails (e.g. 504 Gateway Time-out on github.com web proxy),
  // stream directly via GitHub REST API which routes to release-assets.githubusercontent.com
  if (!output || !file.exists) {
    try {
      const apiReleaseUrl = update.version
        ? `https://api.github.com/repos/kichukic/Forus/releases/tags/v${update.version}`
        : 'https://api.github.com/repos/kichukic/Forus/releases/latest';

      const releaseRes = await fetchWithTimeout(apiReleaseUrl, {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'ForUs-Updater',
      }, 8000);

      if (releaseRes.ok) {
        const releaseData = (await releaseRes.json()) as any;
        const apkAsset = Array.isArray(releaseData?.assets)
          ? releaseData.assets.find((a: any) => typeof a.name === 'string' && a.name.endsWith('.apk'))
          : null;

        if (apkAsset?.url) {
          output = await FileSystem.File.downloadFileAsync(apkAsset.url, file, {
            headers: {
              Accept: 'application/octet-stream',
              'User-Agent': 'ForUs-Updater',
            },
            idempotent: true,
            onProgress: onProgress ? (p) => onProgress(p.bytesWritten, p.totalBytes) : undefined,
          });
        }
      }
    } catch {
      // If fallback fails, let the original error or missing file trigger below
    }
  }

  if (!output || !file.exists) {
    throw primaryError || new Error('Failed to download update.');
  }

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
