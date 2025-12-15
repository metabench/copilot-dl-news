# Working Notes – Data Explorer UI Review

## WORKING_NOTES

### 2025-12-14 — Reliability parity + DB coverage notes

- Mapped Data Explorer UI query tables (first pass):
	- URL listing uses `urls`, `fetched_urls` (view), `fetches` and joins `latest_fetch`.
	- URL detail uses `urls`, `http_responses`, `content_storage`, `content_analysis`.
	- Domain listing uses `urls`.
	- Domain detail uses `urls`, `http_responses`, `content_storage`, `content_analysis`.
	- Crawls uses `crawl_jobs`, `crawl_types` (+ join to `urls`).
	- Errors uses `errors`.
	- Config uses `crawler_settings`.
	- Classifications uses `classification_types`, `content_analysis`, `content_storage`, `http_responses`, `urls`.

- Implemented reliability parity for Data Explorer server:
	- Added `/health` endpoint for deterministic startup checks.
	- Added `--check` flag support using shared `serverStartupCheck` helper.

- Validation evidence:
	- `node src/ui/server/checks/dataExplorer.check.js` now also runs `dataExplorerServer.js --check` on a free port.
	- Jest: `npm run test:by-path tests/ui/server/dataExplorerServer.test.js` passed (includes new `/health` test).

- 2025-12-14 — Session created via CLI. Add incremental notes here.
