import { mergeVideos } from './merge';
import type { FavoriteChannel, FeedResult, Video } from './types';

export interface DashboardEntry {
  channel: FavoriteChannel;
  /** False until the first feed result for this channel arrives. */
  loaded: boolean;
  latest: Video | null;
  videoCount: number;
  error?: string;
}

function publishedTime(entry: DashboardEntry): number {
  if (!entry.latest) return Number.NEGATIVE_INFINITY;
  const t = Date.parse(entry.latest.published);
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

/**
 * One entry per favourite channel, ordered by the most recent upload (newest
 * first). Channels without a known upload go last, in favourite order.
 */
export function buildDashboard(
  favorites: FavoriteChannel[],
  results: Map<string, FeedResult>,
): DashboardEntry[] {
  const entries = favorites.map((channel): DashboardEntry => {
    const result = results.get(channel.id);
    if (!result) return { channel, loaded: false, latest: null, videoCount: 0 };
    if (!result.ok) {
      return { channel, loaded: true, latest: null, videoCount: 0, error: result.error };
    }
    const latest = mergeVideos([result])[0] ?? null;
    return { channel, loaded: true, latest, videoCount: result.videos.length };
  });

  return entries.sort((a, b) => {
    const ta = publishedTime(a);
    const tb = publishedTime(b);
    if (ta === tb) return 0;
    return tb > ta ? 1 : -1;
  });
}
