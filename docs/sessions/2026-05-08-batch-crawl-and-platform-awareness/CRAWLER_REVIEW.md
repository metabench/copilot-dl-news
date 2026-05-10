# Crawler Review — May 2026

Companion to [`PLAN.md`](PLAN.md). Focuses on the in-process crawl path (unified
UI v1 API → `InProcessCrawlJobRegistry` → `createCrawlService` → core crawler)
that the new `tools/crawl/crawl-batch.js` launcher exercises.

## Methodology snapshot

| Aspect | Assessment | Evidence |
|--------|------------|----------|
| Express route layer | **Good.** `asyncHandler` + `mapError` cleanly separate sync validation, async work, and HTTP error shaping. Routes are tiny (`req`/`res` only) and delegate to a dependency-injected registry. | `src/server/crawl-api/v1/express/routes/operations.js` |
| Job runtime boundary | **Good.** `InProcessCrawlJobRegistry` owns lifecycle; routes never touch the crawler directly; `createCrawlService` is injected via factory. | `src/server/crawl-api/v1/core/InProcessCrawlJobRegistry.js` |
| Telemetry seam | **Good in design, weak in surface.** The registry wraps `telemetryIntegration.connectCrawler` to inject `jobId` automatically — the right boundary — but the data never makes it back out through `GET /jobs`. | `wrappedTelemetry` block in registry |
| Concurrency control | **Adequate.** Single-flag (`UI_ALLOW_MULTI_JOBS`) gate keyed by "any job with status === 'running'". Each job spins its own `createCrawlService(...)` so they really are isolated. | `startOperation` 409 path |
| Public API documentation | **Sparse.** `InProcessCrawlJobRegistry` and the operations route have no JSDoc; v1 endpoints had no quick reference (now added: `docs/cli/CRAWL_V1_API.md`). | greps in repo |
| Batch / multi-launch UX | **Now solved.** Was missing; required the user to script ad-hoc shell loops. `crawl-batch.js` adds presets, dry-run, JSON output, retries, preflight. | `tools/crawl/crawl-batch.js`, `tools/crawl/profiles/news-10x1000.json` |

Overall the crawler architecture is in *good* shape: the seams are real, the
DI is honest (no service-locators, no globals), and lifecycle control is
explicit. The gaps are almost entirely at the **surface layer** — telemetry
fan-out and machine-readable docs.

## Concrete gaps & recommendations

### Gap 1 — `GET /jobs` returns no progress metrics  *(High)*

**Symptom.** The Crawl Status UI table shows `Visited 0`, `Downloaded 0`,
`Errors 0` for every job, even when the crawler is producing real output. The
batch launcher's job list is similarly metric-blind.

**Root cause.** `InProcessCrawlJobRegistry.serialize(job)` only emits
`{ id, mode, operationName, startUrl, status, createdAt, startedAt, finishedAt, paused, abortRequested }`.
The crawler's per-page progress reaches `TelemetryIntegration` (via
`connectCrawler`) but is never persisted back onto the job record.

**Recommendation.**
1. In `connectCrawler`'s wrapper, accumulate counters keyed by `jobId`:
   ```js
   { visited, downloaded, errors, queueSize, lastActivityAt, lastUrl }
   ```
   Source the increments from the crawler's existing `events`/`progress`
   callbacks (no new instrumentation required).
2. Surface them through `serialize(job)` as a `metrics` sub-object, so
   `GET /jobs` and `GET /jobs/:jobId` carry live numbers.
3. Have the Crawl Status client read `metrics` first; only fall back to
   `/api/crawl-telemetry/events` SSE for streaming sparkline data.
4. Add `checks/crawl-status-jobs.metrics.check.js` rendering a fake job with
   metrics and asserting the UI cells are populated.

**Effort.** ~1 hour. **Risk.** Low — purely additive; no migration.

### Gap 2 — `historyLimit` may evict a *running* job  *(Medium)*

**Symptom.** Under sustained batch use, when `_jobs.size > historyLimit`, the
registry deletes "the oldest key in iteration order" — which can be a job that
is still in `status: 'running'`. The job's promise keeps running but disappears
from `GET /jobs`, and pause/resume/stop calls return 404.

**Recommendation.** Replace the `Map.keys().next().value` eviction with a scan
that picks the oldest job whose `status` is terminal (`completed` / `failed`).
If no terminal job exists, log a warning and skip eviction (still bounded by
the explicit concurrency cap, so memory growth is finite).

**Effort.** ~15 min. **Risk.** Low.

### Gap 3 — No smoke check for client→server route alignment  *(Medium, partially fixed)*

**Original symptom.** The Crawl Status UI was POSTing to `/api/crawls/start`,
which has not existed for months. Nothing in CI noticed.

**Status.** The form now POSTs to `/api/v1/crawl/operations/:op/start` with a
configurable `apiBasePath`, and the operation dropdown is hydrated from
`/availability`. But there is still no automated guard against the next such
drift.

**Recommendation.** Add `checks/crawl-status.start-endpoint.check.js`:
- Render `CrawlStatusPage` SSR.
- Extract every `fetch(...)` URL embedded in the inline client script.
- Assert each URL path matches a route registered by the unified app
  (a `routesIndex.has(path)` check is enough).

**Effort.** ~30 min. **Risk.** Low.

### Gap 4 — JSDoc / contract docs are sparse on hot files  *(Medium)*

**Symptom.** `InProcessCrawlJobRegistry`, `operations.js` route handlers, and
`crawl-status-client.js` carry no JSDoc on their public functions. Future
agents have to read the body to learn the request/response contract.

**Recommendation.** Add a short JSDoc block on:
- `InProcessCrawlJobRegistry#startOperation` (params, returns, throws/409)
- `InProcessCrawlJobRegistry#serialize` (the field list — and once Gap 1 lands,
  the `metrics` sub-object)
- The exported router factory in `operations.js` (one paragraph: what's mounted
  where, what the error mapping covers)
- `loadOperations` and the form-submit handler in `crawl-status-client.js`

The existing `docs/cli/CRAWL_V1_API.md` (added in this session) doubles as the
external reference.

**Effort.** ~30 min. **Risk.** None.

### Gap 5 — No batch CLI  *(Low — fixed in this session)*

`tools/crawl/crawl-batch.js` + `profiles/news-10x1000.json` now satisfy this.
Registered in `TOOL_REGISTRY` as `batch` with aliases `crawl-batch`,
`batch-crawl`. Documented in `tools/crawl/AGENT.md` and
`docs/cli/CRAWL_V1_API.md`.

## Pattern observations (worth keeping)

- **Async handler + mapError pair.** The pattern in `operations.js` (
  `asyncHandler(async (req, res) => { ... })` for happy path and `mapError(req, res, err)`
  for failures) is clean and consistent. Adopt it for any new v1 routes.
- **Wrap-and-inject telemetry adapters.** The registry wraps
  `telemetryIntegration.connectCrawler` rather than asking callers to remember
  to pass `jobId`. This is the right level for cross-cutting metadata —
  prefer this over middleware mutation.
- **Observable lifecycle with side-effect tear-downs.** The `run$` observable
  returns a list of disposers — readable and matches the existing
  `subscribe`/`complete`/`error` flow used elsewhere in the crawler.
- **Default-overrides composition.** `mergedOverrides = { ...defaults, ...userOverrides, jobId, crawlType }`
  with the trailing pair non-overridable is a nice contract: the registry
  owns identity fields, the user owns tuning fields. Keep this discipline.

## Suggested follow-up issues

| ID | Title | Estimate |
|----|-------|----------|
| F1 | Surface live metrics on `/api/v1/crawl/jobs` (Gap 1) | ~1 h |
| F2 | Evict only terminal jobs from `_jobs` (Gap 2) | 15 min |
| F3 | Add `crawl-status.start-endpoint.check.js` (Gap 3) | 30 min |
| F4 | JSDoc the v1 registry and route exports (Gap 4) | 30 min |

These are intentionally small and independent so each can ship as its own PR
without coordinating with the others.
