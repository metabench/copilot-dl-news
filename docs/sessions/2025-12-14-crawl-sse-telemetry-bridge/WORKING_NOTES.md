# Working Notes – Wire Crawler Telemetry into SSE

- 2025-12-14 — Session created via CLI.

## Work completed
- Bridged canonical `TelemetryIntegration` events into the legacy `/events` SSE stream by forwarding each event to `realtime.broadcastTelemetry(...)`.
- Replaced Data Explorer `/api/events` heartbeat-only stub with `TelemetryIntegration.mountSSE(...)`.
- Hardened telemetry batching timers to avoid pinning the Node event loop in tests.
- Ensured in-process crawl API operations auto-connect created crawlers to the crawl server telemetry integration.

## Validation
- Jest: `npm run test:by-path tests/api/crawl-status-page.test.js`
	- Includes a regression test that opens `/events`, triggers `emitProgress(...)`, and asserts the stream delivers an `event: telemetry` payload.
