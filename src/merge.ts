import type { FeedResult, Video } from './types';

/**
 * Dedupe by video ID and sort by published descending.
 * Ties break by ID so the order is stable. Failed results are ignored.
 */
export function mergeVideos(results: FeedResult[]): Video[] {
  const byId = new Map<string, Video>();
  for (const result of results) {
    if (!result.ok) continue;
    for (const video of result.videos) {
      if (!byId.has(video.id)) {
        byId.set(video.id, video);
      }
    }
  }
  return [...byId.values()].sort((a, b) => {
    const diff = Date.parse(b.published) - Date.parse(a.published);
    if (diff !== 0) return diff;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Mark videos published after lastVisit as new.
 * A null lastVisit (first visit) marks nothing new.
 */
export function markNew(
  videos: Video[],
  lastVisit: string | null,
): (Video & { isNew: boolean })[] {
  return videos.map((v) => ({
    ...v,
    isNew: lastVisit !== null && Date.parse(v.published) > Date.parse(lastVisit),
  }));
}

export function filterByChannel(
  videos: Video[],
  channelId: string | 'all',
): Video[] {
  if (channelId === 'all') return videos;
  return videos.filter((v) => v.channelId === channelId);
}
