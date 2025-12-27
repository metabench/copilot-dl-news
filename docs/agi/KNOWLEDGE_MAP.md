# Knowledge Map: Refactoring Coverage

Tracks what areas of the codebase have been refactored and documented.

---


| Area | Status | Session | Notes |
|------|--------|---------|-------|
| `src/crawler/NewsCrawler.js` | 🔄 in-progress | 2025-11-21-crawler-refactor | Factory pattern abandoned, using constructor injection instead |
| `src/crawler/CrawlerFactory.js` | ✅ completed | 2025-11-21-crawler-factory-di | DELETED - Factory pattern abandoned. Use new NewsCrawler(url, options, services) directly. |


**Update 2025-12-03**: src/crawler/NewsCrawler.js → needs-review: 2579 lines. Already uses 25+ injected services via _applyInjectedServices. Next extraction targets: PriorityCalculator (pure, ~150 lines), ProblemResolutionHandler (isolated, ~100 lines), ExitManager (~100 lines). See PATTERNS.md 'Modularize God Class via Service Extraction' for step-by-step approach.| `jsgui3: docs discovery + lab experimentation protocol` | ✅ completed | — | Memory updated with: (1) a Lab-First pattern (md-scan → minimal src/ui/lab experiment → check script → manifest/status → promote to guide), (2) an anti-pattern warning against debug-by-guessing, and (3) a dated lesson reinforcing experimentation protocols incl. delegation suite parity when event semantics are touched. |
| `tools/dev/md-scan.js` | ✅ completed | 2025-12-13-emoji-search-md | Added b16/b64 encoded search term decoding and --find-emojis inventory mode; documented workflow and added emoji-encode helper + tests. |
| `tools/dev/emoji-encode.js` | ✅ completed | 2025-12-13-emoji-search-md | New helper CLI to encode/decode emoji text to UTF-8 hex/base64 using codepoints (Windows-safe), with Jest coverage. |
| `docs/guides/JSGUI3_SHARED_CONTROLS_CATALOG.md` | ✅ completed | 2025-12-13-shared-controls-catalog | Added entries for SearchFormControl and MetricCardControl. |
| `src/db` | 🔄 in-progress | 2025-12-14-db-access-simplification | Implemented getDb() singleton and refactored key consumers (WikidataCountryIngestor, GazetteerPriorityScheduler) to use soft dependency injection. |
| `src/crawler` | 🔄 in-progress | 2025-12-14-db-access-simplification | Refactored HierarchicalPlanner, MultiGoalOptimizer, and PredictiveHubDiscovery to use soft dependency injection for DB access. |


**Update 2025-12-14**: src/crawler → completed: Refactored TemporalPatternLearner, AdaptiveExplorer, BudgetAllocator, CrawlStrategyTemplates, TopicHubGapAnalyzer, CityHubGapAnalyzer, RegionHubGapAnalyzer, UrlPatternLearningService, ArticleCache, and CrawlerDb to use soft dependency injection for DB access.| `src/services/StepGate.js + GeoImport step mode control plane` | ✅ completed | 2025-12-21-geo-import-step-mode | Introduced a reusable step-gating primitive and wired Geo Import to support click-to-proceed via awaiting stage + /api/geo-import/next; aligns with Snapshot+SSE+Commands wrapper pattern. |
| `src/crawler/FetchPipeline.js` | ✅ completed | 2025-12-24-puppeteer-fallback-integration | Puppeteer fallback for ECONNRESET on TLS-fingerprinting sites (Guardian, Bloomberg, WSJ). Lazy-loads PuppeteerFetcher, reuses browser, tracks fetchMethod. |
