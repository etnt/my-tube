// @vitest-environment node
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { buildFeedUrl, createFeedRouter } from '../server/feed';
import { createApp } from '../server/index';

const CHANNEL = 'UC1234567890123456789012';
const VALID_XML = '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>t</title></feed>';

function appWithRouter(fetchImpl: typeof fetch, opts?: { ttlMs?: number; now?: () => number }) {
  return createApp({ fetchImpl, ...opts });
}

describe('server', () => {
  it('buildFeedUrl returns the canonical feed URL', () => {
    expect(buildFeedUrl(CHANNEL)).toBe(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL}`,
    );
  });

  it('rejects a missing channel_id with 400 and never calls fetch', async () => {
    const fetchImpl = vi.fn();
    const app = appWithRouter(fetchImpl as unknown as typeof fetch);
    const res = await request(app).get('/api/feed');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_channel_id');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a malformed channel_id with 400', async () => {
    const fetchImpl = vi.fn();
    const app = appWithRouter(fetchImpl as unknown as typeof fetch);
    const res = await request(app).get('/api/feed?channel_id=nope');
    expect(res.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects an array channel_id with 400', async () => {
    const fetchImpl = vi.fn();
    const app = appWithRouter(fetchImpl as unknown as typeof fetch);
    const res = await request(app).get('/api/feed').query({ channel_id: [CHANNEL, CHANNEL] });
    expect(res.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects URL injection attempts with 400', async () => {
    const fetchImpl = vi.fn();
    const app = appWithRouter(fetchImpl as unknown as typeof fetch);
    for (const bad of [`UC1234567890123456789012&x=1`, '../', 'UC%.d']) {
      const res = await request(app).get(`/api/feed?channel_id=${encodeURIComponent(bad)}`);
      expect(res.status).toBe(400);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fetches the exact upstream URL for a valid ID', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(VALID_XML, { status: 200 }));
    const app = appWithRouter(fetchImpl as unknown as typeof fetch);
    const res = await request(app).get(`/api/feed?channel_id=${CHANNEL}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/atom+xml');
    expect(res.headers['x-cache']).toBe('MISS');
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL}`,
      expect.objectContaining({ redirect: 'error' }),
    );
  });

  it('serves the second request from cache', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(VALID_XML, { status: 200 }));
    const app = appWithRouter(fetchImpl as unknown as typeof fetch);
    await request(app).get(`/api/feed?channel_id=${CHANNEL}`);
    const res = await request(app).get(`/api/feed?channel_id=${CHANNEL}`);
    expect(res.headers['x-cache']).toBe('HIT');
    expect(res.text).toBe(VALID_XML);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('refetches after the TTL expires', async () => {
    let currentTime = 1_000_000;
    const fetchImpl = vi.fn().mockImplementation(() => new Response(VALID_XML, { status: 200 }));
    const app = appWithRouter(fetchImpl as unknown as typeof fetch, {
      now: () => currentTime,
      ttlMs: 60_000,
    });
    await request(app).get(`/api/feed?channel_id=${CHANNEL}`);
    currentTime += 61_000;
    await request(app).get(`/api/feed?channel_id=${CHANNEL}`);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('maps a 404 upstream to 404 and does not cache it', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('gone', { status: 404 }));
    const app = appWithRouter(fetchImpl as unknown as typeof fetch);
    const res = await request(app).get(`/api/feed?channel_id=${CHANNEL}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('channel_not_found');
    const res2 = await request(app).get(`/api/feed?channel_id=${CHANNEL}`);
    expect(res2.status).toBe(404);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('maps a 500 upstream to 502', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('boom', { status: 500 }));
    const app = appWithRouter(fetchImpl as unknown as typeof fetch);
    const res = await request(app).get(`/api/feed?channel_id=${CHANNEL}`);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('upstream_error');
  });

  it('maps a thrown fetch error to 502', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('dns fail'));
    const app = appWithRouter(fetchImpl as unknown as typeof fetch);
    const res = await request(app).get(`/api/feed?channel_id=${CHANNEL}`);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('upstream_error');
  });

  it('maps an abort/timeout to 504', async () => {
    const err = new Error('The operation was aborted due to timeout');
    err.name = 'TimeoutError';
    const fetchImpl = vi.fn().mockRejectedValue(err);
    const app = appWithRouter(fetchImpl as unknown as typeof fetch);
    const res = await request(app).get(`/api/feed?channel_id=${CHANNEL}`);
    expect(res.status).toBe(504);
    expect(res.body.error.code).toBe('upstream_timeout');
  });

  it('rejects a body that does not look like a feed', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('<html>hi</html>', { status: 200 }));
    const app = appWithRouter(fetchImpl as unknown as typeof fetch);
    const res = await request(app).get(`/api/feed?channel_id=${CHANNEL}`);
    expect(res.status).toBe(502);
  });

  it('returns JSON 404 for unknown /api paths', async () => {
    const app = createApp();
    const res = await request(app).get('/api/other');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });

});
