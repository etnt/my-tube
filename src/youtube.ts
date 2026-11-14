import { CHANNEL_ID_RE } from './channelId';
import type { FeedResult, Video } from './types';

/**
 * Client for the YouTube Data API v3. It runs in the browser with the user's
 * own API key, so no server is needed.
 *
 * Cost per refresh: 1 unit for the channel lookup plus 1 unit for the
 * uploads playlist, so 2 units per channel.
 */

const API_BASE = 'https://www.googleapis.com/youtube/v3';
const TIMEOUT_MS = 10_000;
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export const VIDEOS_PER_CHANNEL = 15;

/** Look up a channel by its ID (UC…) or by its handle (@name). */
export type ChannelRef = { channelId: string } | { handle: string };

interface ChannelInfo {
  channelId: string;
  title: string;
  uploadsPlaylistId: string | undefined;
}

type ApiResult = { ok: true; json: unknown } | { ok: false; error: string };

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Turn an API error response into a short message the user can act on. */
export function describeApiError(status: number, body: unknown): string {
  const error = asObject(asObject(body)?.error);
  const message = asString(error?.message) ?? '';
  const errors = Array.isArray(error?.errors) ? error.errors : [];
  const reason = asString(asObject(errors[0])?.reason) ?? '';

  if (reason === 'keyInvalid' || /API key not valid/i.test(message)) {
    return 'The API key is invalid. Check it in the API key settings.';
  }
  if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded' || reason === 'rateLimitExceeded') {
    return 'Daily YouTube API quota reached. It resets at midnight Pacific time.';
  }
  if (reason === 'ipRefererBlocked' || reason === 'referrerNotAllowed') {
    return 'This API key is not allowed on this site. Check its HTTP referrer restrictions.';
  }
  if (reason === 'accessNotConfigured' || /has not been used|is disabled/i.test(message)) {
    return 'YouTube Data API v3 is not enabled for this key in Google Cloud.';
  }
  if (message) return message;
  return `YouTube API error (${status})`;
}

export function parseChannelInfo(json: unknown): ChannelInfo | null {
  const items = asObject(json)?.items;
  if (!Array.isArray(items) || items.length === 0) return null;
  const item = asObject(items[0]);
  const channelId = asString(item?.id);
  const title = asString(asObject(item?.snippet)?.title);
  if (!channelId || !title) return null;
  const uploadsPlaylistId = asString(
    asObject(asObject(asObject(item?.contentDetails)?.relatedPlaylists))?.uploads,
  );
  return { channelId, title, uploadsPlaylistId };
}

/** Convert playlistItems entries into videos. Skips deleted and private entries. */
export function parsePlaylistVideos(json: unknown, channelId: string, channelTitle: string): Video[] {
  const items = asObject(json)?.items;
  if (!Array.isArray(items)) return [];
  const videos: Video[] = [];
  for (const raw of items) {
    const item = asObject(raw);
    const snippet = asObject(item?.snippet);
    const details = asObject(item?.contentDetails);
    const videoId =
      asString(details?.videoId) ?? asString(asObject(snippet?.resourceId)?.videoId);
    const title = asString(snippet?.title);
    // videoPublishedAt is the real upload time; snippet.publishedAt is when it was added to the playlist.
    const published = asString(details?.videoPublishedAt) ?? asString(snippet?.publishedAt);
    if (!videoId || !VIDEO_ID_RE.test(videoId) || !title || !published) continue;
    if (Number.isNaN(Date.parse(published))) continue;
    if (title === 'Deleted video' || title === 'Private video') continue;

    const thumbs = asObject(snippet?.thumbnails);
    const thumbnail =
      asString(asObject(thumbs?.medium)?.url) ??
      asString(asObject(thumbs?.high)?.url) ??
      asString(asObject(thumbs?.default)?.url);

    videos.push({
      id: videoId,
      channelId,
      title,
      published,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      ...(thumbnail?.startsWith('https://') ? { thumbnail } : {}),
      channelName: channelTitle,
    });
  }
  return videos;
}

async function apiGet(
  path: string,
  params: Record<string, string>,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<ApiResult> {
  const url = new URL(`${API_BASE}/${path}`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  url.searchParams.set('key', apiKey);

  let res: Response;
  try {
    res = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    return { ok: false, error: 'Network error talking to YouTube' };
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // non-JSON body: handled by the status check below
  }
  if (!res.ok) return { ok: false, error: describeApiError(res.status, json) };
  return { ok: true, json };
}

/**
 * Fetch a channel's most recent uploads. Never throws; failures come back as
 * `{ ok: false, error }` so one bad channel doesn't stop the others.
 */
export async function fetchChannelVideos(
  ref: ChannelRef,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FeedResult> {
  const label = 'channelId' in ref ? ref.channelId : ref.handle;
  if (!apiKey) return { ok: false, channelId: label, error: 'No API key set' };
  if ('channelId' in ref && !CHANNEL_ID_RE.test(ref.channelId)) {
    return { ok: false, channelId: label, error: 'Invalid channel ID' };
  }

  const lookup: Record<string, string> =
    'channelId' in ref ? { id: ref.channelId } : { forHandle: ref.handle };
  const channelRes = await apiGet(
    'channels',
    { part: 'snippet,contentDetails', ...lookup },
    apiKey,
    fetchImpl,
  );
  if (!channelRes.ok) return { ok: false, channelId: label, error: channelRes.error };

  const info = parseChannelInfo(channelRes.json);
  if (!info) return { ok: false, channelId: label, error: 'Channel not found' };
  if (!info.uploadsPlaylistId) {
    return { ok: true, channelId: info.channelId, channelTitle: info.title, videos: [] };
  }

  const playlistRes = await apiGet(
    'playlistItems',
    {
      part: 'snippet,contentDetails',
      playlistId: info.uploadsPlaylistId,
      maxResults: String(VIDEOS_PER_CHANNEL),
    },
    apiKey,
    fetchImpl,
  );
  if (!playlistRes.ok) {
    return { ok: false, channelId: info.channelId, error: playlistRes.error };
  }

  return {
    ok: true,
    channelId: info.channelId,
    channelTitle: info.title,
    videos: parsePlaylistVideos(playlistRes.json, info.channelId, info.title),
  };
}
