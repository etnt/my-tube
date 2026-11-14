import type { FeedResult, Video } from './types';

interface ParsedFeed {
  channelTitle: string;
  videos: Video[];
}

/**
 * Parse a YouTube channel Atom feed with DOMParser.
 * Throws a clear Error when the XML is invalid.
 */
export function parseAtomFeed(xml: string, channelId: string): ParsedFeed {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const parserError = doc.getElementsByTagName('parsererror')[0];
  if (parserError) {
    throw new Error('Invalid XML in feed');
  }
  const feed = doc.getElementsByTagName('feed')[0];
  if (!feed) {
    throw new Error('Invalid XML in feed');
  }

  const titleEl = feed.getElementsByTagName('title')[0];
  const channelTitle = titleEl?.textContent?.trim() ?? channelId;

  const videos: Video[] = [];
  const entries = feed.getElementsByTagName('entry');
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const idEl = entry.getElementsByTagName('yt:videoId')[0];
    const id = idEl?.textContent?.trim();
    if (!id) continue;

    const publishedEl = entry.getElementsByTagName('published')[0];
    const publishedRaw = publishedEl?.textContent?.trim();
    if (!publishedRaw) continue;
    const publishedTime = Date.parse(publishedRaw);
    if (Number.isNaN(publishedTime)) continue;
    const published = new Date(publishedTime).toISOString();

    const title = entry.getElementsByTagName('title')[0]?.textContent?.trim() ?? '';

    const link = entry.getElementsByTagNameNS('*', 'link');
    let url: string | null = null;
    for (let j = 0; j < link.length; j++) {
      if (link[j]!.getAttribute('rel') === 'alternate') {
        url = link[j]!.getAttribute('href');
        break;
      }
    }
    if (!url) url = `https://www.youtube.com/watch?v=${id}`;

    const thumbEl = entry.getElementsByTagNameNS('*', 'thumbnail')[0];
    const thumbnail = thumbEl?.getAttribute('url') ?? undefined;

    videos.push({
      id,
      channelId,
      title,
      published,
      url,
      ...(thumbnail !== undefined ? { thumbnail } : {}),
      ...(channelTitle ? { channelName: channelTitle } : {}),
    });
  }

  return { channelTitle, videos };
}

function shortErrorMessage(status: number): string {
  if (status === 404) return 'Channel not found';
  if (status === 502 || status === 504) return 'YouTube unavailable';
  return 'Server unreachable';
}

/** Fetch and parse one channel's feed via the proxy endpoint. Never throws. */
export async function fetchChannel(
  id: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FeedResult> {
  try {
    const res = await fetchImpl(`/api/feed?channel_id=${encodeURIComponent(id)}`);
    if (!res.ok) {
      let message = shortErrorMessage(res.status);
      try {
        const body = (await res.json()) as { error?: { message?: string } };
        if (body?.error?.message) message = body.error.message;
      } catch {
        // non-JSON error body — keep the short message
      }
      return { ok: false, channelId: id, error: message };
    }
    const xml = await res.text();
    const parsed = parseAtomFeed(xml, id);
    return { ok: true, channelId: id, channelTitle: parsed.channelTitle, videos: parsed.videos };
  } catch {
    return { ok: false, channelId: id, error: 'Server unreachable' };
  }
}
