# Session 2025-11-18 – Crawl Output Refresh

**Objective**: Trim the crawler's console output to one concise line per crawled page while broadening cached seed handling and ensuring hub pages older than 10 minutes are re-downloaded.

## Goals
- Emit a structured per-page summary (URL + fetch source + download ms) and filter out the previous noisy logs.
- Treat cached place/country hub seeds as first-class inputs: reuse cached HTML when present, download only when missing.
- Default hub freshness policy to 10 minutes via `maxAgeHubMs` (surfaced through the CLI) so stale place hubs trigger a new fetch.

## Plan
1. Hook into `PageExecutionService`/CLI adapter to emit `PAGE { ... }` events and render them compactly.
2. Adjust seed handling so cache-backed hubs are enqueued/processed consistently, but missing hubs still download from the network.
3. Plumb a 10-minute `maxAgeHubMs` default through `NewsCrawler` and CLI helpers.
4. Document the behavior, collect any follow-ups, and add regression coverage if practical.

## Notes
- Keep `progressAdapter` responsible for formatting the new per-page output.
- Cached page logs should indicate age/source instead of a download time.
- Update `docs/sessions/SESSIONS_HUB.md` once the session stub is created.

## Status
- Legacy CLI exposes `--seed-from-cache` / `--cached-seed` so cached hubs can be replayed directly from SQLite without re-downloading.
- `maxAgeHubMs` defaults to 10 minutes (600 000 ms) inside both the CLI normalizer and `NewsCrawler`, guaranteeing fresh hub fetches unless explicitly overridden.
- `PageExecutionService` emits `PAGE { ... }` telemetry for cache hits, network fetches, and errors; `progressAdapter` renders each line as the concise per-page summary.

## Links
- [Plan](./PLAN.md) — scope, risks, and test strategy for this session.
- [Working Notes](./WORKING_NOTES.md) — incremental findings + TODO tracking.
