# Working Notes – Fix CrawlTelemetryBridge progress normalization

- 2025-12-14
	- Fixed structural corruption in src/crawler/telemetry/CrawlTelemetryBridge.js (duplicate state init + methods accidentally nested).
	- Normalized progress payloads so emitProgress() can accept:
		- schema-shaped stats: { visited, queued, errors, ... }
		- base crawler stats: { stats: { pagesVisited, pagesDownloaded, articlesFound, errors, ... }, ... }
		- orchestrator stats: { completion, eta, rate, phase, ... }
	- Added `finished` event mapping in connectCrawler():
		- completed -> emitCompleted()
		- failed -> emitFailed()
		- otherwise -> emitStopped() with best-effort reason/stats.
	- Tests:
		- Ran tests/crawler/telemetry/telemetry.test.js (38 passed).
