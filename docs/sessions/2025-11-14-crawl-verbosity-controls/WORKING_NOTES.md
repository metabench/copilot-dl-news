# Working Notes – Crawl Verbosity Controls

- 2025-11-14 09:00 — Session initialized. Need to add config + CLI-level verbosity toggle that defaults to extra-terse for the basic crawl.
- 2025-11-14 09:02 — Key touchpoints identified: `config/config.json`, `crawl.js`, `CrawlerEvents`, `PageExecutionService._emitPageLog`.
- 2025-11-14 09:05 — Requirement: default zero-arg crawl should emit `URL downloadMs completed/goal` lines only; richer logs should remain accessible via CLI override.
- 2025-11-14 09:35 — Added `outputVerbosity` handling across `config.json`, `crawl.js` (flags + overrides), and `NewsCrawler` so CLI/config choices propagate end-to-end.
- 2025-11-14 09:55 — Implemented extra-terse formatting inside `PageExecutionService` with running totals plus telemetry suppression in `CrawlerEvents`; added regression test for the new log format.
