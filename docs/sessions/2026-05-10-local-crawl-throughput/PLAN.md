# Plan: Local Crawl Throughput Slice

Objective: Make local crawls expose clear live throughput metrics for downloaded docs/sec, saved docs/sec, network MB/s, and saved MB/s through the existing CLI, telemetry, and compact crawl status surface.

Linked long-term outcome: `docs/sessions/long-term/lt-001-advanced-crawler-ui/`

Done when:
- `crawl-live.js --metrics` reports 5s, 1m, and lifetime windows for docs downloaded/sec, docs saved/sec, network MB/s, and saved MB/s.
- The telemetry/metrics contract has explicit fields for downloaded/saved document and byte rates.
- Each watched local crawl can write replayable summary and NDJSON metrics artifacts.
- `/crawl-status` gets only a compact throughput strip, not a full dashboard redesign.
- Focused smoke/check commands pass and are recorded in `WORKING_NOTES.md`.

Change set:
- `tools/dev/crawl-live.js`
- `src/core/crawler/metrics/CrawlerMetricsService.js`
- `src/core/crawler/telemetry/CrawlTelemetrySchema.js`
- `src/core/crawler/telemetry/CrawlTelemetryBridge.js` if normalization needs aliases
- `src/ui/server/crawlStatus/CrawlStatusPage.js`
- `src/ui/server/crawlStatus/crawl-status-client.js`
- `src/ui/server/crawlStatus/crawl-status-styles.js`
- Focused checks/tests near changed files as needed
- `docs/tools/CRAWL-TOOLING.md`

Risks/assumptions:
- Existing `task_events` may not always include saved-document events, so the CLI may need careful fallbacks from progress snapshots and URL batches.
- MB/s must be derived from trustworthy byte counters where available and clearly degrade to zero/unknown where not.
- The UI change must stay compact because a full UI implementation plan is intentionally deferred.

Tests:
- Smoke-load changed modules with Node.
- Run existing local check scripts for Crawl Status.
- Run targeted Jest only if a nearby suite directly covers the changed contract.

## Refactoring Tasks
- [x] Discovery: trace current metric event shapes and task event persistence.
- [x] Contract: add explicit throughput fields and aliases.
- [x] CLI: implement windowed docs/sec and MB/sec output plus artifacts.
- [x] UI: add compact throughput strip to `/crawl-status`.
- [x] Docs/checks: update tooling docs and run focused validation.
