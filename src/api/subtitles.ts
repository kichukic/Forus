// The subtitle files the film service offers are in SRT: a number, a line of
// times, and then the words that are said while it is on screen.

export type SubtitleCue = {
  /** In seconds from the start. */
  start: number;
  end: number;
  text: string;
};

// A stamp is 00:00:01,500, or 00:00:01.500, or the shorter 01:500.
function toSeconds(stamp: string): number | null {
  const parts = stamp.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/);
  if (!parts) return null;
  const hours = Number(parts[1] ?? 0);
  const minutes = Number(parts[2]);
  const seconds = Number(parts[3]);
  const millis = Number((parts[4] ?? '0').padEnd(3, '0'));
  if (!Number.isFinite(hours + minutes + seconds)) return null;
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

/** The lines of a subtitle file, as the words with their times. */
export function parseSrt(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const text = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (const block of text.split(/\n{2,}/)) {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const timeLine = lines.findIndex((line) => line.includes('-->'));
    if (timeLine === -1) continue;
    const [from, to] = lines[timeLine].split('-->');
    const start = toSeconds(from);
    // The end can carry a place number after it, which is not part of the time.
    const end = toSeconds((to ?? '').trim().split(/\s+/)[0] ?? '');
    if (start === null || end === null) continue;
    const words = lines
      .slice(timeLine + 1)
      .join('\n')
      // Some files mark the words up with tags, which are not shown.
      .replace(/<[^>]+>/g, '')
      .trim();
    if (!words) continue;
    cues.push({ start, end, text: words });
  }
  return cues;
}

/** The words being said at that moment, if any. */
export function cueAt(cues: SubtitleCue[], seconds: number): string | null {
  for (const cue of cues) {
    if (seconds >= cue.start && seconds <= cue.end) return cue.text;
  }
  return null;
}
