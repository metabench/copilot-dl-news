# Working Notes – Test Studio UI E2E (Visual)

- 2026-01-02 — Session created via CLI. Add incremental notes here.

- Debug: Test Studio server failed to start due to nested template literals inside the dashboard HTML string; fixed by removing backticks in the inlined `<script>`.
- Debug: Browser script was failing with `SyntaxError: Invalid or unexpected token` because `\n` escapes were being interpreted by Node while building the HTML template string, resulting in literal newlines inside single-quoted JS string literals; fixed by double-escaping (`\\n`) in [src/ui/server/testStudio/server.js](src/ui/server/testStudio/server.js).
- Validation: UI-driven Puppeteer E2E now passes (headless by default):
	- `npm --prefix "c:\\Users\\james\\Documents\\repos\\copilot-dl-news" run test:by-path -- tests/ui/e2e/test-studio-guardian-1000-rerun.puppeteer.e2e.test.js`
- Note: Console 404s (e.g., missing favicon) are ignored by the test to keep focus on the rerun+ingestion flow.

- Added 10-page crawl coverage:
	- New test: `tests/e2e-features/guardian-10-page-crawl.e2e.test.js`
	- New UI E2E: `tests/ui/e2e/test-studio-guardian-10-rerun.puppeteer.e2e.test.js`
	- Test Studio dashboard now has rerun buttons for 10 + 1000.

- Artifacts:
	- Puppeteer UI E2Es write `rerun-output.txt` + `final.png` to `testlogs/ui-e2e/` (override with `PUPPETEER_OUTPUT_DIR`).

- Executed validations (in this order):
	- `npm --prefix "c:\\Users\\james\\Documents\\repos\\copilot-dl-news" run test:by-path -- tests/e2e-features/guardian-10-page-crawl.e2e.test.js`
	- `PUPPETEER_HEADFUL=0 PUPPETEER_OUTPUT_DIR=testlogs\\ui-e2e npm --prefix "c:\\Users\\james\\Documents\\repos\\copilot-dl-news" run test:by-path -- tests/ui/e2e/test-studio-guardian-10-rerun.puppeteer.e2e.test.js`
	- `PUPPETEER_HEADFUL=0 PUPPETEER_OUTPUT_DIR=testlogs\\ui-e2e npm --prefix "c:\\Users\\james\\Documents\\repos\\copilot-dl-news" run test:by-path -- tests/ui/e2e/test-studio-guardian-1000-rerun.puppeteer.e2e.test.js`

- Download telemetry option (to verify 1000 downloads actually occurred):
	- Helper: `tests/helpers/guardianFixtureCrawl.js` supports `telemetry` capture (per-URL ms/bytes, optional body persistence).
	- Enable via env vars:
		- `GUARDIAN_CRAWL_TELEMETRY=1` (enable summary + JSON output)
		- `GUARDIAN_CRAWL_SAVE_BODIES=1` (persist each fetched page body to disk so storage usage is measurable)
		- `GUARDIAN_CRAWL_LOG_EACH=1` (log one line per download: url/status/ms/bytes)
		- `GUARDIAN_CRAWL_OUTPUT_DIR=<relative>` (default `testlogs/guardian-downloads`)
	- Output:
		- `<outputDir>/download-summary.json` includes `summary` (totalMs, totalBytes, avgBytesPerSecond, savedBytes, entryCount) + `downloads[]` (url/durationMs/bytes/savedPath).

- DB persistence proof (SQLite):
	- New test: `tests/e2e-features/guardian-1000-page-crawl-persists-to-db.e2e.test.js`
	- Validates the *real crawler* writes 1000 distinct `/page/*` responses into the SQLite DB (`http_responses` joined through `urls`).
	- Validation command:
		- `npm run test:by-path -- tests/e2e-features/guardian-1000-page-crawl-persists-to-db.e2e.test.js`
	- Observed output (2026-01-02):
		- `PASS ... (32.5 s)`; crawl summary: `downloads=1004 | visited=1008`
		- Warning: `Force exiting Jest ... --detectOpenHandles` (follow-up filed)

- Fetch under Jest/Test Studio:
	- Root issue: ESM-only `node-fetch` import path breaks under Jest VM without `--experimental-vm-modules`.
	- Fix: `src/crawler/FetchPipeline.js` uses `node-fetch` when available, otherwise falls back to a minimal `http`/`https` fetch (sufficient for the crawler + tests).
	- Validation:
		- `npm run test:by-path -- src/crawler/__tests__/FetchPipeline.test.js src/crawler/__tests__/FetchPipeline.validation.test.js`

- Live crawl setup (manual-only):
	- New test: `tests/e2e-online/live-crawl-persists-to-db.manual.test.js`
	- Defaults to crawling The Guardian front page (`https://www.theguardian.com/international`) when `LIVE_CRAWL_ENABLE=1`.
	- Proves real downloads via SQLite: asserts `http_responses.bytes_downloaded > 0` for the target host.
