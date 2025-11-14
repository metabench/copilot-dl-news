# Working Notes

## 2025-11-14
- Session initialized to explain the 51-download exit on Guardian crawl.

## 2025-11-19
- Pulled `config.json` + `crawl.js` defaults to confirm the run used `basicArticleDiscovery` on `https://www.theguardian.com` with `concurrency=2` / `maxDownloads=2000` and no extra overrides.
- Inspected `config/priority-config.json` and verified `features.totalPrioritisation: true`, which activates the queue filter path inside `QueueManager.enqueue`.
- Traced the filter logic in `src/crawler/QueueManager.js` (lines 210-270) and its unit tests to confirm any URL classified as `other` is dropped with reason `total-prioritisation-filter`; only `country` or `country-related` URLs survive and have their priority forced negative (higher priority).
- Cross-referenced the most recent Guardian crawl telemetry (51 downloads / 127 visited / saved 51, exit `queue-exhausted` from the 2025-11-13 verification session) to show that the downloader never hit the 2,000 cap.
- Compared against the 2025-11-16 intelligent-crawl diagnostics: once the static `countryHubTargetCount` of ~150 is met, the planner stops generating new work, so after the queue has only `country` items it drains quickly, leading to the 51-download plateau observed here.
