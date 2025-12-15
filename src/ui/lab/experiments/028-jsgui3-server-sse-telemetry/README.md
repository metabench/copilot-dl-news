# Lab 028 — jsgui3-server SSE + crawl telemetry → ProgressBar

## Objective
Prove that **`jsgui3-server` can host an SSE endpoint on the same server** (no Express) and stream telemetry events from a **server-side observable**, driving a `ProgressBar` via `createCrawlDisplayAdapter` on the client.

This is a deeper follow-up to Lab 027, focusing specifically on:
- Route mounting on `jsgui3-server` via `server.router.set_route()`
- Clean server lifecycle (start/stop from `server.js`, consumed by `check.js`)
- Deterministic SSE behavior for Puppeteer checks

## Done when
- `/events` is served by `jsgui3-server` directly (no Express)
- Browser connects via `EventSource` and receives telemetry
- UI starts indeterminate, then flips determinate ≥ 20%
- `check.js` passes and the process exits cleanly

## How to run
- `node src/ui/lab/experiments/028-jsgui3-server-sse-telemetry/check.js`

## Notes
This lab intentionally uses a tiny in-process SSE responder (not `TelemetryIntegration.mountSSE`) because that integration currently targets Express. The goal here is to characterize the `jsgui3-server` routing surface and identify improvements that would make SSE/streaming first-class.
