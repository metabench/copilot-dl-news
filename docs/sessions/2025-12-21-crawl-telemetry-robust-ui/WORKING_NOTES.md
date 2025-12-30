# Working Notes – Resilient crawl telemetry UI + progress bars

- 2025-12-21 — Session created via CLI. Add incremental notes here.

- Implemented SSE hardening so unserializable telemetry events (e.g. `toJSON` throws / circular refs) cannot break streaming or history replay.
	- Updated `src/crawler/telemetry/TelemetryIntegration.js` to use safe JSON serialization + fallback `crawl:telemetry:error` event.

- Updated crawl/job UIs to be more informative under errors.
	- `src/ui/server/crawlStatus/CrawlStatusPage.js`: added progress bar column (queue-drain proxy), recent event capture, and drill-down via `<details>`.
	- `src/ui/client/jobsManager.js` + `src/ui/styles/dataExplorerCss.js`: added compact progress bar to job cards.

- Added nested progress-tree rendering for crawl telemetry.
	- `src/ui/server/crawlStatus/CrawlStatusPage.js`: now ingests `crawl:progress-tree:updated` / `crawl:progress-tree:completed` and renders nested bars with depth/child caps + active-path highlight.
	- Progress bar now prefers determinate data from `crawl:progress.total` / `percentComplete` or progress-tree root totals when available.

- Validation
	- `npm run test:by-path tests/unit/crawler/telemetry/TelemetryIntegration.test.js`
