import { describe, expect, it } from 'vitest';
import {
  describeApiError,
  fetchChannelVideos,
  parseChannelInfo,
  parsePlaylistVideos,
} from '../src/youtube';

const CHANNEL = 'UCBJycsmduvYEL83R_U4JriQ';
const UPLOADS = 'UUBJycsmduvYEL83R_U4JriQ';
const KEY = 'AIzaTestKey';

const channelResponse = {
  items: [
    {
      id: CHANNEL,
      snippet: { title: 'Veritasium' },
      contentDetails: { relatedPlaylists: { uploads: UPLOADS } },
    },
  ],
};

const playlistResponse = {
  items: [
    {
      snippet: {
        title: 'Why Bridges Fall',
        publishedAt: '2024-05-02T10:00:00Z',
        resourceId: { videoId: 'aaaaaaaaaaa' },
        channelId: CHANNEL,
        thumbnails: { medium: { url: 'https://i.ytimg.com/vi/aaaaaaaaaaa/mqdefault.jpg' } },
      },
      contentDetails: { videoId: 'aaaaaaaaaaa', videoPublishedAt: '2024-05-01T09:00:00Z' },
    },
    {
      snippet: { title: 'Deleted video', publishedAt: '2024-04-01T00:00:00Z', resourceId: { videoId: 'bbbbbbbbbbb' } },
      contentDetails: { videoId: 'bbbbbbbbbbb', videoPublishedAt: '2024-04-01T00:00:00Z' },
    },
  ],
};

/** Fake fetch that answers by URL path and records the requested URLs. */
function fakeFetch(routes: Record<string, { status?: number; body: unknown }>) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const route = Object.entries(routes).find(([path]) => url.includes(path))?.[1];
    if (!route) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify(route.body), { status: route.status ?? 200 });
  }) as typeof fetch;
  return { impl, calls };
}

describe('parseChannelInfo', () => {
  it('reads the title and uploads playlist', () => {
    expect(parseChannelInfo(channelResponse)).toEqual({
      channelId: CHANNEL,
      title: 'Veritasium',
      uploadsPlaylistId: UPLOADS,
    });
  });

  it('returns null when no channel matches', () => {
    expect(parseChannelInfo({ items: [] })).toBeNull();
    expect(parseChannelInfo({})).toBeNull();
  });

  it('keeps the channel when it has no uploads playlist', () => {
    const info = parseChannelInfo({ items: [{ id: CHANNEL, snippet: { title: 'Empty' } }] });
    expect(info?.uploadsPlaylistId).toBeUndefined();
  });
});

describe('parsePlaylistVideos', () => {
  it('maps items to videos and skips deleted entries', () => {
    const videos = parsePlaylistVideos(playlistResponse, CHANNEL, 'Veritasium');
    expect(videos).toHaveLength(1);
    expect(videos[0]).toEqual({
      id: 'aaaaaaaaaaa',
      channelId: CHANNEL,
      title: 'Why Bridges Fall',
      published: '2024-05-01T09:00:00Z',
      url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
      thumbnail: 'https://i.ytimg.com/vi/aaaaaaaaaaa/mqdefault.jpg',
      channelName: 'Veritasium',
    });
  });

  it('rejects malformed video IDs and non-https thumbnails', () => {
    const videos = parsePlaylistVideos(
      {
        items: [
          {
            snippet: { title: 'Bad id', publishedAt: '2024-05-01T00:00:00Z', thumbnails: { default: { url: 'http://x/y.jpg' } } },
            contentDetails: { videoId: '<script>' },
          },
          {
            snippet: { title: 'Good', publishedAt: '2024-05-01T00:00:00Z', thumbnails: { default: { url: 'http://x/y.jpg' } } },
            contentDetails: { videoId: 'ccccccccccc' },
          },
        ],
      },
      CHANNEL,
      'Veritasium',
    );
    expect(videos.map((v) => v.id)).toEqual(['ccccccccccc']);
    expect(videos[0]?.thumbnail).toBeUndefined();
  });
});

describe('describeApiError', () => {
  const err = (message: string, reason?: string) => ({
    error: { message, errors: reason ? [{ reason }] : [] },
  });

  it('maps common failure reasons to actionable messages', () => {
    expect(describeApiError(400, err('API key not valid.', 'keyInvalid'))).toMatch(/invalid/);
    expect(describeApiError(403, err('Quota', 'quotaExceeded'))).toMatch(/quota/i);
    expect(describeApiError(403, err('blocked', 'ipRefererBlocked'))).toMatch(/referrer/);
    expect(describeApiError(403, err('disabled', 'accessNotConfigured'))).toMatch(/not enabled/);
  });

  it('falls back to the API message, then to the status code', () => {
    expect(describeApiError(500, err('Something odd'))).toBe('Something odd');
    expect(describeApiError(500, null)).toBe('YouTube API error (500)');
  });
});

describe('fetchChannelVideos', () => {
  it('loads a channel by ID with two API calls', async () => {
    const { impl, calls } = fakeFetch({
      '/channels?': { body: channelResponse },
      '/playlistItems?': { body: playlistResponse },
    });
    const result = await fetchChannelVideos({ channelId: CHANNEL }, KEY, impl);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.channelTitle).toBe('Veritasium');
    expect(result.videos).toHaveLength(1);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain(`id=${CHANNEL}`);
    expect(calls[1]).toContain(`playlistId=${UPLOADS}`);
    expect(calls.every((c) => c.includes(`key=${KEY}`))).toBe(true);
  });

  it('resolves a handle to a channel', async () => {
    const { impl, calls } = fakeFetch({
      '/channels?': { body: channelResponse },
      '/playlistItems?': { body: playlistResponse },
    });
    const result = await fetchChannelVideos({ handle: '@veritasium' }, KEY, impl);
    expect(result.ok && result.channelId).toBe(CHANNEL);
    expect(calls[0]).toContain('forHandle=%40veritasium');
  });

  it('reports a missing channel without a second call', async () => {
    const { impl, calls } = fakeFetch({ '/channels?': { body: { items: [] } } });
    const result = await fetchChannelVideos({ handle: '@nobody' }, KEY, impl);
    expect(result).toMatchObject({ ok: false, error: 'Channel not found' });
    expect(calls).toHaveLength(1);
  });

  it('surfaces API errors', async () => {
    const { impl } = fakeFetch({
      '/channels?': {
        status: 400,
        body: { error: { message: 'API key not valid.', errors: [{ reason: 'keyInvalid' }] } },
      },
    });
    const result = await fetchChannelVideos({ channelId: CHANNEL }, KEY, impl);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/invalid/);
  });

  it('returns an error without calling the API when no key is set', async () => {
    const { impl, calls } = fakeFetch({});
    const result = await fetchChannelVideos({ channelId: CHANNEL }, '', impl);
    expect(result).toMatchObject({ ok: false, error: 'No API key set' });
    expect(calls).toHaveLength(0);
  });

  it('rejects malformed channel IDs before spending quota', async () => {
    const { impl, calls } = fakeFetch({});
    const result = await fetchChannelVideos({ channelId: 'not-an-id' }, KEY, impl);
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('returns no videos for a channel without an uploads playlist', async () => {
    const { impl, calls } = fakeFetch({
      '/channels?': { body: { items: [{ id: CHANNEL, snippet: { title: 'Empty' } }] } },
    });
    const result = await fetchChannelVideos({ channelId: CHANNEL }, KEY, impl);
    expect(result).toMatchObject({ ok: true, videos: [] });
    expect(calls).toHaveLength(1);
  });

  it('reports network failures without throwing', async () => {
    const impl = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    const result = await fetchChannelVideos({ channelId: CHANNEL }, KEY, impl);
    expect(result).toMatchObject({ ok: false, error: 'Network error talking to YouTube' });
  });
});
