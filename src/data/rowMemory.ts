// What each row of cards had loaded. The tab pages only keep the rows near the
// screen, so a row scrolled far away is let go and built again when it comes
// back; with this it comes back as it was (the same cards, as far along as it
// had got) instead of starting over from placeholders. Refreshing clears it.

// Kept as long as the video lists behind the rows.
const KEEP_MS = 15 * 60 * 1000;

export type RowMemory<T, E = undefined> = {
  videos: T[];
  // Where the row's next batch carries on from.
  continuation?: string;
  // Anything else a row needs to pick up where it left off.
  extra?: E;
};

const rows = new Map<string, RowMemory<unknown, unknown> & { at: number }>();

export function recallRow<T, E = undefined>(key: string): RowMemory<T, E> | undefined {
  const hit = rows.get(key);
  if (!hit || Date.now() - hit.at > KEEP_MS) return undefined;
  return hit as unknown as RowMemory<T, E>;
}

export function rememberRow<T, E = undefined>(key: string, memory: RowMemory<T, E>) {
  rows.set(key, { ...memory, at: Date.now() });
}

export function forgetRows() {
  rows.clear();
}
