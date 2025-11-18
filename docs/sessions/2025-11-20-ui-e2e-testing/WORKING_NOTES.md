# Working Notes: 2025-11-20 UI E2E Testing

## 09:00 Kickoff
- Reviewed AGENTS.md, GitHub Copilot instructions, and UI Singularity mode requirements.
- Created this session folder with plan + notes for the UI e2e mandate.

## 09:10 Discovery Checklist
- ✅ Located existing automation under `tests/ui/e2e/url-filter-toggle.puppeteer.e2e.test.js`; uses Puppeteer, mocks `openNewsDb`, seeds better-sqlite3 in-memory DB, and boots `createDataExplorerServer` for `/urls`.
- ✅ Read `tests/run-tests.js` + `test-config.json` to confirm `e2e` and `e2e-quick` suites already exist; UI test currently run via `npm run test:by-path`.
- ✅ Captured entry points in `src/ui/README.md` (already lists the Puppeteer command, but lacks troubleshooting + fixture guidance—candidate for doc update).
- Pending: record js-scan/js-edit usage if code changes become necessary (not required yet).

## 09:20 Test Runs
- 10:15 `npm run test:by-path tests/ui/e2e/url-filter-toggle.puppeteer.e2e.test.js`
	- Exit code: 1 (FAIL). Runtime ≈14.6s.
	- Failure: `TimeoutError: Waiting failed: 10000ms exceeded` while waiting for `.filter-toggle` data attributes + table rows to reflect fetched-only state.
	- Observed console noise from `Data_Model_View_Model_Control` logging (binding plugin). Need deterministic wait strategy (event hook or diagnostics) to avoid 10s polling window.

## 09:30 Improvement Backlog
- Draft items:
	1. **Stabilize toggle e2e** by waiting on the `copilot:urlFilterToggle` success event (already emitted via `emitUrlFilterDebug`) instead of DOM polling; assert payload meta directly.
	2. **Shared fixture helper** under `tests/ui/e2e/helpers/db.js` to create + seed SQLite tables (URLs, fetches, domains) so upcoming tests share logic rather than re-implementing `buildInMemoryDb`.
	3. **Scenario queue**: (a) Home card diagnostics (ensure CLI/server parity), (b) Pager buttons (first/prev disabled vs enabled), (c) Domain summary sort order.
	4. **CI guard**: add `node tests/run-tests.js e2e-quick` to regular gate once suite stabilizes; until then document manual smoke step in README.

## 09:40 Follow-ups
- Pending: translate backlog into concrete follow-ups + owners after consensus on scope.
