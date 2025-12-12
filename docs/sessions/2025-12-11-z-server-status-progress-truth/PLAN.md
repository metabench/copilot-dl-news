# Plan – z-server status/progress truthfulness

## Objective
Define and verify a truth table for z-server status/progress indicators and add targeted tests so UI reflects actual backend state.

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- z-server/ui/controls/zServerAppControl.js (scan-progress → UI mapping)
- z-server/ui/controls/scanningIndicatorControl.js (counting vs determinate behavior)
- z-server/tests/unit/zServerAppControl.scanProgress.test.js
- docs/sessions/2025-12-11-z-server-status-progress-truth/* (truth table + evidence)

## Risks & Mitigations
- Risk: scan lifecycle has multiple async sources (IPC events vs scan promise resolution). Mitigation: encode expected ordering via unit tests with a stub API.
- Risk: UI hides scanning indicator too early to see 100%. Mitigation: force a final determinate 100% update on `scan-progress: complete`.

## Tests / Validation
- Run z-server unit tests (focused): `cd z-server; npm test` (or the repo’s preferred by-path runner if configured).
- Record evidence in WORKING_NOTES.md (command + pass/fail).
