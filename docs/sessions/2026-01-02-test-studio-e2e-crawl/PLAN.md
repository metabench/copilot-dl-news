# Plan – Test Studio E2E: Test Studio runs crawl E2E

## Objective
Add deterministic E2E where **Test Studio** triggers a crawl E2E run (not a direct crawl test), starting with a 5-page smoke, then 100 pages, then scaling to 1000 downloads/pages using a Guardian-like fixture crawl.

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

Additional done criteria:
- [ ] A Jest E2E test starts Test Studio, calls `/api/test-studio/rerun`, and verifies the new run appears in `/api/test-studio/runs` and contains the expected passing test result.
- [ ] Crawl fixture is deterministic and offline (local server, no real Guardian network calls).
- [ ] Scale steps exist: 5 pages (smoke), 100 pages (requirement), 1000 pages (scale).

## Change Set (initial sketch)
- tests/fixtures/servers/guardianLikeSiteServer.js (local Guardian-like pages)
- tests/helpers/guardianFixtureCrawl.js (shared crawl helper)
- tests/e2e-features/guardian-5-page-crawl.e2e.test.js
- tests/e2e-features/guardian-100-page-crawl.e2e.test.js
- tests/e2e-features/guardian-1000-page-crawl.e2e.test.js
- tests/e2e-features/test-studio-rerun-guardian-crawl.e2e.test.js (meta-E2E)
- docs/sessions/2026-01-02-test-studio-e2e-crawl/test-studio-e2e-flow.svg

## Risks & Mitigations
- Risk: Test Studio disk import throttling hides new run briefly → Mitigate by polling with >=1500ms interval.
- Risk: child processes hang (server/jest) → Mitigate with timeouts + SIGTERM cleanup.
- Risk: shared `data/test-results` pollution → Mitigate by asserting “new run not in initial set” instead of exact runId.

## Tests / Validation
- `npm run test:by-path tests/e2e-features/test-studio-rerun-guardian-crawl.e2e.test.js`
- Optional: `npm run test:by-path tests/e2e-features/guardian-100-page-crawl.e2e.test.js`
