import type { FavoriteChannel } from './types';

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
        const rec = item as { id: string; name: string; addedAt: string; customLabel?: unknown };
        out.push({
          id: rec.id,
          name: rec.name,
          addedAt: rec.addedAt,
          ...(typeof rec.customLabel === 'string' ? { customLabel: rec.customLabel } : {}),
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
