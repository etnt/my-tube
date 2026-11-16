import type { FavoriteChannel, Video } from './types';
import { normalizeTags } from './tags';

export const FAVORITES_KEY = 'mytube:favorites:v1';
export const LAST_VISIT_KEY = 'mytube:lastVisit:v1';

export function loadFavorites(storage: Storage = localStorage): FavoriteChannel[] {
  try {
    const raw = storage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) return [];
    const out: FavoriteChannel[] = [];
    for (const item of parsed) {
      if (
        item !== null &&
        typeof item === 'object' &&
        typeof (item as { id?: unknown }).id === 'string' &&
        typeof (item as { name?: unknown }).name === 'string' &&
        typeof (item as { addedAt?: unknown }).addedAt === 'string'
      ) {
        const rec = item as {
          id: string;
          name: string;
          addedAt: string;
          customLabel?: unknown;
          tags?: unknown;
        };
        out.push({
          id: rec.id,
          name: rec.name,
          addedAt: rec.addedAt,
          ...(typeof rec.customLabel === 'string' ? { customLabel: rec.customLabel } : {}),
          ...(Array.isArray(rec.tags)
            ? { tags: normalizeTags(rec.tags.filter((t): t is string => typeof t === 'string')) }
            : {}),
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

export function saveFavorites(
  favorites: FavoriteChannel[],
  storage: Storage = localStorage,
): void {
  try {
    storage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  } catch {
    // storage unavailable (private mode, quota) — keep running in memory
  }
}

export function addFavorite(
  favorites: FavoriteChannel[],
  channel: { id: string; name: string; customLabel?: string; addedAt?: string },
  storage: Storage = localStorage,
): FavoriteChannel[] {
  if (favorites.some((f) => f.id === channel.id)) {
    throw new Error('Channel is already in your favourites');
  }
  const next = [
    ...favorites,
    {
      id: channel.id,
      name: channel.name,
      ...(channel.customLabel !== undefined ? { customLabel: channel.customLabel } : {}),
      addedAt: channel.addedAt ?? new Date().toISOString(),
    },
  ];
  saveFavorites(next, storage);
  return next;
}

/** Replace a channel's tags. Tags are normalised; an empty list clears them. */
export function setFavoriteTags(
  favorites: FavoriteChannel[],
  id: string,
  tags: string[],
  storage: Storage = localStorage,
): FavoriteChannel[] {
  const cleaned = normalizeTags(tags);
  const next = favorites.map((f) => {
    if (f.id !== id) return f;
    const { tags: _previous, ...rest } = f;
    return cleaned.length > 0 ? { ...rest, tags: cleaned } : rest;
  });
  saveFavorites(next, storage);
  return next;
}

/** Rename a channel. An empty label clears the custom label. */
export function renameFavorite(
  favorites: FavoriteChannel[],
  id: string,
  label: string,
  storage: Storage = localStorage,
): FavoriteChannel[] {
  const next = favorites.map((f) =>
    f.id === id
      ? { ...f, customLabel: label.trim() || undefined }
      : f,
  );
  saveFavorites(next, storage);
  return next;
}

export function removeFavorite(
  favorites: FavoriteChannel[],
  id: string,
  storage: Storage = localStorage,
): FavoriteChannel[] {
  const next = favorites.filter((f) => f.id !== id);
  saveFavorites(next, storage);
  return next;
}

export function getLastVisit(storage: Storage = localStorage): string | null {
  try {
    return storage.getItem(LAST_VISIT_KEY);
  } catch {
    return null;
  }
}

export function setLastVisit(iso: string, storage: Storage = localStorage): void {
  try {
    storage.setItem(LAST_VISIT_KEY, iso);
  } catch {
    // ignore
  }
}

export const API_KEY_STORAGE_KEY = 'mytube:apiKey:v1';

/** The YouTube Data API key, kept only in this browser. Empty string if unset. */
export function loadApiKey(storage: Storage = localStorage): string {
  try {
    return storage.getItem(API_KEY_STORAGE_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

/** Save the key, or remove it when the value is blank. */
export function saveApiKey(key: string, storage: Storage = localStorage): void {
  try {
    const trimmed = key.trim();
    if (trimmed) storage.setItem(API_KEY_STORAGE_KEY, trimmed);
    else storage.removeItem(API_KEY_STORAGE_KEY);
  } catch {
    // storage unavailable: the key lasts only for this page load
  }
}

export const FAV_VIDEOS_KEY = 'mytube:favVideos:v1';

/**
 * Keep a well-formed video record and drop everything else. Only the fields
 * the app uses are copied, so transient flags such as isNew are never stored.
 */
export function sanitizeVideo(value: unknown): Video | null {
  if (value === null || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const { id, channelId, title, published, url } = v;
  if (
    typeof id !== 'string' ||
    typeof channelId !== 'string' ||
    typeof title !== 'string' ||
    typeof published !== 'string' ||
    typeof url !== 'string' ||
    Number.isNaN(Date.parse(published))
  ) {
    return null;
  }
  return {
    id,
    channelId,
    title,
    published,
    url,
    ...(typeof v.thumbnail === 'string' ? { thumbnail: v.thumbnail } : {}),
    ...(typeof v.channelName === 'string' ? { channelName: v.channelName } : {}),
  };
}

/** Favourite videos are stored as snapshots, so they survive after leaving the latest-uploads feed. */
export function loadFavoriteVideos(storage: Storage = localStorage): Video[] {
  try {
    const raw = storage.getItem(FAV_VIDEOS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeVideo).filter((v): v is Video => v !== null);
  } catch {
    return [];
  }
}

export function saveFavoriteVideos(videos: Video[], storage: Storage = localStorage): void {
  try {
    storage.setItem(FAV_VIDEOS_KEY, JSON.stringify(videos));
  } catch {
    // storage unavailable: favourites last for this page load only
  }
}

/** Add the video as a favourite, or remove it if it already is one. */
export function toggleFavoriteVideo(
  videos: Video[],
  video: Video,
  storage: Storage = localStorage,
): Video[] {
  const exists = videos.some((v) => v.id === video.id);
  const snapshot = sanitizeVideo(video);
  let next = videos;
  if (exists) next = videos.filter((v) => v.id !== video.id);
  else if (snapshot) next = [...videos, snapshot];
  saveFavoriteVideos(next, storage);
  return next;
}
