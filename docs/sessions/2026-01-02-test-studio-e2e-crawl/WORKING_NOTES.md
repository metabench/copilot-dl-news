# Working Notes – Test Studio E2E: Test Studio runs crawl E2E

- 2026-01-02 — Clarified requirement: this must be a **meta-E2E** where Test Studio triggers the crawl E2E via `/api/test-studio/rerun`, and the test asserts the run is visible via `/api/test-studio/runs`.
- Plan: start with 5-page crawl (fast smoke), then 100-page crawl.

Validation (planned):
- `npm run test:by-path tests/e2e-features/test-studio-rerun-guardian-crawl.e2e.test.js`
