import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { fetchChannel, parseAtomFeed } from '../src/feed';

const feedXml = readFileSync(join(__dirname, 'fixtures', 'feed.xml'), 'utf8');
const badXml = readFileSync(join(__dirname, 'fixtures', 'feed-bad.xml'), 'utf8');

const CHANNEL = 'UC1234567890123456789012';

describe('parseAtomFeed', () => {
  it('parses fields correctly', () => {
    const { channelTitle, videos } = parseAtomFeed(feedXml, CHANNEL);
    expect(channelTitle).toBe('Sample Channel & Friends');
    expect(videos).toHaveLength(3);
    const first = videos[0]!;
    expect(first.id).toBe('vidA000000000000000001');
    expect(first.title).toBe('First <Video> & "Quotes"');
    expect(first.published).toBe('2024-06-03T10:00:00.000Z');
    expect(first.url).toBe('https://www.youtube.com/watch?v=vidA000000000000000001');
    expect(first.thumbnail).toBe('https://i.ytimg.com/vi/vidA000000000000000001/hqdefault.jpg');
    expect(first.channelName).toBe('Sample Channel & Friends');
    expect(first.channelId).toBe(CHANNEL);
  });

  it('sorts entries by document order (caller sorts later)', () => {
    const { videos } = parseAtomFeed(feedXml, CHANNEL);
    expect(videos.map((v) => v.id)).toEqual([
      'vidA000000000000000001',
      'vidB000000000000000002',
      'vidC000000000000000003',
    ]);
  });

  it('skips entries without an id', () => {
    const { videos } = parseAtomFeed(feedXml, CHANNEL);
    expect(videos.some((v) => v.title.includes('without an id'))).toBe(false);
  });

  it('falls back to a watch URL when the alternate link is missing', () => {
    const xml = `<?xml version="1.0"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"><title>T</title><entry><yt:videoId>vidA000000000000000001</yt:videoId><published>2024-01-01T00:00:00Z</published><title>x</title></entry></feed>`;
    const { videos } = parseAtomFeed(xml, CHANNEL);
    expect(videos[0]!.url).toBe('https://www.youtube.com/watch?v=vidA000000000000000001');
  });

  it('throws on malformed XML', () => {
    expect(() => parseAtomFeed(badXml, CHANNEL)).toThrow(/Invalid XML/);
  });

  it('throws on non-XML text', () => {
    expect(() => parseAtomFeed('plain text, no xml', CHANNEL)).toThrow(/Invalid XML/);
  });
});

describe('fetchChannel', () => {
  it('returns ok with parsed videos', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(feedXml, { status: 200 }));
    const result = await fetchChannel(CHANNEL, fetchImpl as unknown as typeof fetch);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.channelTitle).toBe('Sample Channel & Friends');
      expect(result.videos).toHaveLength(3);
    }
  });

  it('maps a 404 to a failure with a short message', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'channel_not_found', message: 'Channel not found' } }), {
        status: 404,
      }),
    );
    const result = await fetchChannel(CHANNEL, fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ ok: false, channelId: CHANNEL, error: 'Channel not found' });
  });

  it('maps a 502 to "YouTube unavailable"', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 502 }));
    const result = await fetchChannel(CHANNEL, fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ ok: false, channelId: CHANNEL, error: 'YouTube unavailable' });
  });

  it('maps a network error to "Server unreachable" and never throws', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('failed to fetch'));
    const result = await fetchChannel(CHANNEL, fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ ok: false, channelId: CHANNEL, error: 'Server unreachable' });
  });
});
