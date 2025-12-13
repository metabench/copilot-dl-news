# Working Notes – Phase 4 Hub Freshness Control (Fetch Policy)

- 2025-12-12 — Session created via CLI.

## Status snapshot (what’s already implemented)

The core “Hub Freshness Control / Fetch Policy” mechanics are present in code:

- **Policy injection (enqueue time)** — hub-like requests get policy metadata applied before entering the queue:
	- `NewsCrawler.enqueueRequest()` calls `_applyHubFreshnessPolicy(...)` and enqueues the normalized meta.
	- Implementation: `src/crawler/NewsCrawler.js` (`enqueueRequest` + `_applyHubFreshnessPolicy`, around lines ~1185–1310).

- **Policy propagation (queue → context)** — dequeued work items copy meta into the runtime context and optionally attach cached fallback payloads:
	- `QueueManager._maybeAttachCacheContext(...)` reads `item.meta.fetchPolicy`, `meta.maxCacheAgeMs`, `meta.fallbackToCache`, and loads `cachedPage`/`cachedFallback`.
	- Implementation: `src/crawler/QueueManager.js` (fetchPolicy handling begins around line ~738).

- **Policy propagation (context → page processing)** — worker merges the queue-provided context into the process context passed into page execution:
	- `WorkerRunner.run()` copies `fetchPolicy`, `maxCacheAgeMs`, `cachedFallbackMeta`, `cachedHost`, etc. into `processContext`.
	- Implementation: `src/crawler/WorkerRunner.js` (around lines ~188–205).

- **Policy enforcement (FetchPipeline)**
	- `_tryCache(...)` bypasses cache when `fetchPolicy === 'network-first'`.
	- `_performNetworkFetch(...)` can fall back to cached content when `network-first` + `fallbackToCache` and cached content exists.
	- Implementation: `src/crawler/FetchPipeline.js` (cache bypass around line ~284; fallback decision around line ~377).

## Contract: fields and where they live

This is the practical contract the current code implements:

- Queue item metadata (persisted with the queue entry):
	- `meta.fetchPolicy`: string (notably `'network-first'` for hub refresh)
	- `meta.maxCacheAgeMs`: number (cache age cap)
	- `meta.fallbackToCache`: boolean (defaults to true unless explicitly false)

- Runtime context (attached when dequeuing / before fetching):
	- `context.fetchPolicy`
	- `context.maxCacheAgeMs`
	- `context.fallbackToCache`
	- `context.cachedPage` / `context.cachedFallback`
	- `context.cachedFallbackMeta` (includes reason/policy/age metadata)
	- `context.cachedHost`

## Validation evidence (ran locally)

- Focused Jest tests:
	- `src/crawler/__tests__/FetchPipeline.test.js`
	- `src/crawler/__tests__/queueManager.basic.test.js`
	- `src/crawler/__tests__/queue.behaviour.test.js`
	- `tests/crawler/unit/services/HubFreshnessController.test.js`
	- Result: 48 passed / 0 failed.

- CLI smoke (non-network):
	- `node crawl.js availability --output-verbosity terse`
	- Result: prints operations + sequence presets and exits cleanly.

## Potential gap: DB persistence of policy “decision traces”

The crawler does emit queue events (and persists some via `enhancedQueueEvent`), but the SQLite `queue_events` schema currently has no `details`/JSON column to store fetch-policy metadata.

- Schema evidence: `src/db/sqlite/v1/StatementManager.js` defines `_insertQueueEventStmt` with fixed columns only (job_id, ts, action, url_id, depth, host, reason, queue_size, alias, queue_origin, queue_role, queue_depth_bucket).

If we truly want “persist decision traces into queue_events” (as described in the Phase 4 plan text), we likely need one of:

1) Schema change: add `details` (TEXT JSON) to `queue_events` and wire it through adapters.
2) Schema change: add explicit columns (`fetch_policy`, `max_cache_age_ms`, `fallback_to_cache`) to `queue_events`.
3) Alternate persistence: store policy events in the existing telemetry/milestone tables (they already have `details`).

This is deliberately not changed yet in this session to avoid an unplanned DB migration.

## 2025-12-13 — Implemented: mode-gated decision-trace persistence

Goal: persist hub-freshness “decision traces” only when explicitly enabled, to avoid inflating the DB during normal crawls.

Implementation:
- `NewsCrawler._applyHubFreshnessPolicy(...)` now emits a milestone only when:
	- the request is hub-like,
	- the meta is actually changed, and
	- `hubFreshness.persistDecisionTraces === true`.
- The milestone is tagged with `persist: true` so persistence is explicit and opt-in.
- `CrawlerEvents.emitMilestone(...)` persists milestones into SQLite via `enhancedDbAdapter.insertMilestone(...)` only when `milestone.persist === true`.

Data shape:
- Milestone kind: `hub-freshness-decision`
- Details include: url/host/depth, computed `effectiveMaxAge`, `refreshOnStartup`, `fallbackToCacheOnFailure`, plus before/after meta snapshots.

Evidence:
- Jest: `src/crawler/__tests__/queue.behaviour.test.js` includes regression coverage for both:
	- default mode: no persistence
	- enabled mode: persists via `insertMilestone`
