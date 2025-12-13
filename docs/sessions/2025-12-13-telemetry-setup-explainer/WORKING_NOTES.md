# Working Notes – Telemetry Setup Explainer + WLILO Diagram

- 2025-12-13 — Session created via CLI. Add incremental notes here.

## Discoveries
- There are two distinct telemetry “families”:
	- UI server telemetry v1 (JSONL + /api/health + /api/status) intended for z-server ingestion.
	- Crawler telemetry (milestone/progress/problem facade) plus a separate crawler stream telemetry schema/bridge (batching + SSE).
- Main drift risks were naming/shape mismatches between the server telemetry standard doc and the helper implementation.

## Changes made
- Authored explainer doc: `TELEMETRY_SETUP_EXPLAINER.md`.
- Created diagrams:
	- `telemetry-systems-and-drift.dense.svg` (data-first)
	- `telemetry-systems-and-drift.wlilo.svg` (WLILO-restyled)
- Aligned server telemetry helper closer to the spec:
	- Middleware emits `http.response` response-summary events.
	- `/api/status` includes `server.startedAt` + `server.uptimeMs`.

## Validation
- Jest: `tests/ui/server/serverTelemetryStandard.test.js` (pass).
- SVG: `node tools/dev/svg-collisions.js docs/sessions/2025-12-13-telemetry-setup-explainer/telemetry-systems-and-drift.wlilo.svg --strict` (pass).
