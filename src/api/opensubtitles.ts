// Subtitles from OpenSubtitles, for files that do not bring their own. The old
// REST API answers without a key, and the download link without its ".gz"
// ending returns the plain SRT text, so no decompression is needed here.
import { parseSrt, type SubtitleCue } from './subtitles';

const BASE = 'https://rest.opensubtitles.org';

export type OpenSubtitle = {
  id: string;
  name: string;
  language: string;
  rating: string;
  downloads: number;
  url: string;
};

// A filename like "Inception.2010.1080p.BrRip.x264.YIFY.mp4" is turned into a
// title the search can use: "Inception 2010".
export function cleanFileName(name: string): string {
  return name
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .replace(/[._]/g, ' ')
    .replace(/\b(1080p|720p|480p|2160p|4k|hdrip|webrip|bluray|brrip|dvdrip|x264|x265|h264|h265|yify|amzn|nf|web-dl|subs?|dual|audio|aac|ac3|dts|mkv|mp4)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Subtitles for a film, by its IMDb id when it is known. */
export async function searchByImdb(imdbId: string, language = 'eng'): Promise<OpenSubtitle[]> {
  const url = `${BASE}/search/imdbid-${imdbId.replace(/^tt/, '')}/sublanguageid-${language}`;
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) return [];
  const list = await res.json().catch(() => []);
  return toList(Array.isArray(list) ? list : []);
}

/** Subtitles for a name, when no IMDb id is known (TorBox files). */
export async function searchByName(name: string, language = 'eng'): Promise<OpenSubtitle[]> {
  const cleaned = cleanFileName(name);
  if (cleaned.length < 2) return [];
  const url = `${BASE}/search/query-${encodeURIComponent(cleaned)}/sublanguageid-${language}`;
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) return [];
  const list = await res.json().catch(() => []);
  return toList(Array.isArray(list) ? list : []);
}

function toList(list: any[]): OpenSubtitle[] {
  const out: OpenSubtitle[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const link = String(item?.SubDownloadLink ?? '').replace(/\.gz$/i, '');
    if (!link || seen.has(link)) continue;
    seen.add(link);
    out.push({
      id: String(item.IDSubtitleFile ?? item.IDSubtitle ?? link),
      name: String(item.SubFileName ?? 'subtitle'),
      language: String(item.SubLanguageID ?? ''),
      rating: String(item.SubRating ?? ''),
      downloads: Number(item.SubDownloadsCnt ?? 0),
      url: link,
    });
  }
  // The most downloaded, best rated ones first.
  out.sort((a, b) => b.downloads - a.downloads || Number(b.rating) - Number(a.rating));
  return out.slice(0, 20);
}

/** Downloads and parses one subtitle file. */
export async function loadSubtitle(url: string): Promise<SubtitleCue[]> {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) return [];
  const text = await res.text();
  return parseSrt(text);
}
