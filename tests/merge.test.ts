import { describe, expect, it } from 'vitest';
import { filterByChannel, markNew, mergeVideos } from '../src/merge';
import type { FeedResult, Video } from '../src/types';

const CHANNEL = 'UC1234567890123456789012';

const makeVideo = (id: string, published: string, channelId = CHANNEL): Video => ({
  id,
  channelId,
  title: `Video ${id}`,
  published,
  url: `https://www.youtube.com/watch?v=${id}`,
});

const okResult = (videos: Video[]): FeedResult => ({
  ok: true,
  channelId: CHANNEL,
  channelTitle: 'Channel',
  videos,
});

describe('mergeVideos', () => {
  it('sorts newest first', () => {
    const merged = mergeVideos([
      okResult([
        makeVideo('a', '2024-01-01T00:00:00Z'),
        makeVideo('b', '2024-03-01T00:00:00Z'),
        makeVideo('c', '2024-02-01T00:00:00Z'),
      ]),
    ]);
    expect(merged.map((v) => v.id)).toEqual(['b', 'c', 'a']);
  });

  it('dedupes the same video across results', () => {
    const merged = mergeVideos([
      okResult([makeVideo('a', '2024-01-01T00:00:00Z')]),
      okResult([makeVideo('a', '2024-01-01T00:00:00Z')]),
    ]);
    expect(merged).toHaveLength(1);
  });

  it('breaks ties by id for stable order', () => {
    const merged = mergeVideos([
      okResult([
        makeVideo('b', '2024-01-01T00:00:00Z'),
        makeVideo('a', '2024-01-01T00:00:00Z'),
      ]),
    ]);
    expect(merged.map((v) => v.id)).toEqual(['a', 'b']);
  });

  it('ignores failed results', () => {
    const merged = mergeVideos([
      okResult([makeVideo('a', '2024-01-01T00:00:00Z')]),
      { ok: false, channelId: 'UC9999999999999999999999', error: 'Channel not found' },
    ]);
    expect(merged).toHaveLength(1);
  });
});

describe('markNew', () => {
  const videos = [
    makeVideo('after', '2024-06-02T00:00:00Z'),
    makeVideo('before', '2024-06-01T00:00:00Z'),
  ];

  it('marks videos published after lastVisit', () => {
    const marked = markNew(videos, '2024-06-01T12:00:00Z');
    expect(marked.find((v) => v.id === 'after')!.isNew).toBe(true);
    expect(marked.find((v) => v.id === 'before')!.isNew).toBe(false);
  });

  it('treats published exactly at lastVisit as not new', () => {
    const marked = markNew(videos, '2024-06-01T00:00:00Z');
    expect(marked.find((v) => v.id === 'before')!.isNew).toBe(false);
  });

  it('marks nothing new when lastVisit is null', () => {
    const marked = markNew(videos, null);
    expect(marked.every((v) => !v.isNew)).toBe(true);
  });
});

describe('filterByChannel', () => {
  const videos = [
    makeVideo('a', '2024-01-01T00:00:00Z'),
    makeVideo('b', '2024-01-01T00:00:00Z', 'UC9999999999999999999999'),
  ];

  it('returns all videos for "all"', () => {
    expect(filterByChannel(videos, 'all')).toHaveLength(2);
  });

  it('filters by channel', () => {
    const filtered = filterByChannel(videos, 'UC9999999999999999999999');
    expect(filtered.map((v) => v.id)).toEqual(['b']);
  });
});
