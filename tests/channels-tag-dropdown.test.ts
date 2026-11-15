// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('tag dropdown on the Channels page', () => {
  it('shows the dropdown and hides the chip bar on #channels', async () => {
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
    location.hash = '#channels';

    await import('../src/main');

    const select = document.getElementById('channel-tag-select') as HTMLSelectElement;
    const tagBar = document.getElementById('tag-bar') as HTMLElement;
    const wrap = document.getElementById('tag-select-wrap') as HTMLElement;
    expect(wrap.hidden).toBe(false);
    expect(select.hidden).toBe(false);
    expect([...select.options].map((o) => o.textContent)).toEqual([
      'All tags',
      'History (1)',
      'Science (1)',
    ]);
    expect(tagBar.hidden).toBe(true);
  });
});
