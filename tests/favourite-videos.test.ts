// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('favourite videos on the Videos page', () => {
  it('shows only favourite videos when the Favourites toggle is on', async () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)?.[1] ?? '';

    const channelId = 'UCAAAAAAAAAAAAAAAAAAAAAA';
    localStorage.setItem(
      'mytube:favorites:v1',
      JSON.stringify([{ id: channelId, name: 'Alpha', addedAt: '2024-01-01T00:00:00Z' }]),
    );
    localStorage.setItem(
      'mytube:favVideos:v1',
      JSON.stringify([
        {
          id: 'aaaaaaaaaaa',
          channelId,
          title: 'Saved video',
          published: '2024-05-01T10:00:00Z',
          url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
          channelName: 'Alpha',
        },
      ]),
    );
    location.hash = '#videos';

    await import('../src/main');

    const toggle = document.getElementById('fav-only-btn') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    toggle.click();

    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    const cards = document.querySelectorAll('#videos .video-card');
    expect(cards).toHaveLength(1);
    expect(cards[0]?.querySelector('.video-title')?.textContent).toBe('Saved video');
    const heart = cards[0]?.querySelector('.heart-btn') as HTMLButtonElement;
    expect(heart.getAttribute('aria-pressed')).toBe('true');
  });
});
