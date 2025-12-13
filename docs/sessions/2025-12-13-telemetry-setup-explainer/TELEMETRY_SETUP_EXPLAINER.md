# Telemetry Setup Explainer (Server JSONL v1 + Crawler Telemetry)

**Purpose**: explain what telemetry exists today, why it feels “split”, where drift exists, and how to turn “it feels different” into an invariant test.

This repo currently has **two telemetry families**:

1) **UI server telemetry v1** (JSONL on stdout + `/api/health` + `/api/status`) — designed to be **z-server friendly**.
2) **Crawler telemetry** (milestone/progress/problem + optional SSE broadcast + optional DB persistence) — designed to be **crawl-progress friendly**.

They overlap in intent (observability) but not in schema/transport.

---

## 1) The “Server Telemetry Standard (v1)” (JSONL)

Canonical spec: `docs/guides/SERVER_TELEMETRY_STANDARD.md`.

### What v1 is trying to standardize

- **Transport**: JSON Lines (JSONL), typically written to stdout.
- **Schema**: stable envelope
  - `v`, `ts`, `level`, `event`, `server`, plus optional `msg`, `data`, `err`
- **Endpoints**:
  - `GET /api/health` for cheap liveness
  - `GET /api/status` for richer status snapshots

### Where it is implemented

- Helper: `src/ui/server/utils/telemetry/index.js`
- Adopted by servers (examples):
  - `src/ui/server/docsViewer/server.js`
  - `src/ui/server/diagramAtlasServer.js`
  - `src/ui/server/dataExplorerServer.js`

### What z-server does with it

z-server can parse JSONL lines from spawned processes, and it can also poll `/api/status` for externally-started servers.

Key ingestion helpers:
- `z-server/ui/lib/telemetryJsonl` (JSONL splitting + “is this telemetry v1?”)

---

## 2) The crawler telemetry family

This exists in multiple layers depending on “which crawler system” is running.

### 2.1 Telemetry facade used by crawlers

- `src/crawler/CrawlerTelemetry.js` exposes a stable facade:
  - `progress`, `queueEvent`, `enhancedQueueEvent`, `problem`, `milestone`, `milestoneOnce`, `plannerStage`
- Underneath it forwards to:
  - `src/crawler/CrawlerEvents.js` (log lines, milestone history, once semantics, DB persistence of milestones via enhanced adapter)

This is the “core” telemetry that tests and orchestrators spy on.

### 2.2 Structured crawler telemetry schema + SSE bridge

A second module exists that is more “UI telemetry stream oriented”:

- `src/crawler/telemetry/CrawlTelemetrySchema.js` defines typed events like `progress`, `phase-change`, `url-visited`, `url-error`, etc.
- `src/crawler/telemetry/CrawlTelemetryBridge.js` batches and broadcasts those to connected clients (typically SSE).

This is a different schema from server JSONL v1.

---

## 3) Where the confusion comes from (the real mismatch)

You’ll see the word “telemetry” used for:

- **Server lifecycle + HTTP request summaries** (server JSONL v1)
- **Crawler progress + milestones + problems** (crawler facade)
- **Crawler UI stream events** (crawler telemetry schema + SSE)

These are all legitimate, but without explicit naming/bridges, they can look like competing systems.

---

## 4) Drift points (spec vs implementation)

This is the key: drift isn’t “bad”, but it becomes dangerous when it’s silent.

### 4.1 `http.response` vs `http.request`

The spec describes an **HTTP response summary** event:

- spec example: `event: "http.response"` with `{ method, path, status, durationMs }`

Historically the helper emitted `http.request` even though the payload is a response summary.

**Fix applied (preferred)**: emit `http.response` (optionally also emit legacy `http.request` when requested).

### 4.2 `/api/status` richness

The spec proposes a rich `/api/status` payload:

- `server.startedAt`, `server.uptimeMs`
- optional build and request/error stats

The helper currently returns a slimmer status response.

**Minimal alignment applied**: include `server.startedAt` and `server.uptimeMs` in addition to existing top-level fields.

Remaining gap: build/stats aren’t implemented in the helper yet.

---

## 5) How to read telemetry in practice

### 5.1 Server JSONL v1 (UI servers)

- Look for `event: server.*` to see lifecycle
- Look for `event: http.response` to see request summaries
- For automated checks, prefer parsing JSONL and asserting invariants

### 5.2 Crawler (milestones/progress/problem)

- Milestones are often emitted via `telemetry.milestoneOnce(key, payload)`
- Problems can be aggregated via `getProblemSummary()`
- Some milestones persist to DB when `persist: true` (see `CrawlerEvents.emitMilestone`)

---

## 6) Drift Sentinel: invariants worth encoding

These are practical “tripwires” that should fail loudly when behavior drifts.

### 6.1 drift:decision-trace-shape (crawler)

- Invariant: milestone payloads include `kind`, `message`, and a stable `scope` when present
- Test target: `crawler.telemetry.milestoneOnce(...)` paths (planner + startup sequence)

### 6.2 drift:query-budget (UI servers)

- Invariant: `/api/status` stays fast and stable in shape
- Test target: `/api/status` contract test (shape-only + presence of core fields)

### 6.3 drift:perf-regression (telemetry logging)

- Invariant: `attachTelemetryMiddleware` does not emit for `/api/health` and `/api/status`
- Invariant: `http.response` includes `durationMs` and status

---

## 7) Recommended naming and boundary cleanup (future work)

To reduce conceptual confusion, explicitly name the systems:

- **Server Telemetry (JSONL v1)**: `server.*`, `http.*` + `/api/status`
- **Crawler Event Telemetry**: `crawler.*` semantics (milestone/progress/problem)
- **Crawler Stream Telemetry**: schema’d events for UI streaming

Then add an adapter when you want to unify views:

- `crawler milestone/progress` → emitted as server telemetry JSONL events when a crawler is hosted inside a UI server process.

---

## 8) Pointers (start here)

- Spec: `docs/guides/SERVER_TELEMETRY_STANDARD.md`
- Helper: `src/ui/server/utils/telemetry/index.js`
- Tests:
  - `tests/ui/server/serverTelemetryStandard.test.js`
  - `tests/z-server/telemetryJsonl.test.js`
- Crawler telemetry facade: `src/crawler/CrawlerTelemetry.js`
- Crawler event sink + persistence: `src/crawler/CrawlerEvents.js`
- Crawler stream telemetry: `src/crawler/telemetry/*`
