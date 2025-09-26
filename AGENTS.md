# AGENTS.md — Architecture and conventions for AI agents

This document is the authoritative, AI-friendly map of the system. It describes components, data flows, public contracts (HTTP and SSE), storage, rate limiting, observability, and testing patterns.

If you implement features that change any contract or behavior described here, you must update this file in the same pull request. See “Keep this doc up to date” at the end.

Last updated: 2025-09-24


## Agent TL;DR

- **Current focus:** Keep crawl orchestration centered on named `crawlType` presets (especially `intelligent`).
- **If blocked:** Leave a short note in the roadmap table below with a link to your branch or draft PR so the next agent can pick it up.
- **Definition of done this week:** Docs and tests match the crawler CLI flags; run a fast smoke test with `UI_FAKE_RUNNER=1` before handing off.


## Quick start for agents

- Install dependencies once per checkout: `npm install`.
- Start the UI server from the project root when needed: `node src/ui/express/server.js`.
- The server auto-selects an available high-numbered port (41000+ range by default); watch the `GUI server listening ...` log or set `PORT` to override.
- Trigger a deterministic crawl preview (no network) by posting to `POST /api/crawl` with `UI_FAKE_RUNNER=1`.
- Run a focused Jest suite: `npm test -- --runTestsByPath ui/__tests__/server.test.js`. For the full suite, drop the `--runTestsByPath` flag.
- Refresh analysis + milestone prerequisites: `npm run analysis:run` (reuses `analysis-run.js`).
- Golden rule: if you change an HTTP, SSE, or CLI contract, update the relevant section in this file and add a single-line changelog entry.


## Key files & roles

| File | Responsibility |
| :--- | :--- |
| `src/ui/express/server.js` | Canonical Express server: spawns crawls, serves APIs/SSE, renders SSR pages. |
| `src/ui/express/services/buildArgs.js` | Translates `POST /api/crawl` bodies into crawler CLI args (crawl type, planner flags, pacing). |
| `src/crawl.js` | Crawler core: fetches, parses, respects pacing/backoff, emits structured stdout frames. |
| `src/db.js` | SQLite schema and helpers for articles, queues, problems, and milestones. |
| `src/analysis/page-analyzer.js` | Pure page analysis orchestrator: computes article findings, hubs, and deep insights. |
| `src/analysis/place-extraction.js` | Gazetteer matcher builder and shared place/context helpers used across analysis passes. |
| `src/analysis/deep-analyzer.js` | Pluggable deep analysis heuristics (key phrases, sentiment scaffolding). |
| `AGENTS.md` | Living contract for architecture, APIs, events, persistence, and observability. |


## Guardrails & gotchas

- Deterministic tests expect `UI_FAKE_RUNNER=1`; without it, suites may hang waiting for real network traffic.
- `ui/server.js` is a legacy shim; keep all new Express logic in `src/ui/express/server.js`.
- Keep the changelog lean: fold related edits into a single dated bullet instead of adding multiple entries per day.
- SQLite writes happen in the crawler; when running locally, avoid deleting the DB while a job is active to prevent `SQLITE_BUSY` issues.


## Components at a glance

- UI server (Express)
  - File: `src/ui/express/server.js`
  - Serves the GUI (static HTML), HTTP APIs, and Server-Sent Events (SSE).
  - Spawns one or more crawler child processes and streams their structured output to clients.
  - Provides a “Perform Analysis” control on the crawler homepage that posts to `/api/analysis/start` and surfaces the run link inline for quick navigation.
  - Exposes observability endpoints and read-only DB-backed pages/APIs.

- Crawler core
  - File: `src/crawl.js`
  - Fetches pages, parses articles, respects robots/sitemaps, writes to SQLite, and emits structured progress frames (stdout lines).
  - Implements per-domain pacing and backoff logic (429-aware) with interval token release.
  - URL policy heuristics (`src/crawler/urlPolicy.js`) classify query strings (essential vs superfluous) and propose stripped guesses for obvious tracking parameters.
  - Deep URL analysis (`src/crawler/deepUrlAnalysis.js`) checks guessed URLs against the database, records alias mappings, and annotates skip reasons for superfluous query URLs.

- Database layer
  - File: `src/db.js`
  - SQLite (better-sqlite3) schema, migrations, triggers, and helpers for articles, fetches, links, urls, domains, categories; `latest_fetch` view.

- Analysis modules
  - File: `src/analysis/*`
  - Pure analysis orchestrators and helpers for page/article analysis, place extraction, and deep analysis heuristics.

- Analysis pipeline
  - Files: `src/tools/analyse-pages.js` (runner), `src/analysis/page-analyzer.js` (core logic), `src/analysis/place-extraction.js`, `src/analysis/deep-analyzer.js`.
  - Purpose: iterate pending articles, compute analysis findings, run deep heuristics, and persist hubs/places via the orchestrator.
  - Notes: `analysis.meta.deepAnalysis` now carries optional key-phrase/sentiment scaffolding for downstream enrichment; consumers should treat it as best-effort metadata.

- GUI (static)
  - Served from: `src/ui/express/public/` (HTML/JS/CSS) via the Express server.
  - Subscribes to SSE channels to render logs, progress, jobs, and health.

- Tests (Jest + raw HTTP)
  - Folder: `ui/__tests__/` (spawns the UI server on a random port and asserts HTTP/SSE behavior).


## How things talk (data flow)

1) A crawl is started via `POST /api/crawl` (on the UI server). The server spawns a child process (`node src/crawl.js ...`).
2) The crawler prints structured lines (e.g., `PROGRESS {json}`) and other logs. The server parses/relays these as SSE events.
3) Clients connect to `GET /events` for a unified SSE stream. The UI renders progress, logs, and a minimal jobs list.
4) Persistence uses SQLite via `src/db.js`. The crawler writes; the server offers read-only APIs and pages over the same DB file.


## Public HTTP API

- POST `/api/crawl`
  - Starts a crawl. By default only a single active run is allowed; set env `UI_ALLOW_MULTI_JOBS=1` to enable multiple concurrent runs.
  - Body (JSON) — key fields (see `src/ui/express/services/buildArgs.js` for the full mapping):

    | Field | Type | Required | Notes |
    | :--- | :--- | :--- | :--- |
    | `startUrl` | string | Yes | Seed URL for the crawl. Defaults to the Guardian homepage when omitted. |
    | `crawlType` | string | No | One of `basic`, `sitemap-only`, `basic-with-sitemap`, `intelligent`. Drives derived CLI flags (sitemap + planner). |
    | `depth`, `maxPages` | integer | No | Crawl depth/page caps (`--depth`, `--max-pages`). `maxPages` also sets `--sitemap-max`. |
    | `useSitemap`, `sitemapOnly` | boolean | No | Back-compat toggles. Overridden by `crawlType` presets. |
    | `concurrency`, `maxQueue` | integer | No | Worker parallelism and in-memory queue cap. |
    | `requestTimeoutMs` | integer | No | Per-request timeout forwarded as `--request-timeout-ms`. |
    | `fastStart`, `preferCache`, `slow` | boolean | No | Feature flags: skip heavy DB sampling, bias toward cached fetches, throttle pacing respectively. |
  | `allowQueryUrls` | boolean | No | When true, forwards `--allow-query-urls` to the crawler to permit query-string URLs. Default (omitted) keeps the query-skip policy enabled while investigation logic is built out. |
    | `pacerJitterMinMs`, `pacerJitterMaxMs` | integer | No | Low/high jitter bounds for token pacing. |
    | `dbPath` | string | No | Override SQLite path (`--db`). |
    | `refetchIfOlderThan` / `maxAge` | string | No | Global freshness window (e.g., `6h`, `7d`). |
    | `refetchArticleIfOlderThan`, `refetchHubIfOlderThan` | string | No | Type-specific freshness windows for articles vs. hub/navigation pages. |
    | `hubMaxPages`, `hubMaxDays`, `intMaxSeeds`, `intTargetHosts`, `plannerVerbosity` | mixed | No | Intelligent planner extras; forwarded only when the crawl type resolves to `intelligent`. |

  - Field `mode` is no longer part of the public request schema. Use `crawlType: "intelligent"` to activate planner features; any `mode` key in the body is ignored.
  - Response: `202 Accepted` with `{ pid, args, jobId, stage, durationMs }`.
    - `stage` starts as `'preparing'` and flips to `'running'` after the first `PROGRESS` frame.
    - `durationMs` is a server-measured float (milliseconds) covering argument building and child spawn up to the HTTP response; useful for latency assertions.
  - Error: `409 Conflict` if a crawl is already running and multi-jobs are disabled.

- POST `/api/stop`
  - Attempts graceful stop; escalates if child doesn’t exit quickly.
  - Params: `jobId` (JSON body or query). Required when multiple jobs are running; optional otherwise.
  - Response: `{ stopped: boolean, escalatesInMs? }`.

- POST `/api/pause` and `/api/resume`
  - Sends `PAUSE`/`RESUME` commands to the crawler via stdin. Progress frames include `paused` state.
  - Params: `jobId` (JSON body or query). Required when multiple jobs are running; optional otherwise.

- POST `/api/crawls/:id/stop`, `/api/crawls/:id/pause`, `/api/crawls/:id/resume`
  - Job-scoped control endpoints equivalent to the legacy routes above, but with the job id in the path.
  - `stop` response: typically `202 Accepted` with `{ stopped: true, escalatesInMs }` (escalates to SIGKILL after ~800ms if needed).
  - `pause`/`resume` response: `200 OK` with `{ ok: true, paused: boolean }` when stdin is available; `500` if stdin unavailable.
  - Errors: `400` for invalid id; `404` when the job is not found.
  - Examples:
    - `POST /api/crawls/job-123/stop` → `202 { "stopped": true, "escalatesInMs": 800 }`
    - `POST /api/crawls/job-123/pause` → `200 { "ok": true, "paused": true }`
    - `POST /api/crawls/job-123/resume` → `200 { "ok": true, "paused": false }`

- GET `/api/crawls`
  - Returns a minimal snapshot of ongoing crawls (currently a single active job):
  - `{ count, items: [{ id, pid, url, startedAt, paused, visited, downloaded, errors, queueSize, lastActivityAt, status }] }`.

- GET `/api/crawls/:id`
  - Returns a detailed snapshot of a specific crawl job (in-memory; history persistence TBD):
  - Success: `200 OK` with
    - `{ id, pid, args, startUrl, startedAt, endedAt, status, paused, lastActivityAt, metrics: { visited, downloaded, found, saved, errors, queueSize, requestsPerSec, downloadsPerSec, errorRatePerMin, bytesPerSec }, lastProgress }`
  - Errors:
    - `400 Bad Request` for invalid id
    - `404 Not Found` if the job is not in memory (e.g., finished and evicted)
  - Example:
    - `{ "id": "job-123", "pid": 4242, "args": ["src/crawl.js","https://example.com"], "startUrl": "https://example.com", "startedAt": "2025-09-22T10:00:00.000Z", "endedAt": null, "status": "running", "paused": false, "lastActivityAt": "2025-09-22T10:00:03.500Z", "metrics": { "visited": 10, "downloaded": 2, "found": 7, "saved": 2, "errors": 0, "queueSize": 5, "requestsPerSec": 3.1, "downloadsPerSec": 0.6, "errorRatePerMin": 0, "bytesPerSec": 125000 }, "lastProgress": { "visited": 10, "downloaded": 2, "found": 7, "saved": 2, "errors": 0, "queueSize": 5, "paused": false } }`

- GET `/events`
  - Server-Sent Events stream (see “SSE event schema” below).
  - Query params:
    - `logs=0|1` (default 1) — include log events or not.
    - `job=<id>` — when provided, only events tagged with this job id are delivered; untagged events (e.g., `jobs`) are still broadcast to all.
  - On connect, the server emits a seeded log line and also seeds one snapshot `progress` frame per currently running job so the UI shows immediate activity. When a job has already exited but is still cached in memory, the server now also replays a single `done` event to the new client so terminal state isn’t missed.

- GET `/api/queues`
  - Returns a list of recent/active crawl jobs with queue event counts (best-effort; requires SQLite available):
  - Query: `limit` (default 50, max 200)
  - Response: `{ total, items: [{ id, url, pid, startedAt, endedAt, status, events, lastEventAt }] }`

- GET `/api/queues/:id/events`
  - Returns recent queue events for a given job id; supports simple filtering:
  - Query: `limit` (default 200, max 500), `action` (optional: enqueued|dequeued|retry|drop), `before` (optional event id for keyset pagination to older events), `after` (optional event id to page to newer events).
  - Response: `{ job: { id, url, pid, startedAt, endedAt, status }, items: [{ id, ts, action, url, depth, host, reason, queueSize }], cursors?: { nextBefore, prevAfter } }`
  - Notes: For very large queues, use `before` and `limit` to walk older pages efficiently. Results are always returned newest-first.
  - Errors: `400` invalid id; `404` not found.

- GET `/api/analysis`
  - Returns recent analysis runs tracked by the offline analysis pipeline (`analysis-run.js`).
  - Query params: `limit` (default 50, max 200), `offset` (default 0).
  - Response: `{ total, items: [{ id, status, stage, startedAt, endedAt, durationMs, analysisVersion, pageLimit, domainLimit, skipPages, skipDomains, dryRun, verbose, summary, lastProgress, error }] }`.
  - Behavior when SQLite is read-only/unavailable: returns `{ total: 0, items: [] }`.

- GET `/api/analysis/:id`
  - Returns detailed information for a specific analysis run, including recent log events.
  - Query params: `eventsLimit` (alias `limit`) caps returned events (default 100, max 500).
  - Response: `{ run: { ...same fields as list }, events: [{ id, runId, ts, stage, message, details }] }` newest-first.
  - Errors: `400` invalid id; `404` not found (including when DB access is unavailable).

- POST `/api/analysis/start`
  - Triggers the offline analysis pipeline (`analysis-run.js`) and returns the run identifier immediately.
  - Body (JSON, optional): accepts CLI-aligned flags (`analysisVersion`, `pageLimit`, `domainLimit`, `skipPages`, `skipDomains`, `dryRun`, `verbose`). All fields are optional; defaults match running the CLI without extra flags.
  - Response: `202 Accepted` with `{ runId, detailUrl, apiUrl }`, where `detailUrl` is the SSR view `/analysis/:id/ssr`.
  - Errors: `500` if the analysis runner fails to spawn.

- Server-rendered queues pages (SSR)
  - GET `/queues/ssr` — Lists recent queues from `crawl_jobs` with event counts. Read-only; useful for quick inspection without the static client.
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
  - Example:
    - `PROBLEM {"kind":"missing-hub","scope":"guardian","target":"/world/france","message":"Country hub not found in sitemap","details":{"slug":"france"}}` → SSE: `event: problem` with same JSON plus `jobId` and derived `severity:"warn"` (server may add an ISO `ts`).

- Event: `milestone`
  - Emitted when the crawler prints a structured line starting with `MILESTONE `.
  - Payload: `{ kind: string, scope?: string, target?: string, message?: string, details?: object, jobId: string, ts?: ISOString }`
  - Purpose: record positive achievements and learned patterns that help navigation or planning (separate from problems). Examples: homepage patterns inferred, hubs seeded, classifier calibrated. The special milestone kind `full-understanding` tracks when the crawler has demonstrated comprehensive knowledge of a site (see Milestones persistence below for the current definition).
  - Notes: The completion of an intelligent crawl is **not** emitted as a milestone by itself; milestones should mark meaningful progress along the way.
  - Examples:
    - `MILESTONE {"kind":"patterns-learned","scope":"guardian","message":"Homepage patterns inferred","details":{"sections":["world","sport"]}}`
    - `MILESTONE {"kind":"full-understanding","scope":"guardian","message":"Country hubs validated","details":{"countriesCovered":192,"missing":3}}`

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

- Telemetry surface
  - Progress frames may include per-host limiter metrics that the UI can render as badges.


## Persistence (SQLite)

- Engine: `better-sqlite3` with WAL enabled.
- Core tables (not exhaustive): `articles`, `fetches`, `links`, `urls`, `domains`, `categories`.
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
    - Offline awarding: `src/tools/analysis-run.js` reruns page + domain analysis, then inserts any missing prerequisite milestones (`downloads-1k`, `depth2-coverage`, `articles-identified-*`) with `job_id="analysis-run"`. Use the CLI (or `npm run analysis:run`) after large imports/backfills so the UI reflects readiness for wide-history jobs.
    - Wide history tasks (e.g., `wide-download-countries-histories`) should check for prerequisite milestones first — especially `full-understanding`, `depth2-coverage`, and at least `articles-identified-1k` — before scheduling large backfills. The absence of these milestones is the signal that additional crawling/analysis is required.
  - Post-run summary: intelligent crawls may emit additional milestones during execution, but the crawl ending itself is not treated as a milestone.

 Crawl types catalog (new):
 - Table: `crawl_types (id INTEGER PK, name TEXT UNIQUE NOT NULL, description TEXT, declaration TEXT NOT NULL)`
 - Purpose: configure named crawl presets. Declaration is JSON containing flags (e.g., `{ crawlType: 'basic-with-sitemap', useSitemap: true, sitemapOnly: false }`).
 - Seeding: on server start, if table is empty it seeds four types: `basic`, `sitemap-only`, `basic-with-sitemap`, `intelligent`.
  - `intelligent` declaration triggers planner features; the server passes `--crawl-type=intelligent` to the crawler and planner logic keys off that crawl type.
 - API: `GET /api/crawl-types` returns `{ items }` with `declaration` parsed to an object.
 - UI: Adds a "Crawl Type" dropdown; selection sets `crawlType` in `POST /api/crawl` and drives sitemap checkboxes. Back-compat checkbox controls still sent. The legacy UI "Mode" dropdown has been removed in favor of choosing the `intelligent` preset directly.


## Roadmap & open problems

| ID | Theme | Next step | Status |
| :--- | :--- | :--- | :--- |
| `R-01` | Multi-job readiness | Persist finished crawl history so `/api/crawls` can list prior jobs (see `src/db.js`). | Not started |
| `R-02` | Planner UX | Emit a `milestone` summary at the end of intelligent crawls for quick post-run diagnostics (`src/crawl.js`). | Not started |
| `R-03` | Rate limiting | Share per-host pacing across concurrent jobs once `UI_ALLOW_MULTI_JOBS` is enabled. | Researching |

If you pick up an item, add yourself to the table (or link a draft PR) so the next agent has context.


## Testing approach

- Framework: Jest; tests live in `ui/__tests__/`.
- Cheat sheet:
  - **Fast cycle (PowerShell):** `$env:UI_FAKE_RUNNER=1; $env:TEST_FAST=1; npm test -- --runTestsByPath ui/__tests__/server.test.js`
  - **Full suite:** `npm test`
- Pattern: Spawn `src/ui/express/server.js` on a random port (via `PORT=0`) and exercise HTTP/SSE with the Node `http` module.
- Fake runner:
  - Set `UI_FAKE_RUNNER=1` to use a built-in fake child runner that emits realistic progress quickly for tests.
  - Set `UI_FORCE_SPAWN_FAIL=1` to simulate immediate spawn failure (`done` should appear fast).
- Timing:
  - Tests read seeded progress/log frames shortly after `/api/crawl` returns 202 to ensure the UI shows immediate activity.


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


## Keep this doc up to date (required)

When you change any of the following, you must update AGENTS.md in the same PR:

- SSE event shapes, field names, or meanings.
- HTTP endpoints, query/body params, or response schemas.
- Crawler rate limiting/backoff semantics or emitted telemetry fields.
- Database schema, triggers, or important query shapes relied on by the UI.
- Process orchestration (startup/shutdown/PAUSE/RESUME) or logging/seeded events.

Minimum update checklist:

1) Reflect the change in the relevant section(s) above.
2) Add a short entry to the Changelog with the date and a one-liner summary.
3) If you added/changed events or APIs, include an example payload.
4) If you changed timing/flow guarantees (e.g., seeded progress), call this out.
5) If tests were added/updated, reference the test file(s).

Failure to update this file makes it harder for future agents to reason about the system. Treat this file as a contract.

## Changelog

- 2025-09-26
  - SSE connections now replay a terminal `done` event for in-memory jobs that have already exited so late subscribers still observe completion. Tests: `ui/__tests__/crawl.e2e.more.test.js`.
- 2025-09-26
  - Refactored analyse-pages into a modular pipeline (`src/analysis/page-analyzer.js`, `place-extraction.js`, `deep-analyzer.js`), exposing deep analysis metadata under `analysis.meta.deepAnalysis`. Tests: `src/analysis/__tests__/page-analyzer.test.js`.
- 2025-09-26
  - Place hub detection now captures topical context: `place_hubs` stores `place_kind`, `topic_slug`, `topic_label`, and `topic_kind`, and `analyse-pages` records Guardian-style `/sport/<place>` pages as place-specific topic hubs. Tests: `src/tools/__tests__/analyse-pages.place-hubs.test.js`.
- 2025-09-26
  - Added URL policy scaffolding (`src/crawler/urlPolicy.js`) and plumbed the new `allowQueryUrls` / `--allow-query-urls` option (defaulting to query skipping) so future query analysis can plug in without changing the CLI contract yet.

- 2025-09-26
  - Added SQLite indexes `idx_articles_analysis_progress` and `idx_latest_fetch_ts_desc` to accelerate `analyse-pages` filtering/ordering, trimming analysis-run runtime and Node heap usage.
  - `analysis-run` now performs an explicit database setup pass (stage `db-setup`) and logs when schema ensure begins and ends before page analysis starts.

- 2025-09-26
  - GUI server now attempts high-numbered ports on startup and falls back automatically if the requested port is busy; documentation reflects the new behavior.

- 2025-09-25
  - Added POST `/api/analysis/start`, introduced the homepage “Perform Analysis” button that surfaces run links, and covered the API with integration tests.

- 2025-09-25
  - Analysis run tracking: added SQLite tables `analysis_runs`/`analysis_run_events`, wired `src/tools/analysis-run.js` to record stages, exposed `/api/analysis` + `/api/analysis/:id`, and shipped SSR pages `/analysis/ssr` + `/analysis/:id/ssr` with auto-refresh. Tests: `src/ui/express/__tests__/analysis.api.ssr.test.js`.

- 2025-09-25
  - Removed the legacy crawl `mode` flag end-to-end: UI selector deleted, `/api/crawl` now ignores a `mode` key, and the crawler CLI accepts `--crawl-type` (planner activates when the type starts with `intelligent`).
- 2025-09-25
  - POST /api/crawl response now includes `stage` and `durationMs` so tests and clients can assert startup latency without timing their own sockets. No breaking change for consumers that ignore extra properties.

- 2025-09-24
  - Agent onboarding refresh: added TL;DR, quick-start checklist, roadmap table, and testing cheat sheet to speed up handoffs while keeping the file concise.

- 2025-09-24
  - Milestones guidance: documented `full-understanding` as a milestone goal for intelligent crawls, including current country-hub validation criteria and reminders that crawl completion alone is not a milestone.

- 2025-09-25
  - Analysis milestones: crawler now emits `downloads-1k`, `depth2-coverage`, `articles-identified-1k`, and `articles-identified-10k` from the analysis pipeline; wide history jobs are gated on these checkpoints.
- 2025-09-25
  - Offline analysis runner: added `src/tools/analysis-run.js` + `npm run analysis:run` to batch page/domain analysis and award pending milestone rows (`downloads-1k`, `depth2-coverage`, `articles-identified-*`) under job id `analysis-run`.

- 2025-09-24
  - Intelligent crawl consolidation: Added `intelligent` as a first-class `crawlType` preset. (Superseded by 2025-09-25 entry which removed the legacy `mode` flag entirely.) Example request body: `{ "startUrl": "https://example.com", "crawlType": "intelligent" }`.

- 2025-09-24
  - Problem event severity: SSE `problem` events now include a derived `severity` field (`warn` for `missing-hub`, `info` otherwise). No DB schema change; field is computed on the fly for normalization. Problems SSR page styles severity with colored pills. Backward-compatible (clients ignoring `severity` continue to function).

- 2025-09-24
  - Consolidated page analysis script: canonical script is now `src/tools/analyse-pages.js` (gazetteer + hub detection). Legacy `src/analyse-pages.js` replaced with a deprecation shim that forwards to the tools version and will be removed in a future release. Non-breaking; existing invocations continue to function with a console warning.
  - UI server consolidation & styling: legacy `ui/server.js` now delegates to `src/ui/express/server.js` (single authoritative implementation). Problems and Milestones SSR pages restyled to match Queues layout (containers, pagination row) with no API/HTML semantics changes. Tests unaffected.

- 2025-09-24
  - New SSE event `milestone` and persistence: server parses `MILESTONE {json}` lines, broadcasts as `milestone` SSE with `jobId`, and writes to new `crawl_milestones` table. Added SSR page `/milestones/ssr` with filters and cursors. Problems table remains for `PROBLEM` diagnostics only.
  
 - 2025-09-24
  - Intelligent planner flags: Accepts optional `hubMaxPages`, `hubMaxDays`, `intMaxSeeds`, `intTargetHosts`, and `plannerVerbosity` in `POST /api/crawl` and forwards them to the crawler. No breaking changes; defaults preserve behavior when omitted.
  - SSE passthrough: Server now relays structured `QUEUE {}` and `PROBLEM {}` lines from the crawler as `queue` and `problem` SSE events respectively (schema unchanged from prior docs).

- 2025-09-24
  - Intelligent planner wiring: `POST /api/crawl` with `crawlType: "intelligent"` forwards planner flags to the crawler (`--crawl-type=intelligent`). Planner runs seed site/topic hubs (e.g., Guardian country pages) and reports expectation gaps.
  - New SSE event `problem`: server parses `PROBLEM {json}` crawler lines, broadcasts as `event: problem` with `jobId`, and persists to SQLite when available.
  - Persistence: added `crawl_problems` table with indices; rows inserted on each `PROBLEM` line with a server timestamp.
  - No breaking changes: existing APIs/events remain unchanged; `crawlType` drives planner behavior.

- 2025-09-24
  - Gazetteer SSR robustness: The landing page `/gazetteer` now returns 200 with zeroed counts when gazetteer tables are missing instead of 500. No API shape changes; improves stability for empty/uninitialized DBs.

- 2025-09-24
  - Problems history: Added read API `GET /api/problems` with filters/cursors and SSR page `/problems/ssr`. Tests in `src/ui/express/__tests__/problems.api.ssr.test.js`.
  
 - 2025-09-24
  - URLs list filters: Added combined URL+content analysis filters and badges. `/api/urls` now accepts `combinedHint` and `minCombinedConfidence` (0–1 or 0–100). When `details=1`, response items include `combined_hint` and `combined_confidence`. The `URLs` page adds filter controls and shows hint badges with confidence.

- 2025-09-24
  - Smarter refetch policy: Added per-type refetch windows so cached articles and hub/nav pages can have different freshness. New UI controls “Refetch window — articles” and “Refetch window — hubs/nav” post `refetchArticleIfOlderThan` and `refetchHubIfOlderThan`, which translate to crawler flags `--refetch-article-if-older-than` and `--refetch-hub-if-older-than`. Global `refetchIfOlderThan` remains as a fallback. Crawler now computes an effective window by classification heuristics before fetching, reducing bandwidth by avoiding re-downloading older articles while keeping hubs fresh. No breaking changes; defaults preserve previous behavior if new fields are omitted.

- 2025-09-23
  - Large queues UX/API: Added cursor-based pagination to `GET /api/queues/:id/events` via `before` (older) and `after` (newer); response now includes cursors `{ nextBefore, prevAfter }`. `GET /queues/:id/ssr` now supports the same params with inline pager controls while maintaining newest-first rendering. Created composite SQLite indices `idx_queue_events_job_id_desc` and `idx_queue_events_job_action_id_desc` for efficient keyset scans on large datasets. No breaking changes; existing calls without cursors behave the same.

- 2025-09-23
  - Queues UX: added server-rendered queues pages — `/queues/ssr` for the list, `/queues/:id/ssr` for details with filters, and `/queues/latest` to jump to the most recent queue. Default navigation now encourages reviewing the latest queue first, with inline links to newer/older queues. No API shape changes.
- 2025-09-23
  - Backend performance: enabled gzip compression for GET responses while continuing to skip compression for SSE streams and all POST /api/* routes. Added cache headers for static assets under the UI public folder. Read-only SQLite connection is now reused across GET endpoints to avoid per-request initialization/migrations. No API shape changes; latency improvements only.
  - Observability: added per-request timing logs emitted after responses complete (format: `[req] METHOD URL -> STATUS N.ms`).

- 2025-09-22
  - Start-path performance: POST /api/crawl now responds immediately, with non-critical work (seeded events, jobs broadcast, watchdog scheduling) deferred to the next tick; compression is skipped for all POST /api/* routes for lower latency.
  - Added optional start-path timing trace logs gated by `UI_TRACE_START=1` (or `options.traceStart` in `createApp`). Logs step timings for arg building, spawn, response, deferred seeding, jobs broadcast, watchdog setup, and time-to-first child output.
  - No public API changes; observability only. Example trace lines: `[trace] start handler timings job=abc buildArgs=1ms spawn=3ms respond=0ms totalSoFar=5ms` and `[trace] first child stdout job=abc after 42ms`.
  - Tests: existing health/chatty-start/e2e tests cover the fast acceptance and visible activity. No changes needed.

 - 2025-09-22
  - Added crawl types catalog: new table `crawl_types` with seed rows (`basic`, `sitemap-only`, `basic-with-sitemap`).
  - New endpoint `GET /api/crawl-types` for the UI to populate a dropdown. UI posts `crawlType` and maps it to sitemap flags. Server-side `buildArgs` now honors `crawlType` (still back-compatible with `useSitemap`/`sitemapOnly`).
  - No breaking changes: existing UI checkboxes remain functional; dropdown simply standardizes presets.
  
  - Crawler now emits structured `QUEUE` lines on enqueue/dequeue/retry/drop; the UI server passes these through as SSE `queue` events. This enables a real-time queues page and downstream persistence of queue events.
  - Optional multi-job support behind `UI_ALLOW_MULTI_JOBS=1`: concurrent crawls with unique `jobId`s; control endpoints accept `jobId` and require it when multiple jobs are active.
  - `/events?job=` now filters events by job id; on connect, the server seeds a `progress` snapshot per running job for immediate UI feedback.
  - Updated docs for `/api/crawl` 409 behavior when multi-jobs are disabled.
  - Added `GET /api/crawls/:id` to retrieve a detailed snapshot of a specific job (in-memory for now).
  - Added job-scoped control endpoints: `POST /api/crawls/:id/stop|pause|resume` mirroring legacy controls.
  - Tests: see `src/ui/express/__tests__/crawls.controls.api.test.js`.
  - Added SSE `queue` event pass-through for structured `QUEUE {json}` lines; added simple `/queues` page.
  - Queue persistence: UI server now writes `crawl_jobs` and `queue_events`; new read APIs `GET /api/queues` and `GET /api/queues/:id/events` with basic filters. Tests: `ui/__tests__/queues.api.test.js`.
  
 - 2025-09-22
  - Added initial AGENTS.md.
  - Documented SSE `jobId` tagging on `progress`/`done` and `/api/crawl` response.
  - Documented acceptance of `/events?job=` (no-op for now) and jobs list snapshot.