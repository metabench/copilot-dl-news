# Follow Ups – Crawl server live crawl status

- Wire canonical telemetry into the crawl server:
	- Decide whether `/events` should emit a new event type (e.g. `crawl-telemetry`) or reuse `telemetry` with a consistent payload envelope.
	- Connect `TelemetryIntegration` multicast observable to `RealtimeBroadcaster.getBroadcastTelemetry()`.
- Add a small check script (non-server) that validates `/crawl-status` HTML structure and the `/events` headers without hanging.
