# my-tube

A personal dashboard that merges the latest uploads from your favourite YouTube
channels into one list. Add channels by ID or URL, see what's new since your
last visit, and let the page auto-refresh while it is open.

## Stack & architecture

- **Client:** Vite + TypeScript single-page app. The browser parses the YouTube
  Atom XML with `DOMParser`; the server never parses feeds.
- **Server:** a small Express process whose only job is to proxy
  `https://www.youtube.com/feeds/videos.xml?channel_id=UC…` with a 15-minute
  in-memory cache.
- **Favourites:** stored in the browser's `localStorage`. There is no account,
  no sync, and no database.

```
Browser (Vite dev server :5173)          Node (Express :3001)
┌─────────────────────────────┐   /api/feed?channel_id=UC…   ┌──────────────────────┐
│  index.html + src/*.ts      │ ───────────────────────────▶ │  server/feed.ts      │
│  DOMParser, localStorage,   │ ◀─────────────────────────── │  validate + cache    │
│  merge / NEW markers        │      Atom XML (or JSON err)  │  15 min TTL          │
└─────────────────────────────┘                              └──────────┬───────────┘
                                                                        │ fetch (8s timeout, redirects blocked)
                                                                        ▼
                                                          https://www.youtube.com/feeds/videos.xml?channel_id=UC…
```

In production the same Express process also serves the built `dist/` folder and
falls back to `index.html`.

## Setup

```sh
npm install
npm run dev            # client on http://localhost:5173, API on http://localhost:3001
npm run build && npm start   # production: one process serves dist/ + /api on :3001
npm test               # vitest run
```

## Adding channels

The app needs the **channel ID** (`UC…`, 24 characters) or a URL containing one:

- `UCdQHEoT23i8suM6Jg2LfTwg`
- `https://www.youtube.com/channel/UCdQHEoT23i8suM6Jg2LfTwg`
- `https://www.youtube.com/feeds/videos.xml?channel_id=UCdQHEoT23i8suM6Jg2LfTwg`

**Handles (`@name`), `/user/` and `/c/` URLs are not supported.** Resolving a
handle to a channel ID requires scraping YouTube pages or using the YouTube
Data API, and both are out of scope for this app. To find the ID: open the
channel page, view source, and search for `"channelId"` or `channel/UC`.

You can also give a channel a custom label after adding it with **Rename**.

## Behaviours

- **NEW badge:** a video is "new" when its publish time is after your previous
  visit. The marker is computed once on page load and stored only after the
  first successful refresh, so a failed load does not wipe your markers.
- **Auto-refresh:** the page re-fetches all channels every 30 minutes while
  open, and when the tab becomes visible again after 30+ minutes away.
- **Server cache:** `/api/feed` caches upstream responses for 15 minutes
  (`X-Cache: HIT/MISS` header tells you which).
- **Error badges:** channels that failed to load get a red badge in the channel
  list. Errors are never cached, so the next refresh retries.

## Limits

- The feed returns roughly the **15 most recent videos** per channel — this is a
  recent-uploads view, not an archive.
- All data is **local to your browser** (localStorage). No sync, no accounts.
- Clearing site data erases your favourites and the "last visit" marker.

## Security notes

- The endpoint only accepts IDs matching `^UC[\w-]{22}$` and only fetches the
  fixed YouTube feed URL, so the server cannot be used as an open proxy.
- Upstream fetches use `redirect: 'error'` and an 8-second timeout.
- Response bodies are checked to look like an Atom feed before caching.
- The UI builds all DOM with `textContent`/`createElement` — feed data is never
  inserted as HTML, and links must be `https://` with
  `rel="noopener noreferrer"`.
