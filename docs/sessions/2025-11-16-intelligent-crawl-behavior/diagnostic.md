# Intelligent Crawl Exit Diagnostics — 2025-11-16

## Exit Conditions (code references)
| Exit reason | Trigger | Source |
| --- | --- | --- |
| `max-downloads-reached` | `stats.pagesDownloaded >= maxDownloads` during sequential loop or any concurrent worker cycle. | `src/crawler/NewsCrawler.js::_runSequentialLoop` and `src/crawler/WorkerRunner.js` (confirmed via `node tools/dev/js-scan.js --search "maxDownload" --dir src --json`). |
| `queue-exhausted` | Queue returns no work while not paused; all workers unwind. | `src/crawler/NewsCrawler.js::_runSequentialLoop`, `src/crawler/WorkerRunner.js`. |
| `abort-requested` | The crawler receives `requestAbort()` (operator command, telemetry guard, or repeated connection resets). | `Crawler.requestAbort`, `ErrorTracker.handleConnectionReset`, plus guard clauses in the loops above. |
| `failed` | `ErrorTracker.determineOutcomeError` sees fatal startup issues or zero-download progress with errors. | `src/crawler/ErrorTracker.js`. |
| `completed` (fallback) | No other exit path fired before `_finalizeRun`. | `NewsCrawler._finalizeRun`. |

Each exit reason is now captured once via `NewsCrawler._recordExit()` and surfaced in `tools/intelligent-crawl.js` summaries (ASCII + JSON) so every run explains itself without scrolling through logs.

## Observed Behavior with `--max-downloads 100`
- Latest Guardian run (pre-instrumentation) visited 53 pages and saved 9 unique articles before the queue drained. No download cap was hit; the new exit tracking reports `queue-exhausted` with `downloads=53` and `limit=100`.
- The download counter represents **network fetches** only. `PageExecutionService` now increments `pagesDownloaded` exclusively when `fetchPipeline` reports `source === 'network'`, so cache hits and 304 responses never advance the budget.

## Why the Queue Empties Early
1. **Single seed**: Runs begin at `https://www.theguardian.com/` (home page), but the planner immediately pivots into Guardian's `/world` hierarchy. Once those country hub listings are paged through, there are no fresh leads because `useSitemap` is disabled and navigation reseeding is minimal.
2. **Static `countryHubTargetCount`**: The planner stops after ~150 hubs. After we began filtering known 404 hubs out of the queue, those 150 slots fill quickly and leave no work for article harvesting.
3. **Article queue starvation**: Article downloads are opportunistic—once a hub yields 1–2 articles it is retired, even if the `max-downloads` target is unmet. No fallback replays finished hubs or enqueues Guardian topic sections.
4. **No phase two**: When `gapDrivenPrioritization` has no more gaps, `NewsCrawler` considers the job done instead of switching to sitemap/topic harvesting.

## Instrumentation to Use Going Forward
- **CLI summary**: After every run, check the new `Exit reason` line in the ASCII summary (or `runtime.exitSummary` in JSON) to confirm whether the queue drained, the cap was reached, or an abort occurred.
- **Stats snapshot**: `runtime.stats` in the JSON payload now contains `pagesVisited`, `pagesDownloaded`, `articlesFound`, and `articlesSaved`, which means we can capture post-run telemetry without scraping logs.
- **Telemetry milestone**: `NewsCrawler` emits a `crawl-exit:<reason>` milestone, so we can alert if the crawler exits for the wrong reason over several runs.

## Next Diagnostic Steps
1. Capture queue depth over time (add to `buildCrawlReport`) to show when it falls to zero.
2. Cross-check planner output vs. `countryHubTargetCount` to prove that the queue is saturating at the current cap.
3. Rerun with the new exit summary enabled and attach the JSON payload to future session notes for traceability.
