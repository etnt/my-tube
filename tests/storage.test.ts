import { describe, expect, it } from 'vitest';
import {
  addFavorite,
  getLastVisit,
  loadFavorites,
  removeFavorite,
  renameFavorite,
  saveFavorites,
  setLastVisit,
} from '../src/storage';
import type { FavoriteChannel } from '../src/types';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

const makeChannel = (id: string, name = `Channel ${id}`): FavoriteChannel => ({
  id,
  name,
  addedAt: '2024-01-01T00:00:00.000Z',
});

describe('storage', () => {
  it('round trips favorites', () => {
    const storage = new MemoryStorage();
    const favorites = [makeChannel('UC1'.padEnd(24, 'x'))];
    saveFavorites(favorites, storage);
    expect(loadFavorites(storage)).toEqual(favorites);
  });

  it('returns [] when nothing is stored', () => {
    expect(loadFavorites(new MemoryStorage())).toEqual([]);
  });

  it('returns [] on corrupt JSON', () => {
    const storage = new MemoryStorage();
    storage.setItem('mytube:favorites:v1', '{not json');
    expect(loadFavorites(storage)).toEqual([]);
  });

  it('filters invalid entries', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      'mytube:favorites:v1',
      JSON.stringify([
        { id: 'UC1'.padEnd(24, 'x'), name: 'Good', addedAt: '2024-01-01T00:00:00.000Z' },
        'garbage',
        { id: 42, name: 'Bad id' },
        { name: 'No id', addedAt: '2024-01-01T00:00:00.000Z' },
      ]),
    );
    const loaded = loadFavorites(storage);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.name).toBe('Good');
  });

  it('rejects duplicates in addFavorite', () => {
    const storage = new MemoryStorage();
    const id = 'UC1'.padEnd(24, 'x');
    let favorites = [makeChannel(id)];
    expect(() => addFavorite(favorites, { id, name: 'Again' }, storage)).toThrow();
    favorites = addFavorite(favorites, { id: 'UC2'.padEnd(24, 'x'), name: 'New' }, storage);
    expect(favorites).toHaveLength(2);
  });

  it('renameFavorite sets a label and clears it on empty input', () => {
    const storage = new MemoryStorage();
    const id = 'UC1'.padEnd(24, 'x');
    let favorites = [makeChannel(id)];
    favorites = renameFavorite(favorites, id, 'My label', storage);
    expect(favorites[0]!.customLabel).toBe('My label');
    favorites = renameFavorite(favorites, id, '  ', storage);
    expect(favorites[0]!.customLabel).toBeUndefined();
  });

  it('removeFavorite deletes the channel', () => {
    const storage = new MemoryStorage();
    const id = 'UC1'.padEnd(24, 'x');
    let favorites = [makeChannel(id), makeChannel('UC2'.padEnd(24, 'x'))];
    favorites = removeFavorite(favorites, id, storage);
    expect(favorites).toHaveLength(1);
    expect(loadFavorites(storage)).toEqual(favorites);
  });

  it('lastVisit round trips', () => {
    const storage = new MemoryStorage();
    expect(getLastVisit(storage)).toBeNull();
    setLastVisit('2024-06-01T00:00:00.000Z', storage);
    expect(getLastVisit(storage)).toBe('2024-06-01T00:00:00.000Z');
  });
});
