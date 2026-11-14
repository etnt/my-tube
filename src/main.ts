import './style.css';
import {
  addFavorite,
  getLastVisit,
  loadFavorites,
  removeFavorite,
  renameFavorite,
  setLastVisit,
} from './storage';
import { fetchChannel } from './feed';
import { filterByChannel, markNew, mergeVideos } from './merge';
import { parseChannelInput } from './channelId';
import type { FavoriteChannel, FeedResult, FeedStatus, Video } from './types';

const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

const state = {
  favorites: [] as FavoriteChannel[],
  results: new Map<string, FeedResult>(),
  statuses: new Map<string, FeedStatus>(),
  previousVisit: null as string | null,
  filter: 'all' as string | 'all',
  loading: false,
  firstRefreshDone: false,
};

const el = {
  refreshBtn: document.getElementById('refresh-btn') as HTMLButtonElement,
  lastRefreshed: document.getElementById('last-refreshed') as HTMLElement,
  form: document.getElementById('add-channel-form') as HTMLFormElement,
  input: document.getElementById('channel-input') as HTMLInputElement,
  addError: document.getElementById('add-error') as HTMLElement,
  filter: document.getElementById('channel-filter') as HTMLSelectElement,
  videoCount: document.getElementById('video-count') as HTMLElement,
  channels: document.getElementById('channels') as HTMLUListElement,
  videos: document.getElementById('videos') as HTMLElement,
};

function relativeDate(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return iso;
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo ago`;
  return `${Math.floor(months / 12)} y ago`;
}

function setSafeLink(a: HTMLAnchorElement, url: string | null): void {
  if (url && url.startsWith('https://')) {
    a.href = url;
    a.rel = 'noopener noreferrer';
  } else {
    a.removeAttribute('href');
  }
}

function channelDisplayName(f: FavoriteChannel): string {
  return f.customLabel || f.name;
}

function renderChannelList(): void {
  el.channels.textContent = '';
  for (const fav of state.favorites) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = channelDisplayName(fav);
    li.appendChild(name);

    const status = state.statuses.get(fav.id);
    if (status?.error) {
      const badge = document.createElement('span');
      badge.className = 'error-badge';
      badge.textContent = status.error;
      badge.title = status.error;
      li.appendChild(badge);
    }

    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.textContent = 'Rename';
    renameBtn.addEventListener('click', () => {
      const label = window.prompt(`Label for ${fav.name}`, fav.customLabel ?? '');
      if (label === null) return;
      state.favorites = renameFavorite(state.favorites, fav.id, label);
      renderAll();
    });
    li.appendChild(renameBtn);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      if (!window.confirm(`Remove ${channelDisplayName(fav)}?`)) return;
      state.favorites = removeFavorite(state.favorites, fav.id);
      state.results.delete(fav.id);
      state.statuses.delete(fav.id);
      if (state.filter !== 'all' && !state.favorites.some((f) => f.id === state.filter)) {
        state.filter = 'all';
      }
      renderAll();
    });
    li.appendChild(removeBtn);

    el.channels.appendChild(li);
  }
}

function renderFilter(): void {
  el.filter.textContent = '';
  const allOption = document.createElement('option');
  allOption.value = 'all';
  allOption.textContent = 'All channels';
  el.filter.appendChild(allOption);
  for (const fav of state.favorites) {
    const opt = document.createElement('option');
    opt.value = fav.id;
    opt.textContent = channelDisplayName(fav);
    el.filter.appendChild(opt);
  }
  el.filter.value = state.filter;
  if (el.filter.value !== state.filter) {
    state.filter = 'all';
    el.filter.value = 'all';
  }
}

function renderVideos(): void {
  el.videos.textContent = '';
  const merged = mergeVideos([...state.results.values()]);
  const filtered = filterByChannel(merged, state.filter);
  const marked = markNew(filtered, state.previousVisit);
  el.videoCount.textContent = `${filtered.length} video${filtered.length === 1 ? '' : 's'}`;

  if (filtered.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'status-line';
    empty.textContent = 'No videos yet. Add a channel above.';
    el.videos.appendChild(empty);
    return;
  }

  for (const video of marked) {
    const card = document.createElement('article');
    card.className = 'video-card';

    const link = document.createElement('a');
    setSafeLink(link, video.url);
    link.target = '_blank';
    const thumb = document.createElement('img');
    thumb.className = 'video-thumb';
    if (video.thumbnail) thumb.src = video.thumbnail;
    thumb.alt = '';
    thumb.loading = 'lazy';
    link.appendChild(thumb);
    card.appendChild(link);

    const meta = document.createElement('div');
    meta.className = 'video-meta';

    const titleLink = document.createElement('a');
    titleLink.className = 'video-title';
    setSafeLink(titleLink, video.url);
    titleLink.target = '_blank';
    titleLink.textContent = video.title;
    meta.appendChild(titleLink);

    const channelSpan = document.createElement('span');
    channelSpan.className = 'video-channel';
    channelSpan.textContent = video.channelName ?? video.channelId;
    meta.appendChild(channelSpan);

    const dateSpan = document.createElement('span');
    dateSpan.className = 'video-date';
    dateSpan.textContent = relativeDate(video.published);
    meta.appendChild(dateSpan);

    if (video.isNew) {
      const badge = document.createElement('span');
      badge.className = 'new-badge';
      badge.textContent = 'NEW';
      meta.appendChild(badge);
    }

    card.appendChild(meta);
    el.videos.appendChild(card);
  }
}

function renderStatuses(): void {
  const latest = [...state.statuses.values()].reduce<number>((max, s) => {
    if (!s.lastSuccess) return max;
    const t = Date.parse(s.lastSuccess);
    return Number.isNaN(t) ? max : Math.max(max, t);
  }, 0);
  if (latest) {
    el.lastRefreshed.textContent = `Updated ${relativeDate(new Date(latest).toISOString())}`;
  } else if (state.loading) {
    el.lastRefreshed.textContent = 'Loading…';
  } else {
    el.lastRefreshed.textContent = '';
  }
}

function renderAll(): void {
  renderChannelList();
  renderFilter();
  renderVideos();
  renderStatuses();
}

async function refreshAll(): Promise<void> {
  if (state.loading || state.favorites.length === 0) return;
  state.loading = true;
  el.refreshBtn.disabled = true;
  renderStatuses();

  const CONCURRENCY = 4;
  const queue = [...state.favorites];
  const runOne = async (fav: FavoriteChannel): Promise<void> => {
    const result = await fetchChannel(fav.id);
    state.results.set(fav.id, result);
    const nowIso = new Date().toISOString();
    const prev = state.statuses.get(fav.id) ?? {};
    if (result.ok) {
      state.statuses.set(fav.id, { ...prev, lastChecked: nowIso, lastSuccess: nowIso });
    } else {
      state.statuses.set(fav.id, { ...prev, lastChecked: nowIso, error: result.error });
    }
    renderAll();
  };

  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0) {
      const fav = queue.shift();
      if (!fav) break;
      await runOne(fav);
    }
  });
  await Promise.all(workers);

  state.loading = false;
  el.refreshBtn.disabled = false;
  if (!state.firstRefreshDone) {
    state.firstRefreshDone = true;
    setLastVisit(new Date().toISOString());
    state.previousVisit = state.previousVisit ?? new Date().toISOString();
  }
  renderAll();
}

el.refreshBtn.addEventListener('click', () => {
  void refreshAll();
});

el.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  el.addError.hidden = true;
  const input = el.input.value;
  const id = parseChannelInput(input);
  if (!id) {
    el.addError.textContent =
      'Could not read that channel. Handles (@name), /user/ and /c/ URLs are not supported — use the /channel/UC… URL or the feed URL with ?channel_id=.';
    el.addError.hidden = false;
    return;
  }
  if (state.favorites.some((f) => f.id === id)) {
    el.addError.textContent = 'That channel is already in your favourites.';
    el.addError.hidden = false;
    return;
  }
  const result = await fetchChannel(id);
  if (!result.ok) {
    el.addError.textContent = result.error;
    el.addError.hidden = false;
    return;
  }
  state.favorites = addFavorite(state.favorites, { id, name: result.channelTitle });
  state.results.set(id, result);
  state.statuses.set(id, { lastChecked: new Date().toISOString(), lastSuccess: new Date().toISOString() });
  el.input.value = '';
  renderAll();
});

el.filter.addEventListener('change', () => {
  state.filter = el.filter.value;
  renderVideos();
});

let lastRefreshAt = 0;

async function maybeAutoRefresh(): Promise<void> {
  if (document.hidden) return;
  if (Date.now() - lastRefreshAt < REFRESH_INTERVAL_MS) return;
  await refreshAll();
  lastRefreshAt = Date.now();
}

setInterval(() => void maybeAutoRefresh(), REFRESH_INTERVAL_MS);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && Date.now() - lastRefreshAt >= REFRESH_INTERVAL_MS) {
    void maybeAutoRefresh();
  }
});

// Startup
state.favorites = loadFavorites();
state.previousVisit = getLastVisit();
renderAll();
void refreshAll().then(() => {
  lastRefreshAt = Date.now();
});

window.addEventListener('pagehide', () => {
  if (!state.firstRefreshDone && state.loading) {
    setLastVisit(new Date().toISOString());
  }
});
