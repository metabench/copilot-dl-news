# Follow Ups – Fix CrawlTelemetryBridge progress normalization

- Replace /api/events SSE stub in src/ui/server/dataExplorerServer.js with a real TelemetryIntegration-backed SSE endpoint (or mount TelemetryIntegration.mountSSE on whichever server owns crawls).
- Trace the “real crawl” entrypoint(s) and ensure an orchestrator/crawler is connected to telemetry (TelemetryIntegration.connectCrawler or CrawlTelemetryBridge.connectCrawler).
- Add an integration/E2E test that spins up the relevant server and asserts SSE delivers a `crawl:progress` event for a synthetic crawl.
