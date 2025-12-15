# Working Notes – Crawl server live crawl status

- 2025-12-14 — Session created via CLI. Add incremental notes here.

- Identified the crawl server as the standalone API server at `src/api/server.js`.
- Implemented server-hosted live status surfaces:
	- Mounted the legacy SSE endpoint (`/events`) via `createEventsRouter` using the existing `RealtimeBroadcaster`.
	- Added `GET /crawl-status` HTML page that consumes `/api/crawls` snapshots + `/events` live updates.
- Validation:
	- `npm run test:by-path tests/api/crawl-status-page.test.js`

Notes:
- The status page is intentionally minimal and dependency-free (no jsgui3 yet).
- Canonical `TelemetryIntegration` is not yet bridged into `RealtimeBroadcaster` (follow-up).
