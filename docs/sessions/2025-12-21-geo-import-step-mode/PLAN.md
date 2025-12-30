# Plan – Geo Import Step Mode + Control Wrapper

## Objective
Add a reusable server-side control wrapper (pause/resume/stop/step) and wire a click-to-proceed mode into Geo Import with tests.

## Done When
- [x] Geo Import supports step-by-step execution (server + client wiring).
- [x] A reusable step gating utility exists with unit tests.
- [x] Evidence (test command/output) is captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- src/services/StepGate.js
- src/services/GeoImportStateManager.js
- src/ui/server/geoImportServer.js
- src/ui/client/geoImport/index.js
- src/services/__tests__/StepGate.test.js

## Risks & Mitigations
- _Note potential risks and how to mitigate them._

## Tests / Validation
- npm run test:by-path src/services/__tests__/StepGate.test.js
