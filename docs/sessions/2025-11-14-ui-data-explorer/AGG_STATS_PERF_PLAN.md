# Aggregate Stats Performance & Caching Plan

_Date_: 2025-11-14  _Session_: UI Data Explorer

## 1. Purpose
Build a repeatable research project that measures the latency of every low-level aggregate shown in the data explorer, classifies each stat as "query-on-demand" or "precomputed", and defines how cached stats are derived, stored, and surfaced with freshness metadata.

## 2. Aggregate Inventory
| Stat key | View(s) | Source query / tables | Freshness target | Notes |
| --- | --- | --- | --- | --- |
| `urls.total_count` | `/urls` hero card | `urls` table count | < 5 ms | Baseline for pagination summaries. |
| `urls.success_rate_window` | `/urls` filters | `fetches` join `urls`, window filters | < 5 ms | Rolling 24h success % for host filter suggestions. |
| `urls.fetch_frequency_sparkline` | `/urls/:id` | `fetches` bucketed per hour | < 10 ms | Input for `SparklineControl`. |
| `domains.top_hosts_window` | `/domains` cards | `domainSummary.js` (recent joins) | < 5 ms | Already joining articles + fetches. |
| `domains.article_count_last_24h` | `/domains/:host` | `articles` filtered by `host` & `created_at` | < 5 ms | Drives host detail cards. |
| `domains.fetch_error_share` | `/domains/:host` widget | `errors` + `fetches` counts | < 10 ms | Might need join + group by. |
| `crawls.stage_duration_summary` | `/crawls/:id` timeline | `planner_stage_events` aggregations | < 5 ms per job | Scoped by crawl id. |
| `queues.depth_current` | `/queues` cards | `queues.js` query | < 3 ms | Already aggregated view. |
| `queues.throughput_per_min` | `/queues/:role` chart | `queue_events` grouped by minute | < 10 ms | Potentially heavy due to time bucket. |
| `storage.total_bytes` | `/storage` hero cards | `content_storage` sums | < 5 ms | Straight sum over large table. |
| `storage.compression_ratio_topN` | `/storage` table | `compression_stats` join `articles` | < 10 ms | Sorting by savings per article. |
| `errors.daily_host_histogram` | `/errors` chart | `errors` grouped by host/day | < 10 ms | Group by host, date. |
| `gazetteer.country_counts` | `/gazetteer` table | `gazetteerCountry.js` | < 5 ms | Already aggregated table. |

All stats live under a unique `stat_key` so benchmarks and cache records can refer to them uniformly.

### 2.1 Threshold Enforcement
- Pass threshold = median latency ≤ _Freshness target_.
- Warning threshold = 5–10% above the target (flagged as `needs_cache` in reports, even if still fast locally).
- Hard fail threshold = median ≥ 2× target or p95 ≥ 3× target; jest bench will fail and the stat must be cached before UI can rely on it.
- Document row counts + export lineage for each snapshot under `data/perf-snapshots/README.md` so reports can link to the dataset used when capturing timings.

## 3. Measurement & Benchmark Workflow
1. **Harness**: use `scripts/perf/ui-aggregates-bench.js` (Node + `better-sqlite3`) to import each query helper (`urlListingNormalized`, `domainSummary`, etc.) and execute the exact SQL used in production.
2. **Dataset tiers**: run against three SQLite snapshots stored under `data/perf-snapshots/`:
   - `mini` (~10k rows) for quick smoke.
   - `baseline` (~1M fetches / 50k URLs) representing current prod volume.
   - `stress` (~5x baseline) to simulate growth.
3. **Warm-up**: each stat executes once to populate SQLite caches, then runs `N=25` times with timing captured via `process.hrtime.bigint()`.
4. **Metrics recorded**: min/median/p95/avg, rows read, and CPU time if `PRAGMA compile_options` exposes it. Results persisted to `tmp/perf/ui-aggregates-<snapshot>.json`.
5. **Pass criteria**: median latency ≤ 5 ms (or ≤ 10 ms for time-bucketed sparkline/timeline stats). Anything slower is marked `needs_cache`.
6. **Reporting**: script emits markdown + JSON summary referencing `stat_key`, snapshot tier, and recommendation.

## 4. Background Derivation Strategy
- **Table**: create `ui_cached_metrics` (`stat_key TEXT PRIMARY KEY`, `payload JSON NOT NULL`, `generated_at DATETIME NOT NULL`, `source_window TEXT`, `duration_ms INTEGER`, `max_age_ms INTEGER`, `metadata JSON`). Normalized so each stat stores its own payload and metadata; later we can add `expires_at` if needed.
- **Worker**: add `scripts/ui/run-aggregate-worker.js` that:
  1. Loads list of stat definitions (`src/ui/server/services/aggregateStats.js`).
  2. Runs heavy stats sequentially (or per category) on a schedule (e.g., every minute for queues, every 5 minutes for storage) using cadences provided by `config/uiMetrics.json`.
  3. Records execution duration and writes JSON payload + timestamps into `ui_cached_metrics` inside a transaction (capturing `max_age_ms` and optional metadata per stat).
  4. Emits logs for observability (`stat_key`, duration, freshness).
- **Triggering**: Express routes first check `ui_cached_metrics` (via `metricsService`). If a cache entry exists with `generated_at` within the stat’s `max_age`, it is served instantly; otherwise the route falls back to live query and optionally enqueues an asynchronous refresh.
- **Failure handling**: stale caches remain readable. If refresh fails, the worker logs error and leaves previous `generated_at` so the UI can surface “stale since HH:MM”.

## 5. Front-end Integration
- **Server response shape**: for each card/control, include `{ value, generated_at, max_age_ms, stale: boolean }` from the cache/service layer.
- **UI treatment**:
  - Card footer text: `Last updated 12:42 UTC` (only when cached).
  - Tooltip or badge when data is older than `max_age` (e.g., `Stale (updated 24m ago)`).
  - For live queries (fast path), omit the footer but keep layout consistent.
- **HTML performance**: route handler collects all cache reads before rendering (parallel `Promise.all`). Rendering avoids awaiting slow aggregation: either data is cached or the handler responds with an empty shell + stale indicator.
- **Instrumentation**: log total controller render time vs. aggregate fetch time. Add `X-View-Render-ms` header for quick profiling.

## 6. Research Execution Plan
| Step | Description | Owner | Deliverable |
| --- | --- | --- | --- |
| 1 | Implement benchmarking harness + dataset loader | Infra | `scripts/perf/ui-aggregates-bench.js`, perf JSON | 
| 2 | Benchmark every `stat_key` across three snapshots | Infra | `docs/sessions/.../aggregate-perf-report.md` |
| 3 | Classify stats (`direct` vs `cached`) based on pass criteria | UI squad | Updated table + backlog issues |
| 4 | Build `ui_cached_metrics` schema + worker | Backend | Migration + worker script |
| 5 | Integrate cache-aware services into Express routes | UI squad | Updated services + tests |
| 6 | Add UI freshness indicators + stale states | UI squad | Screenshot tests + docs |

## 7. Benchmark Validation Rules
- Use `sqlite3` `EXPLAIN QUERY PLAN` on slow stats to confirm index usage; record plan output alongside timings.
- Measure from Node process (includes IPC + deserialization) to mirror actual server cost.
- CI gate: add a jest test under `tests/perf/uiAggregates.bench.test.js` that fails if median latency exceeds target on the `mini` snapshot, preventing regressions.

## 8. Open Questions
1. Should the worker run inside the Express process (cron) or as a separate long-lived service? (Default: separate `node scripts/ui/run-aggregate-worker.js`).
2. How do we seed `data/perf-snapshots/` without shipping production data? (Plan: anonymized exports via `scripts/db/redact-export.js`).
3. What SLA do operators need for queue stats (sub-second vs 5s)? This affects `max_age_ms` selection.
4. Should cache table live in UI database or separate SQLite file to reduce write contention?

## 9. Next Steps
- **Lock thresholds & snapshot scale**: ratify the 5 ms / 10 ms median targets, document them per `stat_key` (so benchmarks emit PASS/NEEDS_CACHE), and publish the canonical snapshot specs (`mini`, `baseline`, `stress`) under `data/perf-snapshots/README.md` with row counts + seeding instructions (`scripts/db/redact-export.js`).
- **Publish v1 benchmark report**: run `node scripts/perf/ui-aggregates-bench.js --snapshot baseline --json --output docs/sessions/2025-11-14-ui-data-explorer/aggregate-perf-report.json` (after seeding the snapshot) and add a short Markdown summary comparing medians vs thresholds to this session folder. This becomes the reference dataset for future regressions.
- **Choose aggregate worker deployment**: decide whether `scripts/ui/run-aggregate-worker.js` runs as an external service (preferred) or an Express-managed cron job; capture cadence per stat group (queues = 1m, storage/errors = 5m, domains = 10m), config surface (`config/uiMetrics.json`), and failure handling so we can implement the worker + cache schema with clear operational expectations.
- **Reflect decisions in planning doc**: once thresholds + worker model are settled, update `DATA_EXPLORER_PLANNING.md` and this plan to reference the cache workflow and UI freshness cues, ensuring upcoming route work follows the agreed architecture.

## 10. Aggregate Worker Deployment (Decision)
- **Process model**: run `node scripts/ui/run-aggregate-worker.js` as a separate long-lived service (systemd/PM2/Win service) so heavy stats never block the Express UI. The worker reads `config/uiMetrics.json` for cadence + stat enablement.
- **Execution cadence**:
  - Queue depth / throughput stats: every 60 seconds (window = last 5 minutes).
  - Error histograms + crawl milestones: every 5 minutes.
  - Storage/compression summaries + domain aggregates: every 10 minutes.
  - Gazetteer counts: hourly (changes rarely).
- **Lifecycle**: on boot, the worker warms caches sequentially, then enters a scheduler loop (`setInterval` buckets). Each stat execution records `generated_at`, runtime, and payload in `ui_cached_metrics`. Failures log to `logs/ui-metrics.log` and leave the prior cache row intact.
- **Deployment hooks**: add `npm run ui:metrics-worker` script mapping to `node scripts/ui/run-aggregate-worker.js --config config/uiMetrics.json`. Provide `.example` config with DB path + stat toggles so CI can stub smaller cadences.
- **Observability**: worker emits structured logs plus optional `statsd` counters (`ui.metrics.<stat_key>.duration_ms`). Express route middleware reads cache metadata to append `X-UI-Metric-freshness` headers for debugging.
