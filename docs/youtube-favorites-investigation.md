# YouTube favorite channels: codebase investigation

## Result

The repository contains no application source files, project configuration, tests, or Git commits. There is no existing codebase to identify a framework, data flow, storage layer, authentication system, API client, or channel/subscription feature in.

A page for favorite public channels is feasible. The smallest design is to save channel IDs as favorites and read each channel's public YouTube feed. A server-side fetch layer is the safest option for a web client because browsers can block cross-origin feed requests. The YouTube Data API is an alternative when the app needs richer metadata or channel lookup, but it needs an API key and has quota limits.

## Repository findings

The repository root contains only `.git/`. `git ls-files` returns no tracked files, and the current `main` branch has no commits.

| Area investigated | Finding |
| --- | --- |
| Structure and framework | None present. No `lib/`, `src/`, `pubspec.yaml`, `package.json`, or equivalent. |
| YouTube fetching | No API client, feed parser, network code, or endpoint configuration. |
| Storage | No database, local persistence, schema, or model definitions. |
| Channel and subscription features | No code exists to add, list, or follow channels. |
| Authentication | No sign-in, user model, OAuth setup, or session storage. |
| Configuration and secrets | No environment files or app configuration. No API key is present. |
| APIs and deployment | No server, routes, deployment files, or CI workflows. |
| Tests | No test files or test configuration. |

This is an assessment of the checked-out repository only. It does not establish whether a separate service or unpublished project exists.

## Data source options

### Channel Atom feeds

YouTube exposes a public Atom feed for a channel at:

`https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID`

The feed includes recent video entries and channel and video identifiers. A client can parse it and show recent additions without a YouTube Data API key or API quota units. The app needs a channel ID. A user can provide a channel URL or ID, or the app can use a separate channel lookup process.

Feeds are a good fit for a personal list and a recent-video page. The feed is not a complete video archive. Do not treat polling frequency, feed retention, or service availability as guaranteed unless YouTube documents a guarantee. Cache results and handle empty, malformed, and unavailable feeds.

Browser applications can encounter cross-origin resource sharing (CORS) restrictions when they request feeds directly. A small backend endpoint can fetch and parse feeds, then return normalized data to the app. A server also enables shared caching and reduces repeated requests. Avoid an unrestricted public proxy. Limit the endpoint to YouTube feed URLs and supported methods.

### YouTube Data API v3

The Data API provides structured channel and video metadata. Common operations include `channels.list` and `videos.list`. These list operations generally have a low quota cost, while `search.list` has a much higher cost. The published default quota allocation has commonly been 10,000 units per project per day, with search requests costing 100 units. Confirm current quota allocations and method costs in Google's documentation and the Cloud Console before implementation because Google can change them.

For this feature, avoid searching on every page load. Resolve channel IDs during setup, then fetch channel uploads or known recent video IDs in batches and cache responses. An API key is needed for public API access. Restrict the key to the required API and server or app identity. Do not commit it to source control. Private user data or access to a user's own subscriptions requires OAuth consent and user authorization; a public favorite list does not.

The API offers stronger metadata and channel discovery than feeds, but it adds credential management, quota monitoring, and possibly a backend. It is not necessary for a basic public-channel aggregator.

## Suggested design

1. Store a favorite as a YouTube channel ID plus display name, optional user label, and date added. Use the channel ID as the stable key. Channel names and handles can change.
2. Fetch each favorite's public feed through a restricted backend endpoint. Parse entries into a common video model with video ID, channel ID, title, published date, and watch URL. Use API metadata only if the product needs fields that the feed does not provide.
3. Merge entries across favorites, sort by published date, and show which channel each video belongs to.
4. Store the user's favorite channel list locally for a single-device, single-user prototype. Add account authentication and a server-side database only if the list must sync across devices or users.
5. Cache feed results. Poll at a moderate interval, such as every 15 to 60 minutes, rather than on every render. This is a design suggestion, not a YouTube service limit. Provide a manual refresh and show the last successful update time.
6. Handle deleted or private videos, feed failures, duplicate entries, and channels that return no new videos. Keep a recent-entry window unless the app needs a full history.

A minimal persistent model could contain:

- `FavoriteChannel`: channel ID, display name, optional custom label, added date.
- `Video`: video ID, channel ID, title, published date, watch URL, optional thumbnail URL.
- `FeedStatus`: channel ID, last checked time, last successful time, and optional error state.

The first two models are enough for a basic page. Feed status helps explain stale or failed updates.

## Feasibility and risks

| Question | Assessment |
| --- | --- |
| Can users maintain a favorite list? | Yes. A local list is enough for a single user. Cross-device sync needs an account and server storage. |
| Can the page show recent uploads? | Yes. Public channel feeds are a low-complexity source. The Data API is an alternative. |
| Is OAuth required? | No, not for public channel uploads and a private-to-the-app favorites list. OAuth is required if the app accesses a user's private YouTube data or official subscription list. |
| Is a backend required? | Not inherently for native clients. For browser clients, a backend feed fetcher is recommended to avoid CORS and to cache requests. A backend is also the right place for an API key that must remain private. |
| Is quota a concern? | Feeds do not use Data API quota units. The Data API can support a modest list if requests are batched and cached. Repeated `search.list` calls can consume quota quickly. |
| What is unknown? | The repository gives no evidence about target platforms, expected user count, hosting, privacy needs, or whether account sync is required. |

## Recommended next step

First establish the app framework, target platforms, and whether favorites need cross-device sync. Then implement a small proof of concept that accepts channel IDs, fetches their Atom feeds through a restricted server endpoint where browser support is needed, and displays merged recent videos. Add the Data API only if feed data or channel lookup proves insufficient.

## Source and verification notes

This report is based on the repository state at investigation time. No application files were available to inspect. The YouTube URL and quota figures above are product/API facts that must be checked against current YouTube documentation before release. No live request to YouTube or Google documentation was made during this repository inspection.
