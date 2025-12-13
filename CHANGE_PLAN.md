# Change Plan — Fix offline Jest test (crawl.process)

## Goal
Fix the single failing Jest test in `src/__tests__/crawl.process.test.js` ("uses network when cache is stale under maxAgeMs") so the entire file passes offline and deterministically (no real robots.txt/network).

Non-goals:
- No production crawler behavior changes unless unavoidable.
- No new network dependencies.

## Current Behavior
- `NewsCrawler.init()` loads robots via `this.robotsCoordinator.loadRobotsTxt()`; tests that only override `crawler.loadRobotsTxt` can still trigger real robots fetch.
- The failing test calls `crawler.processPage(startUrl, 0)` with no `context`, which can cause URL policy to skip/refuse fetch decisions.

## Proposed Changes
1. Update `src/__tests__/crawl.process.test.js` failing test to:
   - Stub `crawler.robotsCoordinator` *before* `await crawler.init()` with a minimal no-network coordinator.
   - Provide a deterministic `crawler.fetchPipeline.fetchFn` mock that returns fixed HTML.
   - Call `processPage` with a valid `context` containing `type` (e.g., `nav`) and `allowRevisit`.
   - Configure crawler options for quiet/fast execution (`rateLimitMs: 0`, disable network/fetch logging if supported).
2. Run focused Jest for only that file.
3. Record commands + root-cause note in session working notes.

## Risks & Unknowns
- `NewsCrawler.init()` may overwrite `robotsCoordinator`; if so, we may need to stub a factory/service injection instead.
- `processPage` may require additional context fields depending on current URL policy.

## Integration Points
- `NewsCrawler.init()` robots stage (`robotsCoordinator.loadRobotsTxt`).
- `NewsCrawler.processPage()` delegates to `pageExecutionService.processPage({url, depth, context})`.
- `FetchPipeline` network path via `fetchFn`.

## Docs Impact
- Update `docs/sessions/2025-12-12-crawler-reliability/WORKING_NOTES.md` with commands run and a brief note on the fix.

## Focused Test Plan
- Run only `src/__tests__/crawl.process.test.js` via `npm run test:by-path src/__tests__/crawl.process.test.js`.

## Rollback Plan
- Revert the single test file change (and notes) on this branch; no production code changes expected.

Branch: `chore/plan-crawler-offline-test`
