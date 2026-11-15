import { describe, expect, it } from 'vitest';
import { favoritesWithTag, listTags, MAX_TAGS_PER_CHANNEL, normalizeTags } from '../src/tags';
import type { FavoriteChannel } from '../src/types';

const fav = (id: string, tags?: string[]): FavoriteChannel => ({
  id,
  name: id,
  addedAt: '2024-01-01T00:00:00Z',
  ...(tags ? { tags } : {}),
});

describe('normalizeTags', () => {
  it('trims, collapses spaces, and drops blanks and case-insensitive duplicates', () => {
    expect(normalizeTags(['  Science  ', '', ' science', 'Sci   ence', 'History'])).toEqual([
      'Science',
      'Sci ence',
      'History',
    ]);
  });

  it('caps the number of tags per channel', () => {
    const many = Array.from({ length: 20 }, (_, i) => `tag${i}`);
    expect(normalizeTags(many)).toHaveLength(MAX_TAGS_PER_CHANNEL);
  });
});

describe('listTags and favoritesWithTag', () => {
  const favorites = [
    fav('A', ['Science', 'History']),
    fav('B', ['science']),
    fav('C'),
  ];

  it('counts tags case-insensitively and sorts them', () => {
    expect(listTags(favorites)).toEqual([
      { tag: 'History', count: 1 },
      { tag: 'Science', count: 2 },
    ]);
  });

  it('filters favourites by tag, ignoring case, and passes all through for null', () => {
    expect(favoritesWithTag(favorites, 'SCIENCE').map((f) => f.id)).toEqual(['A', 'B']);
    expect(favoritesWithTag(favorites, null)).toHaveLength(3);
    expect(favoritesWithTag(favorites, 'Cooking')).toEqual([]);
  });
});
