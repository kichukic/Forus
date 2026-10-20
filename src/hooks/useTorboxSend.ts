import { useCallback, useEffect, useState } from 'react';
import {
  createTorrent,
  findTorrentByHash,
  getApiKey,
  getTorrent,
  mainVideoFile,
  type TorboxTorrent,
} from '../api/torbox';
import type { TorrentOption } from '../api/torrents';
import type { Playable } from '../types';

export type SendPhase =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'downloading'; torrent: TorboxTorrent | null }
  | { kind: 'error'; message: string; needsKey: boolean };

type Options = {
  // Called with the file once it is ready to play.
  onPlay: (item: Playable) => void;
};

const POLL_MS = 4000;

/**
 * Sends a release to TorBox, follows the download, and hands the file over
 * when it is there. The same flow is used for a film picked from a catalog
 * and for a release found by searching for its name.
 */
export function useTorboxSend({ onPlay }: Options) {
  const [phase, setPhase] = useState<SendPhase>({ kind: 'idle' });
  const [torrentId, setTorrentId] = useState<number | null>(null);
  const [title, setTitle] = useState('');

  const watch = useCallback(async () => {
    const key = await getApiKey();
    if (!key || torrentId === null) return;
    const torrent = await getTorrent(key, torrentId);
    if (!torrent) return;
    if (!torrent.downloadFinished) {
      setPhase({ kind: 'downloading', torrent });
      return;
    }
    const file = mainVideoFile(torrent);
    if (!file) {
      setPhase({ kind: 'error', message: 'That download has no video file in it.', needsKey: false });
      return;
    }
    onPlay({
      kind: 'file',
      source: 'torrents',
      itemId: torrent.id,
      fileId: file.id,
      title: title || file.name,
    });
  }, [onPlay, title, torrentId]);

  useEffect(() => {
    if (phase.kind !== 'downloading') return;
    // The first check runs right away, the rest on a timer.
    const first = setTimeout(watch, 200);
    const timer = setInterval(watch, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [phase.kind, watch]);

  const start = useCallback(async (option: TorrentOption) => {
    const key = await getApiKey();
    if (!key) {
      setPhase({
        kind: 'error',
        message: 'Connect your TorBox first, then pick a release.',
        needsKey: true,
      });
      return;
    }
    setTitle(option.name);
    setPhase({ kind: 'sending' });
    try {
      const existing = await findTorrentByHash(key, option.hash);
      if (existing) {
        setTorrentId(existing.id);
        setPhase({ kind: 'downloading', torrent: existing });
      } else {
        const created = await createTorrent(key, option.magnet, option.name);
        setTorrentId(created.torrentId);
        setPhase({ kind: 'downloading', torrent: null });
      }
    } catch (e) {
      setPhase({ kind: 'error', message: String((e as Error).message ?? e), needsKey: false });
    }
  }, []);

  const cancel = useCallback(() => {
    setPhase({ kind: 'idle' });
    setTorrentId(null);
  }, []);

  const reset = useCallback(() => {
    setPhase({ kind: 'idle' });
    setTorrentId(null);
  }, []);

  return { phase, start, cancel, reset };
}
