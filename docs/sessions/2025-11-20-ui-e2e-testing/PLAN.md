# Plan: ui-e2e-testing
Objective: Make the UI Puppeteer coverage easy to run and extend by documenting the workflow, validating the current toggle test, and outlining the next two high-value scenarios to automate.

Done when:
- Current e2e assets (tests/ui/e2e, server bootstrap, fixtures) are inventoried with any gaps captured in the session notes.
- `tests/ui/e2e/url-filter-toggle.puppeteer.e2e.test.js` is executed via the approved runner and its output logged.
- A short, actionable improvement list (new flows, harness tweaks, tooling hooks) is documented along with ownership/follow-ups.
- UI docs (session + hub entry, possibly src/ui/README.md) reflect how to run the Puppeteer suite and reuse its helpers.

Change set:
- docs/sessions/2025-11-20-ui-e2e-testing/PLAN.md
- docs/sessions/2025-11-20-ui-e2e-testing/WORKING_NOTES.md
- docs/sessions/2025-11-20-ui-e2e-testing/SESSION_SUMMARY.md
- docs/sessions/2025-11-20-ui-e2e-testing/FOLLOW_UPS.md
- docs/sessions/SESSIONS_HUB.md (link the new session)
- src/ui/README.md (if new e2e guidance is needed)

Risks/assumptions:
- Puppeteer needs Chromium download; first run could be slow (allow retries and log headless flags).
- In-memory SQLite fixtures must mirror production schema; regressions there will cause flaky tests.
- Tests require the UI bundle; if `npm run ui:client-build` is stale, the hydration logic could break.

Tests:
- npm run test:by-path tests/ui/e2e/url-filter-toggle.puppeteer.e2e.test.js
- (Optional) node tests/run-tests.js e2e-quick once more scenarios exist.

Docs to update:
- docs/sessions/2025-11-20-ui-e2e-testing/*
- docs/sessions/SESSIONS_HUB.md
- src/ui/README.md (section about Puppeteer coverage)
