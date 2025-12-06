# Session Plan — Crawler Factory DI (2025-11-21)

## Status: CLOSED (2025-12-03)

**Outcome**: Factory pattern abandoned in favor of direct constructor injection.

See ADR: `docs/decisions/2025-12-03-remove-crawler-factory.md`

## Original Objective
Introduce dependency-injection friendly wiring for `NewsCrawler` and route factory consumers through the new pathway without regressing existing entry points.

## Original Done When
- [x] `NewsCrawler` constructor supports injected service bundles and exposes reusable wiring helper(s).
- [x] `CrawlerFactory.create` instantiates crawlers in DI mode and reuses shared wiring logic.
- [x] Existing facade helpers (`createCrawlerFactory`) default to the real factory and no longer construct `NewsCrawler` directly.
- [x] Focused tests cover the factory behaviour.

## Final Resolution (2025-12-03)

After analysis, the factory was found to be unnecessary:
- `NewsCrawler` already supports `constructor(url, options, services)` with `_applyInjectedServices()`
- The factory just wrapped this existing capability
- Factory deleted, consumers updated to use `new NewsCrawler()` directly

**Files Changed**:
- ❌ Deleted: `src/crawler/CrawlerFactory.js`
- ❌ Deleted: `src/crawler/__tests__/CrawlerFactory.test.js`
- ✅ Updated: `src/crawler/cli/runLegacyCommand.js`
- ✅ Updated: `src/crawler/operations/facadeUtils.js`
- ✅ Updated: `tools/examples/news-crawler-example.js`
- ✅ Updated: `src/crawler/cli/__tests__/runLegacyCommand.test.js`

## Anti-Pattern Learned

**Factory That Just Wraps Constructor**: When a factory has a single `create()` method that just calls `new Target()`, it adds indirection without value. Check for existing DI support before introducing new patterns.
