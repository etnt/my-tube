export interface FavoriteChannel {
  id: string;
  name: string;
  customLabel?: string;
  addedAt: string;
}

export interface Video {
  id: string;
  channelId: string;
  title: string;
  /** ISO 8601 date string */
  published: string;
  url: string;
  thumbnail?: string;
  channelName?: string;
}

export interface FeedStatus {
  lastChecked?: string;
  lastSuccess?: string;
  error?: string;
}

export type FeedResult =
  | { ok: true; channelId: string; channelTitle: string; videos: Video[] }
  | { ok: false; channelId: string; error: string };
