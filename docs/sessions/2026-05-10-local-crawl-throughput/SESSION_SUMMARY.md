# Session Summary: Local Crawl Throughput Slice

## Outcome

Implemented the first local crawl throughput slice: live CLI metrics now report downloaded docs/sec, saved docs/sec, network MB/s, and saved MB/s across 5s, 1m, and lifetime windows, with replayable artifacts written under `tmp/crawl-runs/<taskId>/` by default.

## Changed

- Added explicit downloaded/saved throughput aliases to crawler metrics and progress telemetry.
- Replaced `tools/dev/crawl-live.js` with a windowed local crawl monitor and artifact writer.
- Added a compact `/crawl-status` throughput strip with stable data selectors.
- Updated crawl status render checks and crawl tooling docs.

## Validation

- `node --check tools\dev\crawl-live.js`
- Telemetry module smoke load
- `node src\ui\server\crawlStatus\checks\CrawlBatchLauncherControl.check.js`
- `node src\ui\server\crawlStatus\checks\crawlStatusPage.remoteObservable.check.js`
- `npm run test:by-path tests/api/crawl-status-page.test.js` (`LASTEXITCODE=0`)
- One-shot `crawl-live --latest --metrics --json --no-follow --no-artifacts`
- Artifact write smoke with `--artifacts tmp\crawl-runs-check`
- VS Code diagnostics on edited files
- Unified app server started on port 3109; `/crawl-status` returns the new `data-crawl-throughput-strip` marker

## Follow-Up

- Plan the fuller UI pass separately: charted time series, bottleneck diagnosis, per-domain throughput, and screenshot review artifacts.
- Wire saved-byte events deeper into any crawler paths that can currently emit only downloaded-byte totals.
