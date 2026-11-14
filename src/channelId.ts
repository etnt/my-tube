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
