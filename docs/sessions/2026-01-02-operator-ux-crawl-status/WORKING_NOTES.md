# Working Notes – Operator UX: Crawl Status & Errors

- 2026-01-02 — Goal: make crawl problems reliably visible without digging.

## Inventory
- Unified App already mounts:
	- `Crawl Status` (`/crawl-status`) — start jobs + live progress (SSE / remote obs) + error handling.
	- `Crawl Observer` (`/crawl-observer`) — task_events-backed monitoring.
	- `TelemetryIntegration` endpoints (`/api/crawl-telemetry/*`).

## Implementation
- Added `GET /api/crawl/summary` on Unified App:
	- Uses in-process job registry (`activeJobs`) + telemetry history to compute the latest error event.
	- Defensive defaults so the API stays stable even if telemetry is empty.
- Surfaced the summary on the Unified UI Home panel:
	- Shows `Active Crawl Jobs`, `Crawl Health` (OK/ERR/?), and a last-error alert with a link to `Crawl Status`.
	- Polls every 5 seconds; safe fallback on fetch errors.

## Fix discovered during implementation
- `src/ui/server/unifiedApp/server.js` contained an invalid stray scheduler module object literal outside the `modules` array.
	- Moved the scheduler module back into the `modules` array so the file remains syntactically valid.

## Validation
- `node src/ui/server/unifiedApp/checks/unified.server.check.js` ✅ (includes `/api/crawl/summary` probe)

## Follow-up: badge + richer summary + z-server auto-open
- Unified Shell sidebar now shows an error badge on crawler apps (e.g. Crawl Status) when the crawl summary reports `lastError`.
	- Badge text uses `errorsLast10m` (capped at `99+`) when available.
- Expanded `/api/crawl/summary`:
	- `errorsLast10m` count (based on telemetry history timestamps)
	- `lastFailingJobId` + `lastFailingUrl` (best-effort extraction from telemetry event data)
- z-server now auto-opens `/?app=crawl-status` for the Unified UI server when the summary reports an error (unless an explicit `openPath` was requested).

## Validation (follow-up)
- `node src/ui/server/unifiedApp/checks/unified.server.check.js` ✅
- `npm --prefix z-server run test:unit` ✅
