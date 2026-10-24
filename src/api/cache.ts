// Simple AsyncStorage-backed cache with TTL and a size cap.
import AsyncStorage from '@react-native-async-storage/async-storage';

const INDEX_KEY = 'app-cache-index';
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB for JSON payloads (images use expo-image disk cache)

type Entry = { value: any; expires: number; size: number; touched: number };

async function readIndex(): Promise<Record<string, Entry>> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function writeIndex(index: Record<string, Entry>) {
  try {
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {}
}

function sizeOf(value: any): number {
  try {
    return JSON.stringify(value).length * 2;
  } catch {
    return 1024;
  }
}

export async function getCached<T = any>(key: string): Promise<T | null> {
  const index = await readIndex();
  const entry = index[key];
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    delete index[key];
    await writeIndex(index);
    AsyncStorage.removeItem(key).catch(() => {});
    return null;
  }
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    entry.touched = Date.now();
    index[key] = entry;
    await writeIndex(index);
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setCached(key: string, value: any, ttlMs: number) {
  const index = await readIndex();
  const size = sizeOf(value);
  // Evict if over cap
  let total = Object.values(index).reduce((a, e) => a + (e.size || 0), 0);
  const entries = Object.entries(index).sort((a, b) => a[1].touched - b[1].touched);
  while (total + size > MAX_BYTES && entries.length) {
    const [k, e] = entries.shift()!;
    delete index[k];
    total -= e.size || 0;
    AsyncStorage.removeItem(k).catch(() => {});
  }
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
    index[key] = { value: null, expires: Date.now() + ttlMs, size, touched: Date.now() };
    await writeIndex(index);
  } catch {}
}

export async function clearCache() {
  const index = await readIndex();
  await Promise.all(Object.keys(index).map((k) => AsyncStorage.removeItem(k).catch(() => {})));
  await AsyncStorage.removeItem(INDEX_KEY).catch(() => {});
}