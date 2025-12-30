# Plan – Resilient crawl telemetry UI + progress bars

## Objective
Ensure crawl/background-process errors never break telemetry/UI; show compact status + drill-down and progress bars where possible

## Done When
- [x] Telemetry SSE cannot be broken by bad events.
- [x] UI shows compact progress + drill-down even under telemetry problems.
- [x] Focused Jest regression test added and passing.
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- `src/crawler/telemetry/TelemetryIntegration.js`
- `src/ui/server/crawlStatus/CrawlStatusPage.js`
- `src/ui/client/jobsManager.js`
- `src/ui/styles/dataExplorerCss.js`
- `tests/unit/crawler/telemetry/TelemetryIntegration.test.js`

## Risks & Mitigations
- _Note potential risks and how to mitigate them._

## Tests / Validation
- `npm run test:by-path tests/unit/crawler/telemetry/TelemetryIntegration.test.js`
