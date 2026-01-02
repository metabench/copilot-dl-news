# Plan – z-server detached launch

## Objective
Allow z-server to launch a server that keeps running after z-server exits

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- z-server/main.js
- z-server/ui/controls/zServerAppControl.js
- z-server/ui/controls/contentAreaControl.js
- z-server/ui/controls/controlPanelControl.js
- z-server/tests/unit/zServerAppControl.scanProgress.test.js

## Risks & Mitigations
- Detached processes lose live stdout/stderr streaming (stdio must be ignore). Mitigation: show a clear “detached mode” note and rely on port detection + open-in-browser.
- Accidental orphan processes if users expect stop-on-quit. Mitigation: default remains non-detached; detached is opt-in via toggle.

## Tests / Validation
- Build renderer bundle: `cd z-server; npm run build`
- Unit tests: `cd z-server; npm run test:unit`
