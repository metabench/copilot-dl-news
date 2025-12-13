# Telemetry Contract (Server Telemetry Standard v1)

## Boundary
UI servers emit operational telemetry to stdout (JSON-lines) and expose minimal health/status endpoints.

Consumers include:
- local tooling that tails logs
- tests and agents that poll `/api/status`

Implementation lives in:
- `src/ui/server/utils/telemetry/index.js`

## Contract

### Log record shape (JSON-lines)
Each emitted record is a single JSON object per line, containing at least:
- `v`: `1`
- `ts`: ISO timestamp
- `level`: `debug` | `info` | `warn` | `error`
- `event`: string (e.g. `http.request`)
- `server`: `{ name, entry, port, pid, runId }`

Optional fields:
- `msg`: string
- `data`: any JSON-serializable value
- `err`: `{ message, stack?, code? }` (only for `level=error`)

### Endpoints
- `GET /api/health` → `{ ok: true, v: 1 }`
- `GET /api/status` → includes `{ ok: true, v: 1, server: { ... }, startedAt, uptimeMs }`

### Middleware event
When `attachTelemetryMiddleware()` is enabled, servers emit:
- `event = "http.request"` with `data = { method, path, statusCode, durationMs }`

## Invariants
- Telemetry **must never crash the server** (log write failures are swallowed).
- `wireProcessHandlers()` is **idempotent** across multiple telemetry instances.
- `/api/health` and `/api/status` remain stable for diagnostics.

## Enforcement
- Jest contract test: `tests/ui/server/serverTelemetryStandard.test.js`

## Change protocol
If you need to evolve the format:
1. Add a new `v` (version) rather than silently changing `v: 1` semantics.
2. Keep `v: 1` backward compatible until consumers migrate.
3. Update `tests/ui/server/serverTelemetryStandard.test.js` to lock the new expectations.
