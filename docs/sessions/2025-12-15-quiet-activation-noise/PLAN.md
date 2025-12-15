# Plan – Silence jsgui activation noise

## Objective
Suppress noisy jsgui3 activation console logs (pre_activate/activate/fallback) without hiding real errors.

## Done When
- [x] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [x] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [x] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- `src/ui/client/consoleNoiseFilter.js` (new)
- `src/ui/client/index.js`
- `src/ui/lab/experiments/025-mvvm-bindings-library/client.js`
- `src/ui/lab/experiments/026-activation-contract-lab/client.js`
- `src/ui/lab/experiments/027-progressbar-sse-telemetry/client.js`
- `src/ui/lab/experiments/028-jsgui3-server-sse-telemetry/client.js`

## Risks & Mitigations
- Risk: over-filtering logs that indicate real breakage.
	Mitigation: filter only known “activation noise” strings; never filter `console.error`.
- Risk: developers need the logs for debugging.
	Mitigation: opt-out via `window.__COPILOT_DISABLE_CONSOLE_FILTER__ = true` or opt-in debug via `window.__COPILOT_UI_DEBUG__ = true`.

## Tests / Validation
- `npm run ui:client-build`
- `node src/ui/lab/run-lab-checks.js --ids 025,026,027,028`
