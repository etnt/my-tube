import { Router } from 'express';

export const CHANNEL_ID_RE = /^UC[\w-]{22}$/;

const FEED_HOST = 'https://www.youtube.com';
const MAX_BODY_BYTES = 1024 * 1024; // ~1 MB
const MAX_CACHE_ENTRIES = 500;

interface CacheEntry {
  body: string;
  expires: number;
}

export function buildFeedUrl(id: string): string {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(id)}`;
}

export interface FeedRouterOptions {
  fetchImpl?: typeof fetch;
  ttlMs?: number;
  now?: () => number;
}

export function createFeedRouter(options: FeedRouterOptions = {}): Router {
  const fetchImpl = options.fetchImpl ?? fetch;
  const ttlMs = options.ttlMs ?? 15 * 60 * 1000;
  const now = options.now ?? Date.now;
  const cache = new Map<string, CacheEntry>();

  async function handler(
    req: import('express').Request,
    res: import('express').Response,
  ): Promise<void> {
    const raw = req.query.channel_id;
    const id = typeof raw === 'string' ? raw : null;
    if (id === null || !CHANNEL_ID_RE.test(id)) {
      res.status(400).json({ error: { code: 'invalid_channel_id', message: 'channel_id must be a single valid channel ID (UC…)' } });
      return;
    }

    const hit = cache.get(id);
    if (hit && hit.expires > now()) {
      res.set('X-Cache', 'HIT');
      res.set('Content-Type', 'application/atom+xml; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=300');
      res.send(hit.body);
      return;
    }

    let res2: Response;
    try {
      res2 = await fetchImpl(buildFeedUrl(id), {
        signal: AbortSignal.timeout(8000),
        redirect: 'error',
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      const status = name === 'TimeoutError' || name === 'AbortError' ? 504 : 502;
      res.status(status).json({ error: { code: status === 504 ? 'upstream_timeout' : 'upstream_error', message: 'YouTube unavailable' } });
      return;
    }

    if (!res2.ok) {
      if (res2.status === 404) {
        res.status(404).json({ error: { code: 'channel_not_found', message: 'Channel not found' } });
      } else {
        res.status(502).json({ error: { code: 'upstream_error', message: 'YouTube unavailable' } });
      }
      return;
    }

    let body: string;
    try {
      body = await res2.text();
    } catch {
      res.status(502).json({ error: { code: 'upstream_error', message: 'YouTube unavailable' } });
      return;
    }
    if (body.length > MAX_BODY_BYTES || !body.includes('<feed')) {
      res.status(502).json({ error: { code: 'upstream_error', message: 'YouTube unavailable' } });
      return;
    }

    cache.set(id, { body, expires: now() + ttlMs });
    if (cache.size > MAX_CACHE_ENTRIES) {
      const firstKey = cache.keys().next().value;
      if (firstKey !== undefined) cache.delete(firstKey);
    }

    res.set('X-Cache', 'MISS');
    res.set('Content-Type', 'application/atom+xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300');
    res.send(body);
  }

  const router = Router();
  router.get('/feed', (req, res, next) => {
    handler(req, res).catch(next);
  });
  return router;
}
