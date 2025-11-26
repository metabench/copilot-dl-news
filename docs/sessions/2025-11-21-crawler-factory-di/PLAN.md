# Session Plan — Crawler Factory DI (2025-11-21)

## Objective
Introduce dependency-injection friendly wiring for `NewsCrawler` and route factory consumers through the new pathway without regressing existing entry points.

## Done When
- [x] `NewsCrawler` constructor supports injected service bundles and exposes reusable wiring helper(s).
- [x] `CrawlerFactory.create` instantiates crawlers in DI mode and reuses shared wiring logic.
- [x] Existing facade helpers (`createCrawlerFactory`) default to the real factory and no longer construct `NewsCrawler` directly.
- [x] Focused tests cover the factory behaviour.

## Refactoring Tasks
- [x] **NewsCrawler Wiring Extraction**
  - [x] Store resolved crawler options for reuse.
  - [x] Extract wiring into `wireCrawlerServices` helper and support injected services.
  - [x] Provide `_applyInjectedServices` to hydrate skip-wired instances.
- [x] **Factory Integration**
  - [x] Update `CrawlerFactory` to build crawlers in skip-wiring mode and invoke the helper.
  - [x] Point `createCrawlerFactory` fallback to the new `CrawlerFactory`.
- [x] **Validation**
  - [x] Add a mocked Jest suite ensuring the factory invokes `NewsCrawler` with `_skipWiring` and delegates to the helper.
  - [x] Run the targeted test with `npm run test:by-path src/crawler/__tests__/CrawlerFactory.test.js`.

## Risks / Unknowns
- Requires careful parity between helper wiring and legacy constructor path.
- Injected services currently expect a large surface area; future refactors may shrink the list.

## Follow-Ups
- Migrate CLI entry points and tests to consume `CrawlerFactory.create` directly (beyond facade usage).
- Audit `_applyInjectedServices` to accept structured bundles rather than property bags.
