export type TorboxSource = 'torrents' | 'usenet' | 'webdl';

// A film or an episode of a series, from MovieBox.
export type MovieboxPlayable = {
  kind: 'moviebox';
  subjectId: string;
  season: number;
  episode: number;
  title: string;
  poster?: string;
};

export type Playable =
  | { kind: 'video'; videoId: string; title: string }
  | { kind: 'live'; channelId: string; title: string }
  | { kind: 'file'; source: TorboxSource; itemId: number; fileId: number; title: string }
  | { kind: 'stream'; url: string; title: string; poster?: string }
  | MovieboxPlayable;

export type YouTubePlayable = Exclude<
  Playable,
  { kind: 'file' } | { kind: 'moviebox' } | { kind: 'stream' }
>;
export type FilePlayable = Extract<Playable, { kind: 'file' }>;
export type MovieboxItem = Extract<Playable, { kind: 'moviebox' }>;
