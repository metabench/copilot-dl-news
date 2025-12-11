# Working Notes – Retire deprecated suites

- 2025-12-10 — Session created via CLI. Add incremental notes here.
- 2025-12-10 — Added retirement filter to `tests/test-log-history.js` (drops `/deprecated-ui/` older than 14d), updated `jest.careful.config.js` to ignore deprecated UI suites, and refreshed `failing_tests.md` (active vs retired split).
- 2025-12-10 — Reran `test-log-history` after adding `lastAtMs`; JSON now surfaces `retiredFailing` and shows deprecated UI suites as retired.
- 2025-12-10 — Ran `npm run test:by-path tests/tools/__tests__/js-scan.test.js` (passes); reran `test-log-history` to record js-scan as resolved and updated `failing_tests.md`/notes accordingly.
