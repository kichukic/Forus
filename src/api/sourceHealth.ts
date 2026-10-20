import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'source-health';

// Public extractors go down for hours at a time, so a source that just failed
// is left alone for a while instead of being retried on every video.
const FAIL_COOLDOWN_MS = 30 * 60 * 1000;
// A source that worked stays trusted for much longer than the failure cooldown.
const OK_TTL_MS = 12 * 60 * 60 * 1000;

type Entry = { failedAt?: number; workedAt?: number; blockedAt?: number };

// A channel that refuses embedding keeps refusing it, so that one is
// remembered for much longer than a plain failure.
const BLOCK_TTL_MS = 24 * 60 * 60 * 1000;

let memory: Record<string, Entry> = {};
let loaded = false;

export async function loadSourceHealth(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) memory = JSON.parse(raw);
  } catch {
    memory = {};
  }
}

function persist() {
  AsyncStorage.setItem(KEY, JSON.stringify(memory)).catch(() => {});
}

/** True when the source recently failed and should be skipped for now. */
export function isCoolingDown(id: string, cooldownMs = FAIL_COOLDOWN_MS): boolean {
  const entry = memory[id];
  if (!entry) return false;
  if (entry.workedAt && Date.now() - entry.workedAt < OK_TTL_MS) return false;
  return !!entry.failedAt && Date.now() - entry.failedAt < cooldownMs;
}

export function markFailed(id: string, _cooldownMs = FAIL_COOLDOWN_MS) {
  memory[id] = { failedAt: Date.now() };
  persist();
}

export function markWorked(id: string) {
  memory[id] = { workedAt: Date.now() };
  persist();
}

/** True when this item is known to refuse embedding. */
export function isBlocked(id: string): boolean {
  const entry = memory[id];
  return !!entry?.blockedAt && Date.now() - entry.blockedAt < BLOCK_TTL_MS;
}

export function markBlocked(id: string) {
  memory[id] = { blockedAt: Date.now() };
  persist();
}

export function resetHealth() {
  memory = {};
  persist();
}

/** Health of every source, for the diagnostics list. */
export function healthSnapshot(): Record<string, Entry> {
  return { ...memory };
}
