# Working Notes – Pause/Resume Ingestion with UI Catch-up

## Scope
- Implement pause/resume behavior for Geo Import ingestion so that pausing stops background work but the UI continues rendering/catching up.

## Key changes
- GeoImportStateManager now supports `pausePending` when pause is requested before the observable wires pause controls.
- Geo Import dashboard client now schedules state renders via `requestAnimationFrame` and polls `/api/geo-import/state` every 2s to catch up (even when paused or after SSE hiccups).

## Validation
- `npm run test:by-path src/services/__tests__/GeoImportStateManager.pausePending.test.js`

- 2025-12-21 — Session created via CLI. Add incremental notes here.
