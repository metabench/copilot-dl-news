# Working Notes: Local Crawl Throughput Slice

## 2026-05-10 Kickoff

- User wants renewed focus on local crawls now that internet connectivity is better.
- Desired first slice: make live crawl speed easy to obtain and view, specifically MB/s and documents downloaded/saved per second.
- Existing assets discovered before implementation:
  - `tools/dev/crawl-live.js` already watches `task_events` and computes pages/min, bytes/sec, average page size, ETA, and stall detection from `crawl:url:batch` events.
  - `src/core/crawler/metrics/CrawlerMetricsService.js` already has `pagesPerSecond`, `bytesPerSecond`, and `mbPerSecond` internally.
  - `src/core/crawler/telemetry/CrawlTelemetrySchema.js` already carries `requestsPerSec` and `bytesPerSec` on progress events.
  - `src/ui/server/crawlStatus/CrawlStatusPage.js` and `crawl-status-client.js` already render active job tables and consume job metrics/progress.
- Scope control: implement a compact `/crawl-status` throughput strip only; defer full dashboard/UI planning.

## Evidence Log

- Session continuity search: `node tools/dev/md-scan.js --dir docs/sessions --search "local crawl throughput stats" --json` returned no exact prior session output.
- Skills checked: session-discipline, targeted-testing, instruction-adherence.

## Implementation Notes

- Added explicit throughput aliases in `CrawlerMetricsService`: downloaded docs/sec, saved docs/sec, network MB/s, and saved MB/s, while preserving existing `pagesPerSecond`, `bytesPerSecond`, and `mbPerSecond` fields.
- Extended `CrawlTelemetrySchema.createProgressEvent()` and `CrawlTelemetryBridge` normalization so progress events preserve `saved`, byte totals, and the new throughput fields.
- Replaced `tools/dev/crawl-live.js` with an ASCII, windowed monitor that reports 5s, 1m, and lifetime downloaded docs/sec, saved docs/sec, network MB/s, and saved MB/s.
- `crawl-live` writes `summary.json` and append-only `metrics.ndjson` under `tmp/crawl-runs/<taskId>/` by default; `--no-artifacts` disables it.
- Added a compact `/crawl-status` throughput strip with stable `data-crawl-throughput-stat` selectors. Full dashboard/UI planning remains intentionally deferred.
- Updated `docs/tools/CRAWL-TOOLING.md` with the new local throughput workflow.

## Validation Evidence

- `node --check tools\dev\crawl-live.js` passed.
- Telemetry smoke load passed: `require('./src/core/crawler/metrics/CrawlerMetricsService')`, `require('./src/core/crawler/telemetry/CrawlTelemetrySchema')`, and `require('./src/core/crawler/telemetry/CrawlTelemetryBridge')`.
- `node src\ui\server\crawlStatus\checks\CrawlBatchLauncherControl.check.js` passed and now asserts throughput strip selectors.
- `node src\ui\server\crawlStatus\checks\crawlStatusPage.remoteObservable.check.js` passed.
- `npm run test:by-path tests/api/crawl-status-page.test.js` exited with `LASTEXITCODE=0`.
- `node tools\dev\crawl-live.js --latest --metrics --json --no-follow --no-artifacts` produced JSON with `downloadedDocs`, `savedDocs`, `docsDownloadedPerSec`, `docsSavedPerSec`, `networkMbPerSec`, and `savedMbPerSec` windows.
- `node tools\dev\crawl-live.js --latest --metrics --no-follow --artifacts tmp\crawl-runs-check` wrote `metrics.ndjson` and `summary.json` under the disposable tmp artifact root.
- VS Code diagnostics reported no errors for edited code/check files.
- Started unified app server on alternate port 3109 with `node src\ui\server\unifiedApp\server.js --port 3109`; route check returned `status=200` and `/crawl-status` contained `data-crawl-throughput-strip`.

## UI Validation Note

- The compact strip was structurally render-checked rather than screenshot-reviewed in this slice because the user explicitly deferred the fuller UI implementation plan. Stable screenshot selectors were added so the next UI pass can capture and review it cleanly.

## 2026-05-12 CLI Fail-Fast Follow-Up

- User attempted a local 5-site crawl with metrics; the local UI/API path failed early when the server was absent, but later recovery attempts exposed ambiguous hangs in local server/runtime paths.
- New objective: make crawl CLI tools fail early when prerequisites or child processes fail, avoid buffered/no-output waits, and make metrics concise enough to understand success/failure quickly.
- Scope stays in crawl tooling and wrappers where possible; runtime crawler fixes belong to the crawler implementation layer if a lower-level fetch loop still stalls after CLI guardrails.
- Implemented delegated child supervision in `tools/crawl/run.js`: launch timeout, no-output timeout, live stdout/stderr piping, hard-kill fallback, and skipped watch polling after failed launch.
- Tightened local batch launch failure behavior in `tools/crawl/crawl-batch.js`: no implicit retries, request timeout option, non-retryable `JOB_CONFLICT`/4xx handling, and compact launch summary.
- Condensed final throughput summaries in `tools/crawl/lib/throughput-meter.js` to one line with elapsed/docs/avg/peak/bytes.
- Validation: syntax checks passed for modified crawl CLI files/tests; `npm run test:by-path -- tests/tools/crawl/run.test.js tests/tools/crawl/crawl-batch.test.js tests/tools/crawl/crawl-backend.test.js` passed 73 tests.
- Failure smoke: `node tools\crawl\run.js --local --launch-timeout 10 --no-output-timeout 5 --max-pages 1 bbc.com` failed in 0.1s with local UI preflight `ECONNREFUSED`, `[run] local-launch exit=3`, and concise zero-throughput summary.
