# Plan – Wire Crawler Telemetry into SSE

## Objective
Bridge canonical crawler telemetry (TelemetryIntegration) into /events and data explorer SSE, with regression tests.

## Done When
- [x] Canonical crawler telemetry is bridged into crawl server `/events`.
- [x] Data Explorer `/api/events` is backed by canonical telemetry (not heartbeat-only).
- [x] Regression test proves bridged telemetry appears on `/events`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md` (esp. wiring real crawl entrypoints).

## Change Set (initial sketch)
- `src/api/server.js`
- `src/ui/server/dataExplorerServer.js`
- `src/crawler/telemetry/CrawlTelemetryBridge.js`
- `tests/api/crawl-status-page.test.js`

## Risks & Mitigations
- **Risk**: long-lived timers / streams keep Jest alive → **Mitigation**: `unref()` batching timers; always `destroy()` SSE response in tests.
- **Risk**: payload shape drift between legacy broadcaster and canonical telemetry → **Mitigation**: assert both `event` and `data.type` conventions in regression tests.

## Tests / Validation
- `tests/api/crawl-status-page.test.js`
