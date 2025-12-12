# Working Notes – Crawler reliability improvements

- 2025-12-12 — Session created via CLI. Add incremental notes here.

- 2025-12-12 — RetryCoordinator reliability patch
	- Command: `npm run test:by-path src/__tests__/retry-coordinator.test.js`
		- Result: PASS (exit code 0; verified via `echo "EXIT:$LASTEXITCODE"`)
	- Command: `npm run test:by-path src/__tests__/crawl.process.test.js`
		- Result: PASS (exit code 0)
		- Notes: Fixed offline/deterministic behavior by stubbing `crawler.robotsCoordinator` (not `crawler.loadRobotsTxt`) before `await crawler.init()`, and by calling `processPage(url, depth, { type: 'nav', allowRevisit: true })` so URL policy doesn't skip due to missing context. Also disabled the `NewAbstractionsAdapter` shadow-mode `setInterval` in this unit test and ensured `crawler.close()` runs to prevent Jest open-handle hangs.

- 2025-12-12 — Make `crawl.process` tests fully offline
	- Command: `npm run test:by-path src/__tests__/crawl.process.test.js`
		- Result: PASS
		- Notes: Updated the robots stub to set crawler-level fields (`robotsTxtLoaded/robotsRules/sitemapUrls`) inside `robotsCoordinator.loadRobotsTxt()` to guarantee `await crawler.init()` never hits the network.
