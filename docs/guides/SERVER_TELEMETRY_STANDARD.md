# Server Telemetry Standard (v1)

_Last updated: 2025-12-11_

## Why this exists

This repo has many small Node/Express + jsgui3 servers. We also have **z-server** (Electron) that can start/stop some of them and display log output.

Today, observability is inconsistent:

- Log output is mostly free-form strings.
- z-server can only capture stdout/stderr for processes it spawns.
- For externally-started servers (already running), z-server can detect them (ports/process list) but cannot attach to their stdout/stderr.

This guide defines a minimal, stable **telemetry v1** standard so that:

- Any server can emit structured, machine-parsable events.
- z-server can reliably display uniform status/log data.
- Future tooling (CI, agents, dashboards) can query and aggregate health/state.

The goal is **standardization without heavy dependencies**.

---

## Design goals

- **Minimal**: a small required core, everything else optional.
- **Transport-agnostic**: the same event format can flow via stdout, file tailing, HTTP, or SSE.
- **Stable**: versioned, backwards-compatible schema.
- **Low overhead**: should not require OpenTelemetry or a collector to get value.
- **z-server friendly**: easy to parse from stdout chunks and safe to store.

---

## Scope

Telemetry v1 covers:

1) **Structured log events** (JSON lines)
2) **Standard endpoints** (HTTP): `/api/health`, `/api/status`
3) **Standard metadata** for server identity and process identity

It does NOT (yet) mandate:

- Distributed tracing
- Prometheus metrics
- Span context propagation

Those can be layered later.

---

## Terminology

- **Event**: one telemetry record (JSON object).
- **JSONL**: JSON Lines; one JSON object per line on stdout or in a log file.
- **Server identity**: stable label like `Docs Viewer` or `Data Explorer`.
- **Run identity**: unique ID for a single process run (useful for correlating logs).

---

## Event transport options

### Option A: stdout/stderr JSONL (best for z-server spawned processes)
Servers write telemetry events as one-line JSON to stdout.

Pros: z-server already captures stdout/stderr.
Cons: doesn’t help for servers not launched by z-server.

### Option B: file-based JSONL (best for “any running server”)
Servers append JSONL events to a known location (suggested under `tmp/telemetry/`).

Pros: z-server can tail files for any server, regardless of how it was started.
Cons: need rotation/retention and Windows-safe file access.

### Option C: push channel (SSE/WebSocket)
Servers expose `/api/telemetry/stream`.

Pros: great UI experience.
Cons: higher implementation cost; needs reconnection logic.

**Recommendation**: adopt **A + a minimal `/api/status`** first. Add **B** for external servers if needed.

---

## Telemetry event schema (v1)

### Required top-level fields

Every event MUST include:

- `v`: number – schema version, currently `1`
- `ts`: string – ISO timestamp (UTC) `new Date().toISOString()`
- `level`: string – one of `debug|info|warn|error`
- `event`: string – a stable event name (dot-separated)
- `server`: object – server identity block

### Required `server` object

- `server.name`: string (human label, e.g. `"Docs Viewer"`)
- `server.entry`: string (workspace-relative entry file when available)
- `server.port`: number|null
- `server.pid`: number
- `server.runId`: string (random ID per process run)

### Recommended common fields

- `msg`: string (human-friendly summary)
- `data`: object (event-specific payload; keep bounded)
- `err`: object (for errors)
  - `err.message`: string
  - `err.stack`: string (optional; can be truncated)

### Naming conventions

- Event names use a predictable prefix:
  - `server.*` lifecycle and runtime
  - `http.*` requests
  - `bundle.*` bundle gate/build events
  - `db.*` database events (optional)

Examples:

- `server.starting`
- `server.listening`
- `server.shutdown`
- `http.request`
- `http.response`
- `bundle.ensure.start`
- `bundle.ensure.ok`
- `bundle.ensure.fail`

### Example events

Server started:

```json
{"v":1,"ts":"2025-12-11T21:15:01.123Z","level":"info","event":"server.listening","server":{"name":"Docs Viewer","entry":"src/ui/server/docsViewer/server.js","port":4700,"pid":12345,"runId":"c2c7c4c4"},"msg":"Listening","data":{"host":"127.0.0.1"}}
```

HTTP request summary:

```json
{"v":1,"ts":"2025-12-11T21:15:05.456Z","level":"info","event":"http.response","server":{"name":"Docs Viewer","entry":"src/ui/server/docsViewer/server.js","port":4700,"pid":12345,"runId":"c2c7c4c4"},"data":{"method":"GET","path":"/api/status","status":200,"durationMs":3}}
```

Error event:

```json
{"v":1,"ts":"2025-12-11T21:15:09.000Z","level":"error","event":"server.error","server":{"name":"Docs Viewer","entry":"src/ui/server/docsViewer/server.js","port":4700,"pid":12345,"runId":"c2c7c4c4"},"err":{"message":"EADDRINUSE: address already in use","stack":"..."}}
```

---

## Standard endpoints

### GET `/api/health`

Purpose: cheap liveness probe.

Response (v1):

```json
{ "ok": true }
```

### GET `/api/status`

Purpose: richer “what are you doing” snapshot for dashboards and z-server polling.

Response (v1):

```json
{
  "ok": true,
  "server": {
    "name": "Docs Viewer",
    "entry": "src/ui/server/docsViewer/server.js",
    "pid": 12345,
    "port": 4700,
    "runId": "c2c7c4c4",
    "startedAt": "2025-12-11T21:15:01.123Z",
    "uptimeMs": 8123
  },
  "build": {
    "clientBundle": {
      "path": "src/ui/server/docsViewer/public/docs-viewer-client.js",
      "fresh": true,
      "mtimeMs": 1733951701123
    }
  },
  "stats": {
    "requests": { "total": 120, "inFlight": 0 },
    "errors": { "total": 1 }
  }
}
```

Notes:

- Keep it fast.
- Keep it safe (no secrets).
- Prefer stable keys; add new keys, don’t rename.

---

## Server-side implementation recipe

This describes what to implement in each server entry file.

### Step 1: define identity

- Use existing `@server` comment for the human name.
- Derive `entry` from the server file path.
- Use `process.pid` for pid.
- Use the chosen port.
- Create `runId` once on boot.

### Step 2: emit lifecycle events

Emit at minimum:

- `server.starting`
- `server.listening`
- `server.shutdown`
- `server.error`

### Step 3: add HTTP middleware (optional but recommended)

- Increment `requests.total`
- Track `requests.inFlight`
- Emit `http.response` with method/path/status/duration

### Step 4: add `/api/health` and `/api/status`

- `/api/health` should not hit DB.
- `/api/status` may include shallow DB readiness (optional).

### Step 5: integrate with `--check`

- `--check` should start, verify respond, then exit.
- Use the shared helper `src/ui/server/utils/serverStartupCheck.js`.
- In `--check` mode, treat “bundle gate failed” as a hard error.

---

## z-server integration recipe

### Ingesting JSON logs

z-server currently forwards raw stdout/stderr chunks over IPC.

Recommended ingestion algorithm:

1) In renderer UI, maintain per-server buffers of stdout lines.
2) Split by `\n` and attempt `JSON.parse(line)`.
3) If parse succeeds and the object matches telemetry v1 (`v === 1` and has `event` + `server`), treat as a structured event.
4) Otherwise, treat as plain text log.

### Polling `/api/status`

For servers not launched by z-server (external processes):

- z-server already knows expected ports via `@port` scanning and heuristics.
- It can periodically fetch `http://127.0.0.1:<port>/api/status`.

UI suggestions:

- Show **health badge** (green/yellow/red)
- Show **uptime**
- Show **request rate** (derived from successive status polls)
- Show **last error** (from structured events, or status payload)

### File tailing (optional)

If adopting file-based JSONL logs:

- Standardize a path like `tmp/telemetry/<serverShortName>.jsonl`.
- z-server tails the file and parses JSON lines.
- Add retention (rotate daily, cap size).

---

## Migration plan

1) **Document** the standard (this guide).
2) Implement a shared helper module under `src/ui/server/utils/telemetry/`.
3) Adopt it in 2–3 representative servers (e.g., Data Explorer, Docs Viewer, Diagram Atlas).
4) Update z-server UI to parse JSONL events and display `/api/status` results.
5) Roll out to remaining servers.

---

## Appendix: minimal validation checklist

- Server prints a `server.listening` event on startup.
- `GET /api/health` returns `{ok:true}` quickly.
- `GET /api/status` returns stable payload including `pid`, `port`, `runId`, `uptimeMs`.
- z-server UI can render logs even when events are mixed with plain text.
