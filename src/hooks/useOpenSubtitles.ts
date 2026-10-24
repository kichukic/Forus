import { useEffect, useState } from 'react';
import { searchByImdb, searchByName, loadSubtitle } from '../api/opensubtitles';
import { cueAt, type SubtitleCue } from '../api/subtitles';

export type OpenSub = {
  id: string;
  name: string;
  language: string;
  rating: string;
  downloads: number;
  url: string;
};

function cleanName(name: string): string {
  return name.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function useOpenSubtitles(title: string, imdbId?: string) {
  const [subs, setSubs] = useState<OpenSub[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ id: string; list: SubtitleCue[] } | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSearching(true);
      try {
        const results = imdbId
          ? await searchByImdb(imdbId)
          : await searchByName(cleanName(title));
        if (cancelled) return;
        const mapped: OpenSub[] = results.map((r) => ({
          id: r.id,
          name: r.name,
          language: r.language,
          rating: r.rating,
          downloads: r.downloads,
          url: r.url,
        }));
        setSubs(mapped);
        if (mapped.length > 0) setChosen(mapped[0].id);
        else setChosen(null);
      } catch {
        if (!cancelled) setSubs([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [title, imdbId]);

  useEffect(() => {
    const option = subs.find((o) => o.id === chosen);
    if (!option) {
      setLoaded(null);
      return;
    }
    let cancelled = false;
    loadSubtitle(option.url)
      .then((list) => !cancelled && setLoaded({ id: option.id, list }))
      .catch(() => !cancelled && setLoaded({ id: option.id, list: [] }));
    return () => {
      cancelled = true;
    };
  }, [chosen, subs]);

  const disable = () => setChosen(null);

  const cycle = () => {
    if (subs.length === 0) return;
    if (chosen === null) {
      setChosen(subs[0].id);
      return;
    }
    const idx = subs.findIndex((s) => s.id === chosen);
    const next = idx + 1;
    if (next >= subs.length) setChosen(null);
    else setChosen(subs[next].id);
  };

  const spoken = (currentTime: number) =>
    loaded && loaded.id === chosen && loaded.list.length > 0 ? cueAt(loaded.list, currentTime) : null;

  return { subs, chosen, loaded, searching, cycle, disable, spoken, hasSubs: subs.length > 0 };
}