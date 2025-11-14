# Working Notes — Basic Crawl Health

## Plan: basic-crawl-health
- **Objective**: Confirm whether the basic crawl workflow is currently functional and identify any breakages.
- **Done when**:
  - We gather historical context indicating expected behavior and prior issues.
  - We review the latest telemetry/tests/logs that exercise the basic crawl.
  - We provide a clear statement on operational status plus next actions if problems exist.
- **Change set**: N/A (analysis session only; no code edits planned yet).
- **Risks/Assumptions**: Tooling information may be outdated; crawl may rely on external services we cannot access locally.
- **Tests**: Review existing automated tests (if any) that cover crawl behavior.
- **Docs to update**: This session folder, `docs/sessions/SESSIONS_HUB.md`.

## Scratchpad
- _2025-11-13 10:00_ — Session initialized; pending discovery steps.
- _2025-11-13 10:07_ — Reviewed `crawl.js` CLI entry point and `src/crawler/NewsCrawler.js` to map basic crawl defaults and concurrency behaviour.
- _2025-11-13 10:18_ — Ran `npm run test:by-path src/crawler/__tests__/queueManager.basic.test.js`; exit code 0 confirms queue behaviour for standard crawls passes.
- _2025-11-13 10:25_ — Ran `npm run test:by-path src/crawler/__tests__/queueManager.e2e.test.js`; exit code 0 validates discovery→acquisition pipeline in basic mode.
- _2025-11-13 10:34_ — Ran `npm run test:by-path src/crawler/__tests__/phase-123-integration.test.js`; exit code 0 demonstrates higher-level crawler integration (including default crawl planner) remains healthy.
- _2025-11-13 11:05_ — Added `basicCountryHubDiscovery` sequence preset (starts with `exploreCountryHubs`), switched default CLI/config sequence to it to satisfy directive that basic crawl must not start with ensuring country hubs (superseded later the same day by `basicTopicDiscovery` vs `intelligentCountryHubDiscovery`).
- _2025-11-13 12:42_ — Ran `node crawl.js --start-url https://www.theguardian.com --max-downloads 20`; `exploreCountryHubs` finished first (21 downloads/saves before abort threshold triggered by follow-on ensure step). `ensureCountryHubs` then hit repeated `ECONNRESET` failures and aborted, confirming new sequencing but showing we still need stable outbound connectivity and problem-cluster persistence (see `SqliteError: NOT NULL constraint failed: problem_clusters.job_id`).
- _2025-11-13 12:55_ — Updated CLI availability summary to read `availability.sequencePresets` so `node crawl.js availability --all` now lists the new default sequence alongside other presets.
- _2025-11-13 16:30_ — Split sequencing: new `basicTopicDiscovery` preset (topics + place hubs only) is now the default basic crawl; original country hub exploration stack moved to `intelligentCountryHubDiscovery` for intelligent runs.
- _2025-11-13 17:05_ — Hardened `basicArticleCrawl` defaults so basic runs keep caching (`preferCache`, DB enabled, sitemap) without enabling intelligent planner features.
