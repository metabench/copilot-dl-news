# Working Notes — Cached Seed Refactor (2025-11-13)

## 2025-11-13
- Session initialized. QueueManager already tags `processCacheResult` hints but downstream pipeline still ignores them.
- `QueueManager._maybeAttachCacheContext` needs cleanup: `wantsCacheProcessing` flag undefined and enqueue() lost context for meta flags; fix before further work.
- `WorkerRunner` copies cache context but never forwards `processCacheResult`; will need to include new boolean in `processContext`.
- `PageExecutionService` currently short-circuits when fetch source is `cache`, so cached seeds never run discovery/acquisition; need conditional path when `context.processCacheResult` is true.
- `FetchPipeline._tryCache` already supports `context.forceCache`, `cachedPage`, `fallback` metadata but does not respect `processCacheResult` explicitly; queue context should set `allowRevisit` and cached page before fetch.
- `tools/intelligent-crawl.js` / `crawl.js` expose no CLI option to seed from cache; we need a flag that funnels into enqueue metadata (likely via `NewsCrawler` options -> planner/QueueManager meta).
- Updated QueueManager to reintroduce proper evaluation flow and to detect `meta.processCacheResult`/`seedFromCache`, forcing cache contexts (with `processCacheResult` flag) even when `allowRevisit` is true.
- WorkerRunner now propagates `processCacheResult` to PageExecutionService; PageExecutionService skips cache short-circuit only when this flag is absent.
- Added `seedStartFromCache` + `cachedSeedUrls` options to `NewsCrawler` with CLI exposure via `tools/intelligent-crawl.js` flags (`--seed-from-cache`, `--cached-seed`). `_seedInitialRequest` uses new helper to mark seeds with `seedFromCache` metadata.

## 2025-11-13 — Regression Tests
- Added QueueManager tests validating that cached-seed metadata produces `processCacheResult` contexts (even when `allowRevisit` is true) and that cache misses fall back to network processing cleanly.
- Extended `PageExecutionService` tests to exercise cache-fed processing when `context.processCacheResult` is true and to ensure network fallbacks behave when cached seeds cannot hydrate HTML.
- Verified both suites via `npm run test:by-path -- src/crawler/__tests__/queueManager.basic.test.js src/crawler/__tests__/pageExecutionService.test.js` (pass).
