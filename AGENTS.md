# AGENTS.md — Architecture and conventions for AI agents

This document is the authoritative, AI-friendly map of the system. It describes components, data flows, public contracts (HTTP and SSE), storage, rate limiting, observability, and testing patterns.

If you implement features that change any contract or behavior described here, you must update this file in the same pull request. See “Maintaining this document” at the end.

Last updated: 2025-09-29

> Operational quick-start steps, guardrails, and testing checklists now live in `RUNBOOK.md`. Roadmap priorities have moved to `ROADMAP.md`. Change history is tracked exclusively in `CHANGELOG.md`.

## Layout: `src/ui/express/server.js`

- **Boot scaffolding (imports & factories).** Sets up child-process runners (`defaultRunner`, `defaultAnalysisRunner`), domain heuristics, and shared utilities before anything touches Express APIs.
- **`createApp(options = {})`.** Central assembly point that:
  - Reads configuration (DB paths, multi-job flag, trace toggles) and installs per-request timing logs.
  - Initializes SSE broadcasters plus in-memory registries for jobs and analysis runs.
  - Provides lazy database helpers (`getDbRW`, `getDbRO`) that ensure schema availability and cache handles.
  - Exposes instrumentation helpers (`startTrace`, `recordJobEvent`, `broadcastProgress`) reused by API and SSR surfaces.
- **Router composition and middleware.** API routers from `src/ui/express/routes/*` are mounted first, followed by SSE endpoints, analysis controls, and legacy inline SSR handlers. Static assets and the 404 page close the stack.
- **Recent domains API extraction.** `createRecentDomainsApiRouter` (in `routes/api.recent-domains.js`) now delegates to `data/recentDomains.js`, replacing the inline `/api/recent-domains` handler with a reusable data helper.
- **Queues SSR router.** `createQueuesSsrRouter` (in `routes/ssr.queues.js`) renders `/queues`, `/queues/ssr`, `/queues/latest`, and `/queues/:id/ssr` via `data/queues.js` plus the view helpers under `views/`. Pagination links, filters, and navigation are handled entirely within the router/view pair.
- **Gazetteer summary API extraction.** `createGazetteerApiRouter` (in `routes/api.gazetteer.js`) exposes `/api/gazetteer/summary` using a read-only DB handle, returning counts for countries, regions, cities, names, and sources.
- **Crawler lifecycle management.** Helper closures inside `createApp` supervise spawned crawlers: guarding concurrent starts, wiring stdout/stderr to SSE, persisting queue/problem/milestone rows, and handling graceful stop/pause/resume.
- **Module exports & CLI shim.** The file exports `createApp` and, when executed directly, boots an HTTP server that chooses an available port unless `PORT` is provided.

## Incremental refactor guidance

To shrink `server.js`, refactor one route or feature at a time:

1. **Extract data helpers.** Move inline SQL into modules under `src/ui/express/data/`, accepting explicit DB handles supplied by `getDbRO`/`getDbRW`.
2. **Create focused routers.** Build router factories in `src/ui/express/routes/` that accept dependencies (such as `{ urlsDbPath, startTrace, renderNav }`) and encapsulate request handling.
3. **Relocate HTML generation.** Replace raw template strings with view helpers collocated with the new routers (for example `src/ui/express/views/`), keeping the output deterministic for SSR tests.
4. **Wire the router in `server.js`.** Import the new factory, mount it alongside related routes, and remove the legacy handler after parity tests pass.
5. **Add or extend tests.** Cover the new data helpers and routers via Jest suites (`ui/__tests__/` or `src/ui/express/__tests__/`) before deleting the inlined code.

Repeat this cycle for each SSR surface (queues, problems, milestones, gazetteer pages, URL inspectors) to steadily migrate HTML and SQL out of the main server module.

## Key files & roles

| File | Responsibility |
| :--- | :--- |
| `src/ui/express/server.js` | Canonical Express server: spawns crawls, serves APIs/SSE, renders SSR pages. |
| `src/ui/express/services/navigation.js` | Central registry for global nav links plus `renderNav` HTML helper. |
| `src/ui/express/routes/api.navigation.js` | Express router exposing `/api/navigation/*` endpoints for nav metadata/markup. |
| `src/ui/express/routes/api.recent-domains.js` | Express router providing `/api/recent-domains`, wired for graceful fallbacks when SQLite modules are unavailable. |
| `src/ui/express/data/recentDomains.js` | Data helper that executes the windowed recent-domain query and returns the structured payload reused by tests/UI. |
| `src/ui/public/global-nav.js` | Client-side enhancer that replaces `[data-global-nav]` placeholders with rendered nav markup. |
| `src/ui/express/services/buildArgs.js` | Translates `POST /api/crawl` bodies into crawler CLI args (crawl type, planner flags, pacing). |
| `src/crawl.js` | Crawler core: fetches, parses, respects pacing/backoff, emits structured stdout frames. |
| `src/db.js` | SQLite schema and helpers for articles, queues, problems, and milestones. |
| `src/analysis/page-analyzer.js` | Pure page analysis orchestrator: computes article findings, hubs, and deep insights. |
| `src/analysis/place-extraction.js` | Gazetteer matcher builder and shared place/context helpers used across analysis passes. |
| `src/analysis/deep-analyzer.js` | Pluggable deep analysis heuristics (key phrases, sentiment scaffolding). |
| `AGENTS.md` | Living contract for architecture, APIs, events, persistence, and observability. |



## Components at a glance

- UI server (Express)
  - File: `src/ui/express/server.js`
  - Serves the GUI (static HTML), HTTP APIs, and Server-Sent Events (SSE).
  - Spawns one or more crawler child processes and streams their structured output to clients.
  - Provides a “Perform Analysis” control on the crawler homepage that posts to `/api/analysis/start` and surfaces the run link inline for quick navigation.
  - Hosts the navigation service (`renderNav`) and exposes `/api/navigation/*` endpoints for shared nav markup.
  - Exposes observability endpoints and read-only DB-backed pages/APIs.
  - GET `/queues/latest` — Redirects to the most recent queue (by `ended_at` or `started_at` when running). This supports a default “latest queue first” navigation.
  - GET `/queues/:id/ssr` — Shows a single queue’s `queue_events` with filters and cursor-based pagination: `action` (enqueued|dequeued|retry|drop), `limit` (max 500), `before` (older), `after` (newer). Always renders newest-first and includes inline pager controls (Latest, ← Newer, Older →) plus navigation links to newer/older queues.

- Server-rendered analysis pages (SSR)
  - GET `/analysis/ssr` — Lists recent analysis runs with status, stage, durations, and summary counters. Links to detail pages and progressively enhances with client-side fetch to refresh the list.
  - GET `/analysis/:id/ssr` — Shows a specific analysis run with its latest summary and event log (newest-first). Includes a progressive enhancement script that polls `/api/analysis/:id` every ~5s for live updates when the run is still active.

- Observability and data APIs (non-exhaustive)
  - GET `/health` — `{ running, queueSize, lastProgressAt, paused }`.
  - GET `/metrics` — Prometheus text format (running, paused, counters, and rates).
  - GET `/api/system-health` — DB size, free disk, process memory/CPU, SQLite WAL mode (best effort).
  - GET `/api/urls` — List/article URLs with filters and keyset pagination. Supports additional filters on combined analysis from the latest fetch:
    - Query params (subset): `combinedHint` (`article|nav|other`), `minCombinedConfidence` (0–1 or 0–100). Back-compat alias `minConfidence` is also accepted.
    - Response items (when `details=1`): include `combined_hint` and `combined_confidence` (0–1).
  - GET `/api/url-details` — URL row + latest article/fetches.
  - GET `/api/recent-errors` — Aggregated recent errors.
  - Gazetteer SSR pages/APIs under `/gazetteer` and `/api/gazetteer/*`.
  - GET `/api/problems` — Read-only list of persisted problems with filters and keyset pagination.
    - Query params: `job` (job id), `kind`, `scope`, `limit` (default 100, max 500), `before` (older, by id), `after` (newer, by id).
    - Response: `{ items: [{ id, ts, kind, scope, target, message, details, jobId }], cursors?: { nextBefore, prevAfter } }`.
  - Server-rendered problems history: `GET /problems/ssr` — Newest-first list with filters (`job`, `kind`, `scope`) and inline pager (Latest, ← Newer, Older →).
  - GET `/api/crawl-types` — Returns available crawl types from SQLite (best-effort; falls back to built-ins). Response: `{ items: [{ name, description, declaration }] }` where `declaration` is a JSON object shaping flags like `useSitemap` and `sitemapOnly`.


## SSE event schema (unified stream)

- Event: `log`
  - Payload: `{ stream: 'server'|'stdout'|'stderr', line: string, jobId: string }`
  - Server drops/merges overly chatty logs and truncates very long lines.

- Event: `progress`
  - Payload (baseline):
    - `{ visited, downloaded, found, saved, errors, queueSize, paused, running?, bytes?, jobId }`
  - Optional telemetry (if provided by the crawler):
    - Per-domain limiter state (examples): `{ perHost?: { [host]: { rpm, limitRpm, backoffUntil?, intervalMs? } } }`
    - Aggregate hints: `bytes` for rate derivation, cache metrics, error rate, etc.
    - Cache prioritisation counters: `cacheRateLimitedServed` and `cacheRateLimitedDeferred` enumerate forced-cache hits and deferred URLs when hosts are paused for rate limiting.

- Event: `cache`
  - Payload: shape depends on crawler “CACHE …” lines (used for UI cache indicators).

- Event: `queue`
  - Emitted when the crawler prints a structured line starting with `QUEUE `.
  - Payload: `{ action: 'enqueued'|'dequeued'|'retry'|'drop', url: string, depth?: number, host?: string, reason?: string, queueSize?: number, alias?: string|null, jobId: string }`
  - Examples:
    - `QUEUE {"action":"enqueued","url":"https://example.com/page","depth":1,"host":"example.com","queueSize":12}` → SSE: `event: queue` with same JSON plus `jobId` added by server
    - `QUEUE {"action":"drop","url":"https://example.com/bad","reason":"outside-scope","queueSize":11}`
  - Notes: The crawler emits `QUEUE` lines on key lifecycle points: when a URL is enqueued, dequeued for work, requeued for retry (with reasons like `retriable-error`), and when dropped (reasons include `max-depth`, `off-domain`, `robots-disallow`, `visited`, `duplicate`, `overflow`, `bad-url`, `query-skip`). When query parameters are judged superfluous, `alias` contains the stripped URL candidate recorded by deep URL analysis.

- Event: `problem`
  - Emitted when the crawler prints a structured line starting with `PROBLEM `.
  - Payload: `{ kind: string, scope?: string, target?: string, message?: string, details?: object, jobId: string, ts?: ISOString, severity?: 'info'|'warn' }`
  - Purpose: surface expectation gaps and planner diagnostics when running the intelligent crawl type (formerly referred to as intelligent mode) and optionally in standard crawls too. Examples include missing site hubs, unrecognized URL patterns, or low-confidence classifications.
  - Severity: added (2025-09-24) as a derived field (not persisted as a separate DB column) to help UI styling and future prioritization. Current mapping: `missing-hub -> warn`, `unknown-pattern -> info`, everything else -> `info`.
  - New (2025-09-27): `kind:"connection-reset"` signals consecutive `ECONNRESET` failures from the same host within ~2 minutes; details include the rolling counter, timestamps, and sample URL. The crawler aborts immediately and exits fatal when this fires.
  - Example:
    - `PROBLEM {"kind":"missing-hub","scope":"guardian","target":"/world/france","message":"Country hub not found in sitemap","details":{"slug":"france"}}` → SSE: `event: problem` with same JSON plus `jobId` and derived `severity:"warn"` (server may add an ISO `ts`).

- Event: `milestone`
  - Emitted when the crawler prints a structured line starting with `MILESTONE `.
  - Payload: `{ kind: string, scope?: string, target?: string, message?: string, details?: object, jobId: string, ts?: ISOString }`
  - Purpose: record positive achievements and learned patterns that help navigation or planning (separate from problems). Examples: homepage patterns inferred, hubs seeded, classifier calibrated. The special milestone kind `full-understanding` tracks when the crawler has demonstrated comprehensive knowledge of a site (see Milestones persistence below for the current definition).
  - **Intelligent completion milestone**: The milestone kind `intelligent-completion` is emitted at the end of intelligent crawls with comprehensive summary data. The payload includes structured details covering seeded hubs (counts, samples), coverage metrics (expected vs. achieved percentages), unresolved problems (grouped by kind), and crawl statistics.
  - Notes: The completion of an intelligent crawl is **not** emitted as a milestone by itself; milestones should mark meaningful progress along the way.
  - Examples:
    - `MILESTONE {"kind":"patterns-learned","scope":"guardian","message":"Homepage patterns inferred","details":{"sections":["world","sport"]}}`
    - `MILESTONE {"kind":"full-understanding","scope":"guardian","message":"Country hubs validated","details":{"countriesCovered":192,"missing":3}}`
    - `MILESTONE {"kind":"intelligent-completion","scope":"example.com","message":"Intelligent crawl completed","details":{"outcome":"completed","seededHubs":{"unique":2,"requested":3},"coverage":{"expected":3,"seeded":2,"coveragePct":0.667},"problems":[{"kind":"missing-hub","count":1}],"stats":{"visited":1,"downloaded":1}}}`

- Event: `planner-stage`
  - Emitted when the intelligent planner prints `PLANNER_STAGE {json}` lines to describe stage lifecycle.
  - Payload: `{ stage: string, status: 'started'|'completed'|'failed', sequence: number, ts: ISOString, durationMs?: number, details?: { context?: object, result?: object, error?: object }, jobId: string }`.
  - Purpose: surface fine-grained planner telemetry (bootstrap, pattern inference, country hub discovery, seeding) without overloading `problem` events.
  - Sequence counter increments with each stage for ordering; `durationMs` is present on completed/failed events to highlight slow stages.
  - Example:
    - `PLANNER_STAGE {"stage":"seed-hubs","status":"completed","sequence":3,"durationMs":24,"details":{"context":{"sectionsFromPatterns":5},"result":{"seededCount":12,"sectionHubCount":5}}}`

- Event: `done`
  - Payload: `{ code: number|null, signal: string|null, endedAt: ISOString, jobId: string }`

- Event: `jobs`
  - Payload: `{ count: number, items: Array<{ id, pid, url, startedAt, paused, visited, downloaded, errors, queueSize, lastActivityAt, status }> }`

Notes:
 - The UI server adds `jobId` to structured events. Each run is assigned a unique job id. When multi-jobs are disabled there is still only one active job at a time.
 - The `?job=` param on `/events` filters events to that job id when provided. Untagged events (like `jobs`) are not filtered.
 - The server persists `problem` events to SQLite when writable (see Persistence → Problems below) for later inspection.


## Rate limiting (crawler)

- Per-domain pacing — evenly spaced tokens
  - Each domain has an interval token schedule so requests are spread uniformly over time.
  - Low jitter can be applied (configurable) to avoid lockstep patterns.

- Retry-After aware backoff on 429/5xx
  - Honor `Retry-After` header when present.
  - Otherwise apply escalating blackout/backoff for that host.

- Adaptive ramp-up
  - Gradually increase RPM after successful responses; back off on errors.

- Cache-first queue reprioritization
  - During rate-limit windows the crawler defers network-bound URLs, pulls cached pages forward, and logs cache-priority telemetry so basic/basic-with-sitemap runs keep making progress.

- Telemetry surface
  - Progress frames may include per-host limiter metrics that the UI can render as badges.


## Persistence (SQLite)

- Engine: `better-sqlite3` with WAL enabled.
- Core tables (not exhaustive): `articles`, `fetches`, `links`, `urls`, `domains`, `categories`.
- URL analysis caching: the crawler now persists compact `UrlPolicy` summaries and allow/deny decisions into `urls.analysis`, so enqueue and fetch phases can reuse prior classifications without re-running expensive checks. When `skipQueryUrls` is left on, these cached decisions continue to gate pagination-style query strings before they reach the download queue.
- `latest_fetch` materialized view; indices and triggers maintained in `src/db.js`. Expression index `idx_articles_analysis_progress` (on JSON analysis version) and descending timestamp index `idx_latest_fetch_ts_desc` keep `analyse-pages` runs from scanning/sorting entire tables, cutting memory usage for `analysis-run`.
- The UI server opens the DB read-only for reports when possible; the crawler performs writes.

Queue/job persistence (added):
- Tables created lazily by the UI server when writable DB access is available:
  - `crawl_jobs (id TEXT PRIMARY KEY, url TEXT, args TEXT, pid INTEGER, started_at TEXT, ended_at TEXT, status TEXT)`
  - `queue_events (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT, ts TEXT, action TEXT, url TEXT, depth INTEGER, host TEXT, reason TEXT, queue_size INTEGER)`
  - Indices: `(job_id, ts DESC)`, `action`, `host`
   - Additional indices for large queues: `(job_id, id DESC)` and `(job_id, action, id DESC)` to support keyset pagination by id.
- Write paths:
  - On `POST /api/crawl`: insert `crawl_jobs` row with `status='running'`.
  - On crawler exit: update `crawl_jobs.ended_at` and set `status='done'`.
  - For each `QUEUE {json}` line from the crawler: insert a `queue_events` row with the parsed fields and a server-side timestamp.
- Read paths:
  - `GET /api/queues` and `GET /api/queues/:id/events` (see above).
  - SSR pages `/queues/ssr` and `/queues/:id/ssr` (read-only views).

Analysis runs (offline analysis pipeline):
- Tables created lazily by either the UI server or `analysis-run.js` when writable DB access is available:
  - `analysis_runs (id TEXT PRIMARY KEY, started_at TEXT NOT NULL, ended_at TEXT, status TEXT NOT NULL, stage TEXT, analysis_version INTEGER, page_limit INTEGER, domain_limit INTEGER, skip_pages INTEGER, skip_domains INTEGER, dry_run INTEGER, verbose INTEGER, summary TEXT, last_progress TEXT, error TEXT)`
  - `analysis_run_events (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT, ts TEXT, stage TEXT, message TEXT, details TEXT)`
  - Indices: `analysis_runs` on `(started_at DESC)` and `(status, started_at DESC)`; `analysis_run_events` on `(run_id, ts DESC)`.
- Write paths:
  - `src/tools/analysis-run.js` ensures the schema, inserts a run row at start, updates status/stage/summary as steps complete, and records stage events (including errors). The runner now logs and emits tracker events for the initial database setup phase (`db-setup`) before launching page analysis.
  - The UI server seeds the schema during startup when a writable DB handle is available, enabling read APIs and SSR pages even before the CLI runs.
- Read paths:
  - `GET /api/analysis` and `GET /api/analysis/:id`.
  - SSR pages `/analysis/ssr` and `/analysis/:id/ssr` with progressive enhancement for live updates.

Place hubs (site + topic navigation pages):
- Table `place_hubs` now records `place_kind`, `topic_slug`, `topic_label`, and `topic_kind` alongside the existing host/url fields so downstream consumers can distinguish pure place hubs from place-specific topic hubs.
- `src/tools/analyse-pages.js` classifies nav-like pages where the final path segment matches a gazetteer place slug and the preceding segment denotes a topical section (for example, Guardian `https://www.theguardian.com/sport/somerset`). The detector stores the section slug/label in the new columns and mirrors the information in the `evidence` JSON (`{ topic: { slug, label, kind, source } }`).
- For Guardian-style pages the `topic_kind` resolves to `section` when the article record carries a matching `section` field; otherwise it falls back to `path-segment`. Detection only triggers when the gazetteer already knows the place slug, so adding Somerset to the gazetteer will automatically mark `/sport/somerset` as a place-specific topic hub.
- The crawler’s intelligent planner still seeds hubs optimistically; it now writes `NULL` into the additional columns, letting analysis backfill richer metadata after the first pass.

 Problems (intelligent crawl diagnostics):
 - Table created lazily by the UI server when writable DB access is available:
   - `crawl_problems (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT, ts TEXT, kind TEXT, scope TEXT, target TEXT, message TEXT, details TEXT)`
   - Indices: `(job_id, ts DESC)`, `kind`.
 - Write path:
   - For each `PROBLEM {json}` line from the crawler: insert a `crawl_problems` row, copying fields from the JSON; `ts` is recorded server-side.
    - `connection-reset` problems (see crawler core) record the host that tripped the guard, the rolling reset count, and the time span covered.
 - Read paths:
   - `GET /api/problems` and SSR page `/problems/ssr` (newest-first; filters and cursors).

 Milestones (positive achievements):
 - Table created lazily by the UI server when writable DB access is available:
   - `crawl_milestones (id INTEGER PK AUTOINCREMENT, job_id TEXT, ts TEXT, kind TEXT, scope TEXT, target TEXT, message TEXT, details TEXT)`
   - Indices: `(job_id, ts DESC)`
 - Write path:
   - For each `MILESTONE {json}` line from the crawler: insert a `crawl_milestones` row with server timestamp, copying fields from the JSON.
 - Read path:
    - Server-rendered SSR page `/milestones/ssr` lists newest-first with filters (`job`, `kind`, `scope`) and cursor-based pagination via `before`/`after`.
  - Milestone categories:
    - `patterns-learned`, `seeds-prepared`, `cache-primed`, etc. capture incremental planner progress.
    - `adaptive-hub-seeded` emits when dynamic section/hub discovery schedules a new seed URL mid-run; details carry the URL and discovery reason.
    - `history-path-seeded` tracks adaptive enqueue of year/month archive paths surfaced from article URLs.
    - `cache-priority-hit` fires the first time a rate-limited host forces the crawler to serve a cached page ahead of deferred network work; details include the affected host and current cache counters.
    - `full-understanding` (new): indicates the crawler has identified and validated hub pages for essentially every country on a global news site that is known to expose per-country hubs. **Current definition** (subject to ongoing expansion):
      1. Detect that the target is a global news property with country-level hubs.
      2. Identify URLs for the hub page of (almost) every country worldwide, explicitly tracking any countries missing hubs.
      3. Test each discovered hub URL (e.g., HTTP fetch or classifier validation) to confirm it resolves and is classified as a hub.
      4. Include counts in the milestone details (`countriesCovered`, `missing`, optional `missingList`).
    - Future work may append extra requirements to `full-understanding`; update this section and milestone emitters as the criteria evolve.
    - Analysis-driven milestones (emitted during page analysis) include:
      - `downloads-1k`: reached after 1,000 successful document downloads.
      - `depth2-coverage`: triggered once 10 unique depth-2 pages (from the front page) have been fully analysed.
      - `articles-identified-1k` and `articles-identified-10k`: mark 1,000 and 10,000 identified articles respectively.
    - **Intelligent completion milestone** (new): The fake runner now emits a comprehensive `intelligent-completion` milestone at the end of intelligent crawls. This milestone includes structured details about seeded hubs (unique count, requested count, sample URLs), coverage statistics (expected vs. seeded coverage percentage), unresolved problems (grouped by kind with counts and samples), and basic crawl statistics (visited, downloaded, articles found/saved, errors). The milestone provides a complete summary for dashboards and post-run analysis.
    - Offline awarding: `src/tools/analysis-run.js` reruns page + domain analysis, then inserts any missing prerequisite milestones (`downloads-1k`, `depth2-coverage`, `articles-identified-*`) with `job_id="analysis-run"`. Use the CLI (or `npm run analysis:run`) after large imports/backfills so the UI reflects readiness for wide-history jobs.
    - Wide history tasks (e.g., `wide-download-countries-histories`) should check for prerequisite milestones first — especially `full-understanding`, `depth2-coverage`, and at least `articles-identified-1k` — before scheduling large backfills. The absence of these milestones is the signal that additional crawling/analysis is required.
  - Post-run summary: intelligent crawls may emit additional milestones during execution, but the crawl ending itself is not treated as a milestone.

   Planner stage telemetry:
   - Table `planner_stage_events (id INTEGER PK AUTOINCREMENT, job_id TEXT, ts TEXT, stage TEXT, status TEXT, sequence INTEGER, duration_ms INTEGER, details TEXT)` records every planner stage lifecycle event streamed over SSE.
   - Indices: `(job_id, ts DESC)` for pagination and `(stage, status)` to group per-stage histories.
   - Write path: the UI server persists each `PLANNER_STAGE {}` line with best-effort JSON payload; failures do not impact crawler execution. `details` mirrors the SSE payload (context + result/error snapshots).
   - Read path: future dashboards can query through `NewsDatabase.insertPlannerStageEvent` / direct SQL; no public HTTP endpoint yet.

 Crawl types catalog (new):
 - Table: `crawl_types (id INTEGER PK, name TEXT UNIQUE NOT NULL, description TEXT, declaration TEXT NOT NULL)`
 - Purpose: configure named crawl presets. Declaration is JSON containing flags (e.g., `{ crawlType: 'basic-with-sitemap', useSitemap: true, sitemapOnly: false }`).
 - Seeding: on server start, if table is empty it seeds four types: `basic`, `sitemap-only`, `basic-with-sitemap`, `intelligent`.
  - `intelligent` declaration triggers planner features; the server passes `--crawl-type=intelligent` to the crawler and planner logic keys off that crawl type.
 - API: `GET /api/crawl-types` returns `{ items }` with `declaration` parsed to an object.
 - UI: Adds a "Crawl Type" dropdown; selection sets `crawlType` in `POST /api/crawl` and drives sitemap checkboxes. Back-compat checkbox controls still sent. The legacy UI "Mode" dropdown has been removed in favor of choosing the `intelligent` preset directly.


## Request timing logs (observability)

- The UI server logs duration for every HTTP request after the response finishes, formatted as:
  - `[req] METHOD URL -> STATUS DURATION.ms`
- Purpose: quick visibility into handler latency without enabling additional tracing.
- Notes: This is console-only logging; no API shape changes.


## Multi-crawl readiness and roadmap

Current state (backward-compatible by default):
- Single active job at a time by default. Set `UI_ALLOW_MULTI_JOBS=1` to enable multiple concurrent jobs.
- `/api/crawls` and `jobs` SSE expose a minimal job summary list (count/items).
- `jobId` is attached to structured events and returned from `POST /api/crawl`.
- `/events?job=` filters events when provided; otherwise the stream is unified.
- Control endpoints (`/api/stop`, `/api/pause`, `/api/resume`) accept `jobId`; when multiple jobs are running and `jobId` is omitted, the server returns `400`.

Next steps (recommended evolution):
- Add `/api/crawl/:id/*` controls and `/api/crawls/:id` details.
- Cross-job resource coordination: per-host throttling across jobs and global concurrency caps.
- Persist job history (start/end/summary) for the jobs list.


## Contracts and edge cases (quick reference)

 - Inputs
  - HTTP JSON bodies to `/api/crawl` with crawl options (use `crawlType` to pick presets/planner features).
  - Control endpoints `/api/pause`, `/api/resume`, `/api/stop`.

- Outputs
  - SSE events: `log`, `progress`, `cache`, `done`, `jobs` (see schemas above).
  - Observability endpoints and data APIs (see “Public HTTP API”).

- Error modes
  - If spawn fails: expect an early `done` event; HTTP `POST /api/crawl` still returns `202` if the process was attempted.
  - If logs are too chatty: server may drop/truncate log events; progress continues.
  - If DB is unavailable for read endpoints: most endpoints return a graceful empty payload or `503/500` with message.
  - Fatal initialization issues (for example `db-open-failed` when SQLite cannot be opened) now emit a `problem` event and force the crawler to exit with a non-zero status so the UI can surface the failure.
  - When a crawl finishes without downloading any pages and only accumulates errors, the process exits with code `CRAWL_NO_PROGRESS` to prevent false-positive "success" runs.


## Maintaining this document

- Update the sections above whenever you change HTTP endpoints, SSE payloads, database schema, or crawler lifecycle guarantees.
- Record release history in `CHANGELOG.md`; keep `AGENTS.md` focused on contracts and architecture, not historical notes.
- When extracting inline SSR routes from `server.js`, add a short bullet under “Layout” summarising the new module to help future refactors.