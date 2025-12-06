# Knowledge Map: Refactoring Coverage

Tracks what areas of the codebase have been refactored and documented.

---


| Area | Status | Session | Notes |
|------|--------|---------|-------|
| `src/crawler/NewsCrawler.js` | 🔄 in-progress | 2025-11-21-crawler-refactor | Factory pattern abandoned, using constructor injection instead |
| `src/crawler/CrawlerFactory.js` | ✅ completed | 2025-11-21-crawler-factory-di | DELETED - Factory pattern abandoned. Use new NewsCrawler(url, options, services) directly. |


**Update 2025-12-03**: src/crawler/NewsCrawler.js → needs-review: 2579 lines. Already uses 25+ injected services via _applyInjectedServices. Next extraction targets: PriorityCalculator (pure, ~150 lines), ProblemResolutionHandler (isolated, ~100 lines), ExitManager (~100 lines). See PATTERNS.md 'Modularize God Class via Service Extraction' for step-by-step approach.