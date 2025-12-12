# Plan – Art Playground: Fix fill undo/redo E2E

## Objective
Make property edit undo/redo work reliably and keep Puppeteer E2E green

## Done When
 [x] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
 [x] Tests and validations are captured in `WORKING_NOTES.md`.
 [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.
 [x] `tests/ui/e2e/art-playground.puppeteer.e2e.test.js` passes.
 [x] Bundle rebuild step is recorded (to avoid stale `/client.bundle.js`).

## Change Set (initial sketch)
 `tests/ui/e2e/art-playground.puppeteer.e2e.test.js`
 `docs/sessions/2025-12-11-art-playground-undo-e2e-fix/WORKING_NOTES.md`
 `docs/sessions/2025-12-11-art-playground-undo-e2e-fix/SESSION_SUMMARY.md`
 (Optional follow-up) test harness / server code to enforce bundle freshness

## Risks & Mitigations
 Risk: E2E exercises bundled client JS; code changes won’t take effect until `client.bundle.js` is rebuilt.
  - Mitigation: rebuild bundle before the E2E run, or add an automated freshness check/rebuild step.

## Tests / Validation
 Build bundle: `node scripts/build-art-playground-client.js`
 Targeted E2E: `npm run test:by-path tests/ui/e2e/art-playground.puppeteer.e2e.test.js`
