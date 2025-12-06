# ADR: Remove CrawlerFactory in Favor of Direct Constructor Injection

**Date**: 2025-12-03  
**Status**: Accepted  
**Deciders**: AI Agent (Careful Refactor Brain)  
**Related Sessions**: `docs/sessions/2025-11-21-crawler-factory-di/`

## Context

The `CrawlerFactory` was introduced as part of a dependency injection initiative to:
1. Decouple crawler construction from configuration wiring
2. Enable testability through injected services
3. Provide a consistent entry point for crawler instantiation

After implementation and analysis, we discovered:
- **`NewsCrawler` already supports constructor injection**: The constructor accepts a third `services` parameter and the `_applyInjectedServices()` method handles service injection natively.
- **The factory adds indirection without value**: `CrawlerFactory.create(config)` essentially wraps `new NewsCrawler(url, options)` with `_skipWiring: true` and then calls the same wiring helper.
- **Consumer confusion**: Multiple entry points (`new NewsCrawler()`, `CrawlerFactory.create()`, `createCrawlerFactory()`) for the same operation.

## Decision

**Remove `CrawlerFactory.js`** and use `new NewsCrawler(url, options, services)` directly.

The `NewsCrawler` constructor already implements the dependency injection pattern:
```javascript
constructor(url, options = {}, services = null) {
  // ...
  const hasInjectedServices = services && typeof services === 'object';
  const shouldSkipWiring = Boolean(options._skipWiring) || hasInjectedServices;
  if (shouldSkipWiring) {
    if (hasInjectedServices) {
      this._applyInjectedServices(services);
    }
    return;
  }
  // ... normal wiring
}
```

## Changes Made

1. **Deleted**: `src/crawler/CrawlerFactory.js`
2. **Deleted**: `src/crawler/__tests__/CrawlerFactory.test.js`
3. **Updated**: `src/crawler/cli/runLegacyCommand.js` — uses `new NewsCrawler(startUrl, options)` directly
4. **Updated**: `src/crawler/operations/facadeUtils.js` — `createCrawlerFactory()` now returns a function that uses `new NewsCrawler()` directly
5. **Updated**: `tools/examples/news-crawler-example.js` — demonstrates direct constructor usage
6. **Updated**: `src/crawler/cli/__tests__/runLegacyCommand.test.js` — removed CrawlerFactory mock, tests NewsCrawler directly

## Consequences

### Positive
- **Simpler mental model**: One way to create crawlers (`new NewsCrawler()`)
- **Less code to maintain**: Removed ~30 lines of factory code + tests
- **Clearer injection path**: `new NewsCrawler(url, options, services)` for DI
- **No behavioral change**: All existing code works identically

### Negative
- None identified. The factory was a pure wrapper with no unique logic.

### Neutral
- `createCrawlerFactory()` facade helper remains for backward compatibility but now creates `NewsCrawler` directly
- Entry points (`crawl-place-hubs.js`, `intelligent-crawl.js`) already use `new NewsCrawler()` and require no changes

## Anti-Pattern Documented

**Factory That Just Wraps Constructor**: When a factory class has a single `create()` method that just calls `new Target()` with slightly different argument ordering, the factory adds indirection without value. Prefer constructor injection directly.

## Follow-Ups

- Consider documenting the `services` parameter in `NewsCrawler` JSDoc more prominently
- Future refactors should assess existing DI support before introducing new patterns
