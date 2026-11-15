import type { FavoriteChannel } from './types';

export const MAX_TAGS_PER_CHANNEL = 10;
export const MAX_TAG_LENGTH = 24;

/**
 * Clean up user-entered tags: trim, collapse spaces, cap the length, drop
 * blanks and case-insensitive duplicates (the first spelling wins), and cap
 * the count per channel.
 */
export function normalizeTags(input: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const tag = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LENGTH).trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length === MAX_TAGS_PER_CHANNEL) break;
  }
  return out;
}

/** Every tag in use across favourites, with the number of channels carrying it. */
export function listTags(favorites: FavoriteChannel[]): { tag: string; count: number }[] {
  const byKey = new Map<string, { tag: string; count: number }>();
  for (const fav of favorites) {
    for (const tag of fav.tags ?? []) {
      const key = tag.toLowerCase();
      const entry = byKey.get(key);
      if (entry) entry.count += 1;
      else byKey.set(key, { tag, count: 1 });
    }
  }
  return [...byKey.values()].sort((a, b) => a.tag.localeCompare(b.tag));
}

/** Favourites carrying the given tag. A null tag means no filter. */
export function favoritesWithTag(
  favorites: FavoriteChannel[],
  tag: string | null,
): FavoriteChannel[] {
  if (tag === null) return favorites;
  const key = tag.toLowerCase();
  return favorites.filter((f) => (f.tags ?? []).some((t) => t.toLowerCase() === key));
}
