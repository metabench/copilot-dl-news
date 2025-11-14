# Plan: ui-data-explorer-prod-tests

Objective: Ensure every Data Explorer view (/urls, /domains, /crawls, /errors, and targeted drilldowns) renders without runtime errors by exercising them against the production-sized SQLite snapshot and fixing any regressions surfaced by the new coverage.

Done when:
- Remaining UI errors are reproduced and captured in the session working notes with enough detail to diagnose them quickly.
- Jest/SuperTest coverage exists for the Data Explorer views that can point at `data/news.db`, skipping gracefully when production data is unavailable.
- The new tests run on this workstation, exposing (and then validating) the actual HTML output for each route without runtime errors.
- Any regressions uncovered by the tests are fixed (code + tests) or tracked as explicit follow-ups.

Change set:
- `docs/sessions/2025-11-20-ui-data-explorer-tests/` (plan, working notes, follow-ups/summary as the session proceeds).
- `tests/ui/server/` (new production-data-aware suites plus helpers for optional DB loading).
- `src/ui/server/dataExplorerServer.js` and related helpers if new regressions require fixes.
- Supporting utilities under `src/ui/controls/` or `src/db/sqlite/v1/queries/ui/` as bugs are uncovered.

Risks/assumptions:
- `data/news.db` may not exist or may be too large for fast local tests—need skip logic and clear messaging to avoid noisy CI failures.
- Some queries may expect cached metrics or tables that do not exist in the local snapshot; tests must surface these gaps with actionable errors rather than silent failures.
- Running the Express server with production data could be slow; prefer SuperTest + direct DB connections instead of spinning up the full CLI unless necessary.

Tests:
- Extend `npm run test:by-path -- tests/ui/server/dataExplorerServer.test.js` with production-data coverage (possibly a new file like `dataExplorerServer.production.test.js`).
- Re-run any impacted suites plus the new production-data tests once fixes are in place.

Benchmark:
- Not applicable unless we discover performance regressions; capture any notable latency differences in working notes.

Docs to update:
- `docs/sessions/2025-11-20-ui-data-explorer-tests/WORKING_NOTES.md` for ongoing findings.
- Add a summary and follow-ups in the same session folder once work completes; update `docs/sessions/SESSIONS_HUB.md` to reference this session.
