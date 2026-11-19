// Reads M3U playlists: the format IPTV apps use to list live channels.
// It is plain text, one channel per #EXTINF line followed by its stream URL.

export type M3uChannel = {
  /** The channel's EPG id when the playlist has one, otherwise its name. */
  id: string;
  name: string;
  logo: string;
  group: string;
  url: string;
  /** User-Agent/Referer some providers require before they serve the stream. */
  headers?: Record<string, string>;
};

export type M3uPlaylist = {
  channels: M3uChannel[];
  /** An XMLTV guide named in the playlist header, when there is one. */
  epgUrl?: string;
};

// A playlist is a text file; anything this size is a mistake or an attack.
const MAX_CHANNELS = 25000;
const ATTR_RE = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number(num)));
}

function attributes(line: string): Record<string, string> {
  const found: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTR_RE.exec(line))) {
    found[match[1].toLowerCase()] = match[2] ?? match[3] ?? '';
  }
  return found;
}

// The channel name follows the first comma that is not inside a quoted value.
function titleComma(line: string): number {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ',') {
      return i;
    }
  }
  return line.indexOf(',');
}

function unquote(value: string): string {
  return value.trim().replace(/^(['"])(.*)\1$/, '$2');
}

type Pending = {
  name: string;
  logo: string;
  group: string;
  id: string;
  headers: Record<string, string>;
};

function emptyPending(): Pending {
  return { name: '', logo: '', group: '', id: '', headers: {} };
}

/**
 * Parses an M3U/M3U8 playlist. A media playlist for one HLS stream has no
 * channels and is reported as empty.
 */
export function parseM3u(content: string): M3uPlaylist {
  const channels: M3uChannel[] = [];
  const seen = new Set<string>();
  let epgUrl: string | undefined;
  let pending = emptyPending();
  let nextGroup = '';
  let sequence = 0;

  for (const rawLine of content.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('#EXTM3U')) {
      const guide = line.match(/(?:url-tvg|x-tvg-url)\s*=\s*(?:"([^"]+)"|'([^']+)')/i);
      if (guide) epgUrl = decodeEntities(guide[1] ?? guide[2] ?? '').split(',')[0].trim();
      continue;
    }

    if (line.startsWith('#EXTINF:')) {
      const attrs = attributes(line);
      const comma = titleComma(line);
      pending = {
        name: comma >= 0 ? decodeEntities(line.slice(comma + 1).trim()) : '',
        logo: decodeEntities(attrs['tvg-logo'] || ''),
        group: decodeEntities(attrs['group-title'] || nextGroup || ''),
        id: decodeEntities(attrs['tvg-id'] || attrs['tvg-name'] || ''),
        headers: {},
      };
      nextGroup = '';
      continue;
    }

    if (line.startsWith('#EXTGRP:')) {
      const group = decodeEntities(line.slice(8).trim());
      if (pending.name) pending.group = pending.group || group;
      else nextGroup = group;
      continue;
    }

    if (line.startsWith('#EXTVLCOPT:')) {
      const option = line.slice(11);
      const split = option.indexOf('=');
      if (split < 0) continue;
      const key = option.slice(0, split).trim().toLowerCase();
      const value = unquote(decodeEntities(option.slice(split + 1)));
      if (!value) continue;
      if (key === 'http-user-agent') pending.headers['User-Agent'] = value;
      else if (key === 'http-referrer' || key === 'http-referer') {
        pending.headers.Referer = value;
      }
      continue;
    }

    // Other directives carry no channel of their own.
    if (line.startsWith('#')) continue;

    // A channel line is the URL after #EXTINF. Plain HLS segment lines have no
    // pending channel and are ignored.
    if (!pending.name) continue;
    if (!/^https?:\/\//i.test(line)) {
      pending = emptyPending();
      continue;
    }
    if (seen.has(line) || channels.length >= MAX_CHANNELS) {
      pending = emptyPending();
      continue;
    }
    seen.add(line);
    sequence += 1;
    const name = pending.name || `Channel ${sequence}`;
    channels.push({
      id: pending.id || name,
      name,
      logo: pending.logo,
      group: pending.group || 'Ungrouped',
      url: line,
      ...(Object.keys(pending.headers).length > 0 ? { headers: pending.headers } : {}),
    });
    pending = emptyPending();
  }

  return { channels, ...(epgUrl ? { epgUrl } : {}) };
}
