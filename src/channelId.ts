export const CHANNEL_ID_RE = /^UC[\w-]{22}$/;

const CHANNEL_PATH_RE = /(?:^|\/)channel\/(UC[\w-]{22})(?:[/?#]|$)/;
const FEED_CHANNEL_RE = /[?&]channel_id=(UC[\w-]{22})(?:[&#]|$)/;

/**
 * Extract a valid channel ID from a bare ID, a /channel/ URL, or a feed URL
 * with ?channel_id=. Returns null for anything else (handles, /user/, /c/, ...).
 */
export function parseChannelInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (CHANNEL_ID_RE.test(trimmed)) return trimmed;

  const channelMatch = CHANNEL_PATH_RE.exec(trimmed);
  if (channelMatch) return channelMatch[1] ?? null;

  const feedMatch = FEED_CHANNEL_RE.exec(trimmed);
  if (feedMatch) return feedMatch[1] ?? null;

  return null;
}

const HANDLE_RE = /^@([A-Za-z0-9._-]{3,30})$/;
const HANDLE_URL_RE = /^(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/@([A-Za-z0-9._-]{3,30})(?:[/?#]|$)/;

/**
 * Extract a channel handle such as "@veritasium" from a bare handle or a
 * youtube.com/@handle URL. Returns the handle including the "@", or null.
 */
export function parseHandle(input: string): string | null {
  const trimmed = input.trim();
  const bare = HANDLE_RE.exec(trimmed);
  if (bare) return `@${bare[1]}`;
  const url = HANDLE_URL_RE.exec(trimmed);
  if (url) return `@${url[1]}`;
  return null;
}
