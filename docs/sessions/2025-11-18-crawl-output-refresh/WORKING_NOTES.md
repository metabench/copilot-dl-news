# Working Notes — 2025-11-18 Crawl Output Refresh

## Context Snapshot
- CLI output still streams PROGRESS payloads and ad-hoc console logs per link discovery.
- Cached seed flows exist (`seedStartFromCache`, `cachedSeedUrls`) but need to guarantee cache reuse + new downloads for uncached hubs.
- Hub freshness currently depends on `maxAgeHubMs`, which defaults to `undefined`.

## Open Tasks
- [x] Emit compact `PAGE` events with download time and cache metadata. (`PageExecutionService` now calls `_emitPageLog`; `progressAdapter` renders the JSON line.)
- [x] Remove/silence the noisy "Found X links" log. (Console interception now ignores the legacy CACHE/link chatter unless `--verbose` is set.)
- [x] Ensure cached seeds route through ArticleCache while missing hubs queue for download. (Legacy CLI exposes `--seed-from-cache`/`--cached-seed` and preserves `seedFromCache` metadata end-to-end.)
- [x] Default hub freshness to 10 minutes. (`NewsCrawler` + CLI default `maxAgeHubMs` to 600 000 ms, still overridable.)
- [x] Capture doc/test updates. (New PLAN, working notes, AGENTS pointer, and Jest coverage for PAGE logs + CLI parsing.)

## Findings / Ideas
- `PageExecutionService` already has `fetchMeta.downloadMs`; ideal place to emit page summaries post-processing.
- `progressAdapter` is the right interception point to render `PAGE` events nicely without affecting other logs.
- `tools/intelligent-crawl.js` is the highest-level entry point to set maxAge defaults for operators.

## Logistics
- [x] Plan captured in `PLAN.md`; keep it in sync as scope evolves.
