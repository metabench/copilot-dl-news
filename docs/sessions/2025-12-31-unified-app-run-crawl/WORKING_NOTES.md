# Working Notes – Unified App: run crawl + progress

- 2025-12-31 — Session created via CLI. Add incremental notes here.

- 2025-12-31 — Implemented Unified App wiring:
	- Mounted `/shared-remote-obs/*` (static browser scripts).
	- Mounted crawl telemetry endpoints:
		- `/api/crawl-telemetry/events` (SSE)
		- `/api/crawl-telemetry/remote-obs` (remote observable)
		- `/api/crawl-telemetry/history` (JSON snapshot)
	- Mounted crawl API v1 (operations + in-process jobs) under `/api/v1/crawl`.
	- Added Crawl Status router under `/crawl-status` and exposed it in Unified App registry (`/?app=crawl-status`).
	- Added a small “Start crawl (in-process)” form to the Crawl Status page.

- Validations:
	- `node src/ui/server/crawlStatus/checks/crawlStatusPage.remoteObservable.check.js`
	- `npm run test:by-path tests/ui/unifiedApp.registry.test.js`
