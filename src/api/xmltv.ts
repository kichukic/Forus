// A small XMLTV reader. Guides can be tens of megabytes, so only the
// programmes around now are kept: enough for "on now" and "up next".

export type EpgProgramme = {
  channelId: string;
  title: string;
  description?: string;
  /** Milliseconds since the epoch. */
  start: number;
  stop: number;
};

const HORIZON_MS = 24 * 60 * 60 * 1000;
const GRACE_MS = 30 * 60 * 1000;
const MAX_PER_CHANNEL = 24;

function decodeEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number(num)));
}

function innerText(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'));
  if (!match) return '';
  // CDATA is text, not a tag: it has to be unwrapped before the tags go.
  const unwrapped = match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  return decodeEntities(unwrapped.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function xmltvTime(raw: string): number | null {
  const match = raw.trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = '0', zone] = match;
  if (!zone) {
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ).getTime();
  }
  const sign = zone.startsWith('-') ? -1 : 1;
  const offsetMs =
    sign * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(3, 5))) * 60 * 1000;
  return Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  ) - offsetMs;
}

/**
 * Reads the programmes that are on now or start within the next day. Older
 * entries and far-future ones are dropped, which keeps the cached guide small.
 */
export function parseXmltv(xml: string, at = Date.now()): Record<string, EpgProgramme[]> {
  const output: Record<string, EpgProgramme[]> = {};
  const pattern = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/gi;
  const lowest = at - GRACE_MS;
  const highest = at + HORIZON_MS;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(xml))) {
    const attrs = match[1];
    const body = match[2];
    const channel = attrs.match(/\bchannel\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const startRaw = attrs.match(/\bstart\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const stopRaw = attrs.match(/\bstop\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const channelId = decodeEntities(channel?.[1] ?? channel?.[2] ?? '').trim();
    if (!channelId || !startRaw) continue;
    const start = xmltvTime(startRaw[1] ?? startRaw[2] ?? '');
    if (start === null || start >= highest) continue;
    let stop = stopRaw ? xmltvTime(stopRaw[1] ?? stopRaw[2] ?? '') : null;
    if (stop === null || stop <= start) stop = start + 30 * 60 * 1000;
    if (stop <= lowest) continue;

    const title = innerText(body, 'title');
    if (!title) continue;
    const description = innerText(body, 'desc');
    const list = output[channelId] ?? (output[channelId] = []);
    if (list.length >= MAX_PER_CHANNEL) continue;
    list.push({
      channelId,
      title,
      start,
      stop,
      ...(description ? { description } : {}),
    });
  }

  for (const list of Object.values(output)) list.sort((a, b) => a.start - b.start);
  return output;
}

/** The programme on at `at`, or the next one when there is a gap. */
export function programmeAt(
  guide: Record<string, EpgProgramme[]>,
  channelId: string,
  at = Date.now(),
): EpgProgramme | null {
  const list = guide[channelId];
  if (!list || list.length === 0) return null;
  return list.find((entry) => entry.start <= at && entry.stop > at) ?? list.find((entry) => entry.start > at) ?? null;
}
