# Plan – Fix WYSIWYG demo e2e

## Objective
Stabilize WYSIWYG demo server and Puppeteer test

## Done When
- [x] WYSIWYG demo server starts reliably on a test-configurable port (no EADDRINUSE), with `--check` support retained.
- [x] Puppeteer e2e `tests/ui/e2e/wysiwyg-demo.puppeteer.e2e.test.js` passes locally.
- [x] Notes and commands captured in `WORKING_NOTES.md`; follow-ups logged in `FOLLOW_UPS.md`; summary updated.

## Change Set (initial sketch)
- `src/ui/server/wysiwyg-demo/server.js`
- `tests/ui/e2e/wysiwyg-demo.puppeteer.e2e.test.js`
- `docs/sessions/2025-12-03-wysiwyg-fix/*` (plan/notes/summary/follow-ups)

## Risks & Mitigations
- Port conflicts or dangling servers → add `--stop`/`--status`/env port handling and ensure cleanup in tests.
- E2E timing flakiness → wait for server health check and ensure Puppeteer teardown closes server cleanly.

## Tests / Validation
- `npm run test:by-path tests/ui/e2e/wysiwyg-demo.puppeteer.e2e.test.js`
- `node src/ui/server/wysiwyg-demo/server.js --check`
