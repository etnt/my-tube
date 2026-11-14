import { describe, expect, it } from 'vitest';
import { buildDashboard } from '../src/dashboard';
import type { FavoriteChannel, FeedResult, Video } from '../src/types';

const A = 'UCAAAAAAAAAAAAAAAAAAAAAA';
const B = 'UCBBBBBBBBBBBBBBBBBBBBBB';
const C = 'UCCCCCCCCCCCCCCCCCCCCCCC';

const fav = (id: string, name: string): FavoriteChannel => ({
  id,
  name,
  addedAt: '2024-01-01T00:00:00Z',
});

const video = (id: string, channelId: string, published: string): Video => ({
  id,
  channelId,
  title: `Video ${id}`,
  published,
  url: `https://www.youtube.com/watch?v=${id}`,
});

const ok = (channelId: string, videos: Video[]): FeedResult => ({
  ok: true,
  channelId,
  channelTitle: 'Channel',
  videos,
});

describe('buildDashboard', () => {
  const favorites = [fav(A, 'Alpha'), fav(B, 'Beta'), fav(C, 'Gamma')];

  it('orders channels by their most recent upload, newest first', () => {
    const results = new Map<string, FeedResult>([
      [A, ok(A, [video('a1', A, '2024-03-01T10:00:00Z')])],
      [B, ok(B, [video('b1', B, '2024-03-05T10:00:00Z'), video('b0', B, '2024-02-01T00:00:00Z')])],
    ]);
    const entries = buildDashboard(favorites, results);
    expect(entries.map((e) => e.channel.id)).toEqual([B, A, C]);
    expect(entries[0]?.latest?.id).toBe('b1');
    expect(entries[0]?.videoCount).toBe(2);
  });

  it('puts channels without uploads last, in favourite order', () => {
    const results = new Map<string, FeedResult>([
      [B, { ok: false, channelId: B, error: 'Feed unavailable' }],
    ]);
    const entries = buildDashboard(favorites, results);
    expect(entries.map((e) => e.channel.id)).toEqual([A, B, C]);
    expect(entries[1]?.error).toBe('Feed unavailable');
    expect(entries[0]?.loaded).toBe(false);
  });

  it('returns an empty list when there are no favourites', () => {
    expect(buildDashboard([], new Map())).toEqual([]);
  });

  it('ignores results for channels that are no longer favourites', () => {
    const results = new Map<string, FeedResult>([
      ['UCDDDDDDDDDDDDDDDDDDDDDD', ok('UCDDDDDDDDDDDDDDDDDDDDDD', [video('d1', 'UCDDDDDDDDDDDDDDDDDDDDDD', '2024-03-09T00:00:00Z')])],
    ]);
    const entries = buildDashboard([fav(A, 'Alpha')], results);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.latest).toBeNull();
  });
});
