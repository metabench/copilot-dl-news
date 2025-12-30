# Plan – Pause/Resume Ingestion with UI Catch-up

## Objective
Allow background ingestion (starting with Geo Import) to be paused/resumed while UI continues to update and catch up on state.

## Done When
- [ ] Geo Import pause can be requested immediately and is applied as soon as pipeline controls attach (no “fake paused” state).
- [ ] Geo Import UI continues rendering state updates while paused and can catch up if it fell behind.
- [ ] UI remains correct even if SSE drops temporarily (poll fallback).
- [ ] Focused unit test covers pending pause behavior.
- [ ] Evidence and follow-ups captured in session docs.

## Change Set (initial sketch)
- `src/services/GeoImportStateManager.js`
- `src/ui/client/geoImport/index.js`
- `src/services/__tests__/GeoImportStateManager.pausePending.test.js`
- Session docs in this folder

## Risks & Mitigations
- Polling overhead: keep cadence modest (2s) and avoid work if response is unchanged.
- Some background processes may not expose pause/resume controls: introduce a PauseToken pattern when extending beyond Geo Import.

## Tests / Validation
- `npm run test:by-path src/services/__tests__/GeoImportStateManager.pausePending.test.js`
