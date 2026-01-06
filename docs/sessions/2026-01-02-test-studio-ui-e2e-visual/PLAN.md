# Plan – Test Studio UI E2E (Visual)

## Objective
Add a Puppeteer E2E that opens Test Studio UI and visually tracks the 1000-page Guardian crawl rerun end-to-end.

## Done When
- [x] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [x] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [x] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- Added DB-persistence E2E: `tests/e2e-features/guardian-1000-page-crawl-persists-to-db.e2e.test.js`
- Added Test Studio UI rerun coverage:
	- `tests/ui/e2e/test-studio-guardian-1000-db-rerun.puppeteer.e2e.test.js`
	- `src/ui/server/testStudio/server.js` (new rerun button)
- Hardened fixture + crawler fetch runtime:
	- `tests/fixtures/servers/guardianLikeSiteServer.js` (absolute links)
	- `src/crawler/FetchPipeline.js` (Jest-safe fetch fallback; logger.debug safety)

## Risks & Mitigations
- Jest “open handles” warning after the 1000-page crawl test: track the remaining handle(s) and ensure teardown closes everything cleanly.
- 1000-page crawl runtime (~30s) is intentional; keep it isolated as a single E2E (don’t include in broad suites by default).

## Tests / Validation
- DB-backed proof (crawler persists into SQLite):
	- `npm run test:by-path -- tests/e2e-features/guardian-1000-page-crawl-persists-to-db.e2e.test.js`
- Fetch pipeline tests:
	- `npm run test:by-path -- src/crawler/__tests__/FetchPipeline.test.js src/crawler/__tests__/FetchPipeline.validation.test.js`
