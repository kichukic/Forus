export type TorboxSource = 'torrents' | 'usenet' | 'webdl';

export type Playable =
  | { kind: 'video'; videoId: string; title: string }
  | { kind: 'live'; channelId: string; title: string }
  | { kind: 'file'; source: TorboxSource; itemId: number; fileId: number; title: string };

export type YouTubePlayable = Exclude<Playable, { kind: 'file' }>;
export type FilePlayable = Extract<Playable, { kind: 'file' }>;
