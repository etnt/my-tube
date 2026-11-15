// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('tag dropdowns on the Dashboard and Videos pages', () => {
  it('shows a tag dropdown on the Videos page and the Dashboard, with the same options', async () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    const body = html.match(/<body>([\s\S]*)<\/body>/)?.[1] ?? '';
    document.body.innerHTML = body;

    localStorage.setItem(
      'mytube:favorites:v1',
      JSON.stringify([
        { id: 'UCAAAAAAAAAAAAAAAAAAAAAA', name: 'Alpha', addedAt: '2024-01-01T00:00:00Z', tags: ['Science'] },
        { id: 'UCBBBBBBBBBBBBBBBBBBBBBB', name: 'Beta', addedAt: '2024-01-01T00:00:00Z', tags: ['History'] },
      ]),
    );
    location.hash = '#videos';

    await import('../src/main');

    const select = document.getElementById('channel-tag-select') as HTMLSelectElement;
    const dashboardSelect = document.getElementById('dashboard-tag-select') as HTMLSelectElement;
    const wrap = select.closest('.tag-select-wrap') as HTMLElement;
    expect(wrap.hidden).toBe(false);
    expect((dashboardSelect.closest('.tag-select-wrap') as HTMLElement).hidden).toBe(false);
    expect([...select.options].map((o) => o.textContent)).toEqual([
      'All tags',
      'History (1)',
      'Science (1)',
    ]);
    expect([...dashboardSelect.options].map((o) => o.textContent)).toEqual([
      'All tags',
      'History (1)',
      'Science (1)',
    ]);
  });
});
