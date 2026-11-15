import './style.css';
import {
  addFavorite,
  getLastVisit,
  loadApiKey,
  loadFavorites,
  removeFavorite,
  renameFavorite,
  saveApiKey,
  setFavoriteTags,
  setLastVisit,
} from './storage';
import { filterByChannel, markNew, mergeVideos } from './merge';
import { buildDashboard } from './dashboard';
import { parseChannelInput, parseHandle } from './channelId';
import { favoritesWithTag, listTags, normalizeTags } from './tags';
import { fetchChannelVideos, type ChannelRef } from './youtube';
import type { FavoriteChannel, FeedResult, FeedStatus, Video } from './types';

const REFRESH_INTERVAL_MS = 30 * 60 * 1000;
const THEME_KEY = 'mytube:theme:v1';

type View = 'dashboard' | 'videos' | 'channels';
type Theme = 'dark' | 'light';
const VIEWS: View[] = ['dashboard', 'videos', 'channels'];

const state = {
  favorites: [] as FavoriteChannel[],
  results: new Map<string, FeedResult>(),
  statuses: new Map<string, FeedStatus>(),
  previousVisit: null as string | null,
  filter: 'all' as string,
  view: 'dashboard' as View,
  apiKey: '' as string,
  /** Tag used to filter channels on the dashboard and videos; null shows all. */
  tagFilter: null as string | null,
  loading: false,
  firstRefreshDone: false,
};

const el = {
  refreshBtn: document.getElementById('refresh-btn') as HTMLButtonElement,
  themeBtn: document.getElementById('theme-btn') as HTMLButtonElement,
  lastRefreshed: document.getElementById('last-refreshed') as HTMLElement,
  navButtons: [...document.querySelectorAll<HTMLButtonElement>('.tab[data-view]')],
  views: {
    dashboard: document.getElementById('view-dashboard') as HTMLElement,
    videos: document.getElementById('view-videos') as HTMLElement,
    channels: document.getElementById('view-channels') as HTMLElement,
  },
  dashboard: document.getElementById('dashboard') as HTMLElement,
  form: document.getElementById('add-channel-form') as HTMLFormElement,
  input: document.getElementById('channel-input') as HTMLInputElement,
  addError: document.getElementById('add-error') as HTMLElement,
  apiKeyForm: document.getElementById('api-key-form') as HTMLFormElement,
  apiKeyInput: document.getElementById('api-key-input') as HTMLInputElement,
  apiKeyClear: document.getElementById('api-key-clear') as HTMLButtonElement,
  apiKeyStatus: document.getElementById('api-key-status') as HTMLElement,
  apiHelpBtn: document.getElementById('api-help-btn') as HTMLButtonElement,
  apiHelp: document.getElementById('api-help') as HTMLDialogElement,
  apiHelpClose: document.getElementById('api-help-close') as HTMLButtonElement,
  aboutBtn: document.getElementById('about-btn') as HTMLButtonElement,
  about: document.getElementById('about') as HTMLDialogElement,
  aboutClose: document.getElementById('about-close') as HTMLButtonElement,
  filter: document.getElementById('channel-filter') as HTMLSelectElement,
  videoCount: document.getElementById('video-count') as HTMLElement,
  channels: document.getElementById('channels') as HTMLUListElement,
  videos: document.getElementById('videos') as HTMLElement,
  tagBar: document.getElementById('tag-bar') as HTMLElement,
  tagSelect: document.getElementById('channel-tag-select') as HTMLSelectElement,
  player: document.getElementById('player') as HTMLDialogElement,
  playerTitle: document.getElementById('player-title') as HTMLElement,
  playerFrame: document.getElementById('player-frame') as HTMLIFrameElement,
  playerOpen: document.getElementById('player-open') as HTMLAnchorElement,
  playerClose: document.getElementById('player-close') as HTMLButtonElement,
};

/** Small DOM helper: creates an element with optional class and text. */
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

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

/** Age bucket used for colour coding the "latest upload" time. */
function ageClass(iso: string): string {
  const days = (Date.now() - Date.parse(iso)) / 86_400_000;
  if (days < 1) return 'age-today';
  if (days < 7) return 'age-week';
  if (days < 30) return 'age-month';
  return 'age-old';
}

function setSafeLink(a: HTMLAnchorElement, url: string | null): void {
  if (url && url.startsWith('https://')) {
    a.href = url;
    a.rel = 'noopener noreferrer';
  } else {
    a.removeAttribute('href');
  }
}

// ---------- Video player ----------

/** YouTube video IDs are 11 characters from this set. */
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Opens the video in an in-app dialog using YouTube's privacy-enhanced embed. */
function openPlayer(video: Video): void {
  el.playerTitle.textContent = video.title;
  setSafeLink(el.playerOpen, video.url);
  el.playerOpen.target = '_blank';
  if (VIDEO_ID_RE.test(video.id)) {
    el.playerFrame.src = `https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0`;
    el.playerFrame.hidden = false;
  } else {
    el.playerFrame.removeAttribute('src');
    el.playerFrame.hidden = true;
  }
  if (!el.player.open) el.player.showModal();
}

function closePlayer(): void {
  el.player.close();
}

// Stop playback when the dialog closes, however it was closed.
el.player.addEventListener('close', () => {
  el.playerFrame.removeAttribute('src');
});
el.playerClose.addEventListener('click', closePlayer);
// The dialog element itself receives clicks on its backdrop, not its content box.
el.player.addEventListener('click', (event) => {
  if (event.target === el.player) closePlayer();
});

function channelDisplayName(f: FavoriteChannel): string {
  return f.customLabel || f.name;
}

// ---------- Theme ----------

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  // The button offers the other theme.
  el.themeBtn.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // storage unavailable: theme still applies for this session
  }
}

el.themeBtn.addEventListener('click', () => {
  applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
});

// ---------- Views ----------

function viewFromHash(): View {
  const name = location.hash.replace('#', '');
  return (VIEWS as string[]).includes(name) ? (name as View) : 'dashboard';
}

function setView(view: View): void {
  state.view = view;
  for (const name of VIEWS) {
    el.views[name].hidden = name !== view;
  }
  for (const btn of el.navButtons) {
    if (btn.dataset.view === view) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  }
  if (location.hash !== `#${view}`) {
    history.replaceState(null, '', `#${view}`);
  }
  renderTagBar();
}

// ---------- Tags ----------

/** Channels that pass the current tag filter. */
function visibleFavorites(): FavoriteChannel[] {
  return favoritesWithTag(state.favorites, state.tagFilter);
}

/** Shows the tag filter on the Channels page as a dropdown, and keeps it in sync with the chip bar. */
function renderTagSelect(tags: { tag: string; count: number }[]): void {
  el.tagSelect.textContent = '';
  el.tagSelect.appendChild(new Option('All tags', 'all'));
  for (const { tag, count } of tags) {
    el.tagSelect.appendChild(new Option(`${tag} (${count})`, tag));
  }
  el.tagSelect.hidden = tags.length === 0;
  el.tagSelect.value = state.tagFilter ?? 'all';
}

function renderTagBar(): void {
  const tags = listTags(state.favorites);
  // Forget a filter whose tag no longer exists (for example after the last such channel was removed).
  if (state.tagFilter !== null && !tags.some((t) => t.tag.toLowerCase() === state.tagFilter?.toLowerCase())) {
    state.tagFilter = null;
  }
  renderTagSelect(tags);
  el.tagBar.textContent = '';
  el.tagBar.hidden = tags.length === 0 || state.view === 'channels';
  if (el.tagBar.hidden) return;

  const makeChip = (label: string, count: number, active: boolean, onClick: () => void): HTMLButtonElement => {
    const btn = h('button', 'tag-filter', `${label} (${count})`);
    btn.type = 'button';
    btn.setAttribute('aria-pressed', String(active));
    btn.addEventListener('click', onClick);
    return btn;
  };

  el.tagBar.appendChild(
    makeChip('All', state.favorites.length, state.tagFilter === null, () => {
      state.tagFilter = null;
      renderAll();
    }),
  );
  for (const { tag, count } of tags) {
    const active = state.tagFilter !== null && state.tagFilter.toLowerCase() === tag.toLowerCase();
    el.tagBar.appendChild(
      makeChip(tag, count, active, () => {
        state.tagFilter = active ? null : tag;
        renderAll();
      }),
    );
  }
}

/** Tag chips with remove buttons, plus a small form to add tags (comma-separated). */
function renderTagEditor(fav: FavoriteChannel): HTMLElement {
  const box = h('div', 'tag-editor');
  const chips = h('div', 'tag-list');
  for (const tag of fav.tags ?? []) {
    const chip = h('span', 'tag-chip', tag);
    const remove = h('button', 'tag-remove', '×');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove tag ${tag}`);
    remove.addEventListener('click', () => {
      const remaining = (fav.tags ?? []).filter((t) => t !== tag);
      state.favorites = setFavoriteTags(state.favorites, fav.id, remaining);
      renderAll();
    });
    chip.appendChild(remove);
    chips.appendChild(chip);
  }
  box.appendChild(chips);

  const form = h('form', 'tag-form');
  const input = h('input');
  input.type = 'text';
  input.placeholder = 'Add tags, e.g. Science';
  input.setAttribute('aria-label', `Add tags to ${channelDisplayName(fav)}`);
  const addBtn = h('button', 'btn ghost small', 'Add tag');
  addBtn.type = 'submit';
  form.append(input, addBtn);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const added = input.value.split(',');
    state.favorites = setFavoriteTags(state.favorites, fav.id, normalizeTags([...(fav.tags ?? []), ...added]));
    renderAll();
  });
  box.appendChild(form);
  return box;
}

for (const btn of el.navButtons) {
  btn.addEventListener('click', () => setView((btn.dataset.view ?? 'dashboard') as View));
}
window.addEventListener('hashchange', () => setView(viewFromHash()));

// ---------- Dashboard ----------

function openChannelVideos(channelId: string): void {
  state.filter = channelId;
  el.filter.value = channelId;
  renderVideos();
  setView('videos');
}

function renderDashboard(): void {
  el.dashboard.textContent = '';

  if (!state.apiKey) {
    const setup = h('div', 'empty-state');
    setup.appendChild(h('p', 'empty-title', 'Connect the YouTube API'));
    setup.appendChild(
      h('p', 'muted', 'Save a free YouTube Data API key in Channels to load videos. It stays in this browser.'),
    );
    const btn = h('button', 'btn primary', 'Open API key settings');
    btn.type = 'button';
    btn.addEventListener('click', () => setView('channels'));
    setup.appendChild(btn);
    el.dashboard.appendChild(setup);
    return;
  }

  if (state.favorites.length > 0 && visibleFavorites().length === 0) {
    el.dashboard.appendChild(h('p', 'muted', 'No channels with this tag.'));
    return;
  }

  if (state.favorites.length === 0) {
    const empty = h('div', 'empty-state');
    empty.appendChild(h('p', 'empty-title', 'No channels yet'));
    empty.appendChild(h('p', 'muted', 'Add a YouTube channel to see its latest upload here.'));
    const btn = h('button', 'btn primary', 'Add a channel');
    btn.type = 'button';
    btn.addEventListener('click', () => setView('channels'));
    empty.appendChild(btn);
    el.dashboard.appendChild(empty);
    return;
  }

  for (const entry of buildDashboard(visibleFavorites(), state.results)) {
    const card = h('article', 'channel-card');
    const name = channelDisplayName(entry.channel);

    const head = h('div', 'card-head');
    const avatar = h('span', 'avatar', name.charAt(0).toUpperCase() || '?');
    avatar.setAttribute('aria-hidden', 'true');
    head.appendChild(avatar);
    const titles = h('div', 'card-titles');
    titles.appendChild(h('h3', 'card-name', name));
    const sub = entry.loaded && entry.error === undefined ? `${entry.videoCount} in feed` : '';
    titles.appendChild(h('span', 'muted small', sub));
    if (entry.channel.tags?.length) {
      const tagRow = h('div', 'tag-list');
      for (const tag of entry.channel.tags) tagRow.appendChild(h('span', 'tag-chip small', tag));
      titles.appendChild(tagRow);
    }
    head.appendChild(titles);
    card.appendChild(head);

    const body = h('div', 'card-body');
    if (entry.latest) {
      const latest = entry.latest;
      const age = h('div', `latest-age ${ageClass(latest.published)}`, relativeDate(latest.published));
      age.title = new Date(latest.published).toLocaleString();
      body.appendChild(age);
      body.appendChild(h('span', 'muted small', 'since latest upload'));

      const title = h('button', 'latest-title', latest.title);
      title.type = 'button';
      title.addEventListener('click', () => openPlayer(latest));
      body.appendChild(title);

      if (state.previousVisit && Date.parse(latest.published) > Date.parse(state.previousVisit)) {
        body.appendChild(h('span', 'new-badge', 'NEW'));
      }
    } else if (entry.error) {
      body.appendChild(h('p', 'error-message', entry.error));
    } else if (!entry.loaded) {
      body.appendChild(h('p', 'muted', 'Loading…'));
    } else {
      body.appendChild(h('p', 'muted', 'No uploads found in the feed.'));
    }
    card.appendChild(body);

    const foot = h('div', 'card-foot');
    const openBtn = h('button', 'btn ghost small', 'All videos');
    openBtn.type = 'button';
    openBtn.addEventListener('click', () => openChannelVideos(entry.channel.id));
    foot.appendChild(openBtn);
    card.appendChild(foot);

    el.dashboard.appendChild(card);
  }
}

// ---------- Channels management ----------

function renderChannelList(): void {
  el.channels.textContent = '';
  if (state.favorites.length === 0) {
    el.channels.appendChild(h('li', 'muted', 'No channels added yet.'));
    return;
  }
  const shown = visibleFavorites();
  if (shown.length === 0) {
    el.channels.appendChild(h('li', 'muted', 'No channels with this tag.'));
    return;
  }
  for (const fav of shown) {
    const li = h('li', 'channel-row');
    const info = h('div', 'channel-info');
    info.appendChild(h('span', 'channel-name', channelDisplayName(fav)));
    info.appendChild(h('span', 'muted small', fav.id));
    info.appendChild(renderTagEditor(fav));
    li.appendChild(info);

    const status = state.statuses.get(fav.id);
    if (status?.error) {
      const badge = h('span', 'error-badge', status.error);
      badge.title = status.error;
      li.appendChild(badge);
    }

    const actions = h('div', 'row-actions');
    const renameBtn = h('button', 'btn ghost small', 'Rename');
    renameBtn.type = 'button';
    renameBtn.addEventListener('click', () => {
      const label = window.prompt(`Label for ${fav.name}`, fav.customLabel ?? '');
      if (label === null) return;
      state.favorites = renameFavorite(state.favorites, fav.id, label);
      renderAll();
    });
    actions.appendChild(renameBtn);

    const removeBtn = h('button', 'btn danger small', 'Remove');
    removeBtn.type = 'button';
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
    actions.appendChild(removeBtn);
    li.appendChild(actions);

    el.channels.appendChild(li);
  }
}

function renderFilter(): void {
  el.filter.textContent = '';
  el.filter.appendChild(new Option('All channels', 'all'));
  for (const fav of visibleFavorites()) {
    el.filter.appendChild(new Option(channelDisplayName(fav), fav.id));
  }
  if ([...el.filter.options].some((o) => o.value === state.filter)) {
    el.filter.value = state.filter;
  } else {
    state.filter = 'all';
    el.filter.value = 'all';
  }
}

// ---------- Videos ----------

function renderVideoCard(video: Video & { isNew: boolean }): HTMLElement {
  const card = h('article', 'video-card');

  const thumbBtn = h('button', 'video-thumb-link');
  thumbBtn.type = 'button';
  thumbBtn.setAttribute('aria-label', `Play ${video.title}`);
  thumbBtn.addEventListener('click', () => openPlayer(video));
  const thumb = h('img', 'video-thumb');
  if (video.thumbnail && video.thumbnail.startsWith('https://')) {
    thumb.src = video.thumbnail;
  }
  thumb.alt = '';
  thumb.loading = 'lazy';
  thumbBtn.appendChild(thumb);
  card.appendChild(thumbBtn);

  const meta = h('div', 'video-meta');
  const titleBtn = h('button', 'video-title', video.title);
  titleBtn.type = 'button';
  titleBtn.addEventListener('click', () => openPlayer(video));
  meta.appendChild(titleBtn);
  meta.appendChild(h('span', 'video-channel', video.channelName ?? video.channelId));

  const line = h('div', 'video-line');
  line.appendChild(h('span', 'video-date', relativeDate(video.published)));
  if (video.isNew) line.appendChild(h('span', 'new-badge', 'NEW'));
  meta.appendChild(line);

  card.appendChild(meta);
  return card;
}

function renderVideos(): void {
  el.videos.textContent = '';
  const favoriteIds = new Set(visibleFavorites().map((f) => f.id));
  const merged = mergeVideos(
    [...state.results.values()].filter((r) => favoriteIds.has(r.channelId)),
  );
  const filtered = filterByChannel(merged, state.filter);
  const marked = markNew(filtered, state.previousVisit);
  el.videoCount.textContent = `${filtered.length} video${filtered.length === 1 ? '' : 's'}`;

  if (filtered.length === 0) {
    el.videos.appendChild(h('p', 'muted', 'No videos yet. Add a channel in the Channels tab.'));
    return;
  }
  for (const video of marked) {
    el.videos.appendChild(renderVideoCard(video));
  }
}

// ---------- Status and orchestration ----------

function renderStatuses(): void {
  if (!state.apiKey) {
    el.lastRefreshed.textContent = 'Add an API key to load videos';
    return;
  }
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
  renderTagBar();
  renderDashboard();
  renderChannelList();
  renderFilter();
  renderVideos();
  renderStatuses();
}

async function refreshAll(): Promise<void> {
  if (!state.apiKey || state.loading || state.favorites.length === 0) return;
  state.loading = true;
  el.refreshBtn.disabled = true;
  renderStatuses();

  const CONCURRENCY = 4;
  const queue = [...state.favorites];
  const runOne = async (fav: FavoriteChannel): Promise<void> => {
    const result = await fetchChannelVideos({ channelId: fav.id }, state.apiKey);
    // The channel may have been removed while the request was in flight.
    if (!state.favorites.some((f) => f.id === fav.id)) return;
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
    if ([...state.results.values()].some((r) => r.ok)) {
      setLastVisit(new Date().toISOString());
    }
    state.previousVisit = state.previousVisit ?? new Date().toISOString();
  }
  renderAll();
}

el.refreshBtn.addEventListener('click', () => {
  void refreshAll();
});

function showAddError(message: string): void {
  el.addError.textContent = message;
  el.addError.hidden = false;
}

el.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  el.addError.hidden = true;
  const input = el.input.value;
  const handle = parseHandle(input);
  const id = handle ? null : parseChannelInput(input);
  const ref: ChannelRef | null = handle ? { handle } : id ? { channelId: id } : null;
  if (!ref) {
    showAddError(
      'Could not read that channel. Use a channel ID (UC…), a /channel/ URL, or a @handle / youtube.com/@handle URL.',
    );
    return;
  }
  if (!state.apiKey) {
    showAddError('Save a YouTube API key in the API key settings first.');
    return;
  }
  if (id && state.favorites.some((f) => f.id === id)) {
    showAddError('That channel is already in your favourites.');
    return;
  }
  const result = await fetchChannelVideos(ref, state.apiKey);
  if (!result.ok) {
    showAddError(result.error);
    return;
  }
  const channelId = result.channelId;
  if (state.favorites.some((f) => f.id === channelId)) {
    showAddError('That channel is already in your favourites.');
    return;
  }
  state.favorites = addFavorite(state.favorites, { id: channelId, name: result.channelTitle });
  state.results.set(channelId, result);
  const now = new Date().toISOString();
  state.statuses.set(channelId, { lastChecked: now, lastSuccess: now });
  el.input.value = '';
  renderAll();
});

// ---------- API key settings ----------

el.aboutBtn.addEventListener('click', () => {
  if (!el.about.open) el.about.showModal();
});
el.aboutClose.addEventListener('click', () => el.about.close());
el.about.addEventListener('click', (event) => {
  if (event.target === el.about) el.about.close();
});

el.apiHelpBtn.addEventListener('click', () => {
  if (!el.apiHelp.open) el.apiHelp.showModal();
});
el.apiHelpClose.addEventListener('click', () => el.apiHelp.close());
// Clicks on the backdrop hit the dialog element itself, not its content box.
el.apiHelp.addEventListener('click', (event) => {
  if (event.target === el.apiHelp) el.apiHelp.close();
});

function renderApiKeyStatus(): void {
  el.apiKeyStatus.textContent = state.apiKey ? 'Key saved in this browser.' : 'No key saved yet.';
  el.apiKeyClear.disabled = !state.apiKey;
  el.apiKeyInput.placeholder = state.apiKey ? '•••••••• (saved)' : 'AIza…';
}

el.apiKeyForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const value = el.apiKeyInput.value.trim();
  if (!value) return;
  saveApiKey(value);
  state.apiKey = value;
  el.apiKeyInput.value = '';
  renderApiKeyStatus();
  void refreshAll();
  renderAll();
});

el.apiKeyClear.addEventListener('click', () => {
  if (!window.confirm('Remove the saved API key from this browser?')) return;
  saveApiKey('');
  state.apiKey = '';
  renderApiKeyStatus();
  renderAll();
});

el.tagSelect.addEventListener('change', () => {
  state.tagFilter = el.tagSelect.value === 'all' ? null : el.tagSelect.value;
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

// ---------- Startup ----------

state.favorites = loadFavorites();
state.apiKey = loadApiKey();
state.previousVisit = getLastVisit();
renderApiKeyStatus();
applyTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
setView(viewFromHash());
renderAll();
void refreshAll().then(() => {
  lastRefreshAt = Date.now();
});
