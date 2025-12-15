# 027 — ProgressBar + Telemetry SSE

Objective: prove a production-faithful pipeline for crawl progress UI updates.

Pipeline under test:

- Server: `CrawlTelemetryBridge` emits `crawl:*` telemetry events
- Transport: `TelemetryIntegration` publishes events over SSE as `{ type: 'crawl:telemetry', data: <event> }`
- Client: `EventSource` → `createCrawlDisplayAdapter()` → `ProgressBarControl`

This experiment specifically validates:
- SSR renders the demo controls.
- Client activation runs.
- ProgressBar starts **indeterminate** (unknown total).
- ProgressBar flips to **determinate** once `percentComplete` appears.

## Run

- `node src/ui/lab/experiments/027-progressbar-sse-telemetry/check.js`

## Notes

- SSE runs on a separate local port from the page, so the lab uses `allowOrigin: '*'` on the SSE endpoint.
