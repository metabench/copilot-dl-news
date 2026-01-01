# Working Notes – Crawl Observer live breakpoints

- 2025-12-31 — Session created via CLI. Add incremental notes here.

- Context
	- Goal: Extend Crawl Observer task pages with live updates + UI-configurable “stop on …” breakpoints.
	- This is observer-side pausing (polling stops); it does not pause the crawler.

- Implementation (WIP)
	- Updated Crawl Observer task detail page to include:
		- “Live updates + stop conditions” panel (poll toggle, interval, stop-on filters).
		- Client-side polling that requests incremental `task_events` via `sinceSeq`.
		- Pause-on-match behavior: stop polling + highlight/scroll to the triggering event row.
		- Decision-specific configurability:
			- “Stop on every decision” toggle
			- Decision key/outcome contains filters (payload-aware)
			- Optional dedupe: only stop once per decision key + clear seen decisions
	- Added API route for incremental polling:
		- `GET /api/task/:taskId/events?sinceSeq=<n>&limit=<n>`

- Large dataset efficiency
	- Task detail page now uses cursor paging (tail by default) so it won’t try to render huge event sets.
		- Query params: `beforeSeq` (older), `afterSeq` (newer), `limit` (clamped).
	- SSR event query no longer does `SELECT *` (avoids pulling large `payload` blobs just to render the table).
	- Live polling endpoint supports `includePayload=0/1`.
		- Client requests `includePayload=1` only when decision matching needs payload parsing.

- Files
	- `src/ui/server/crawlObserver/server.js`

- Validation
	- `node -e "require('./src/ui/server/crawlObserver/server.js')"` (OK)
	- `node -e "require('./src/ui/server/crawlObserver/server.js')"` after decision controls (OK)
	- `node -e "require('./src/ui/server/crawlObserver/server.js')"` after cursor paging + payload gating (OK)
