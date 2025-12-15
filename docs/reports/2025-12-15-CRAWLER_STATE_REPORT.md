# Crawler State Report

**Date**: 2025-12-15  
**Status**: Current assessment of news crawler subsystem  
**Audience**: Developers, AI agents, and stakeholders

---

## Executive Summary

The crawler subsystem (`src/crawler/`) is the heart of this project—a sophisticated news acquisition system with **259 JavaScript files**, **87 test files**, and a 4-phase improvement roadmap. Phase 1 ("Foundation") is **100% complete** with 90+ passing tests across four new services. The system supports multiple crawl modes (basic, intelligent, gazetteer/geography), real-time telemetry, and advanced planning capabilities.

**Key Metrics:**
- **Total Files**: 259 JS files in `src/crawler/`
- **Test Coverage**: 87 test files with Phase 1 adding 90 new tests
- **NewsCrawler Size**: 2,260 lines (down from 2,579 after modularization)
- **Phase 1 Progress**: 4/4 items complete ✅
- **Phase 2-4 Progress**: 0/10 items (pending)

---

## Architecture Overview

### Class Hierarchy

```
EventedCrawlerBase (lang-tools Evented_Class adapter)
    └── Crawler (src/crawler/core/Crawler.js, ~400 lines)
            └── NewsCrawler (src/crawler/NewsCrawler.js, ~2,260 lines)
```

### Core Components

| Component | Location | Lines | Purpose |
|-----------|----------|-------|---------|
| **NewsCrawler** | `NewsCrawler.js` | ~2,260 | Main orchestrator, mode selection, sequence execution |
| **Crawler** | `core/Crawler.js` | ~400 | Base lifecycle, rate limiting, startup tracking |
| **FetchPipeline** | `FetchPipeline.js` | ~1,123 | HTTP fetching, caching, validation hooks |
| **QueueManager** | `QueueManager.js` | — | URL prioritization and queue management |
| **CrawlerServiceWiring** | `CrawlerServiceWiring.js` | ~345 | Dependency injection for 25+ services |

### Service Injection Architecture

NewsCrawler uses constructor injection via `_applyInjectedServices()` and `wireCrawlerServices()`. The wiring function instantiates and connects:

- **Core Services**: ArticleSignals, EnhancedFeatures, Cache, HubFreshnessController
- **Discovery Services**: UrlPolicy, DeepUrlAnalyzer, UrlDecisionService, LinkExtractor
- **Processing Services**: ArticleProcessor, ContentAcquisitionService, NavigationDiscoveryService
- **Telemetry Services**: CrawlerEvents, CrawlerTelemetry, MilestoneTracker
- **Phase 1 Services**: ResilienceService, ContentValidationService, ArchiveDiscoveryStrategy, PaginationPredictorService

---

## Roadmap Progress

### Phase 1: Foundation (The "Tenacious" Crawler) ✅ COMPLETE

**Status**: All 4 items implemented with 90+ tests  
**Spec**: [RELIABLE_CRAWLER_PHASE_1_SPEC.md](../designs/RELIABLE_CRAWLER_PHASE_1_SPEC.md)

| Component | Tests | Description |
|-----------|-------|-------------|
| **ResilienceService** | 16 | Heartbeat monitoring, circuit breakers per domain, network/DB diagnostics, graceful suicide |
| **ContentValidationService** | 16 | Garbage detection ("Please enable JS"), hard/soft failure classification |
| **ArchiveDiscoveryStrategy** | 25 | Sitemap parsing, `/archive` path detection, date pattern recognition |
| **PaginationPredictorService** | 33 | Query param (`?page=N`) and path (`/page/N`) pagination detection |

**Integration Points**:
- FetchPipeline now calls `resilienceService.recordActivity()` on every fetch
- ContentValidation hooks into post-download flow for garbage rejection
- Archive/Pagination services wired but pending full integration with UrlDecisionOrchestrator

### Phase 2: Hybrid Architecture (The "Smart" Crawler) ⏳ NOT STARTED

**Status**: 0/5 items complete  
**Design**: [HYBRID_CRAWLER_ARCHITECTURE.md](../designs/HYBRID_CRAWLER_ARCHITECTURE.md)

| Item | Status | Description |
|------|--------|-------------|
| Puppeteer Integration | ⬜ | Add optional `src/teacher/` module for headless rendering |
| Visual Analyzer | ⬜ | Identify article content via bounding boxes, font sizes |
| Skeleton Hash | ⬜ | L1 (template) and L2 (structural) fingerprinting |
| Structure Miner | ⬜ | Batch clustering to identify boilerplate vs content |
| Signature Storage | ⬜ | `layout_signatures` and `layout_templates` tables |

**Key Concept**: Teacher/Worker Model
- **Worker (Fast Path)**: Static `fetch` + `cheerio` for bulk crawling
- **Teacher (Smart Path)**: Puppeteer for layout learning and template generation
- Pages are fingerprinted; known layouts use templates, unknown pages queue for Teacher analysis

### Phase 3: Feedback & Quality (The "Self-Correcting" Crawler) ⏳ NOT STARTED

| Item | Status | Description |
|------|--------|-------------|
| Visual Diff Tool | ⬜ | Compare Readability vs Visual extraction side-by-side |
| Confidence Scoring | ⬜ | Tag articles with extraction confidence; low → re-queue |
| Golden Set Testing | ⬜ | User-defined "golden" extractions for regression prevention |

### Phase 4: Scale & Distribution (The "Industrial" Crawler) ⏳ NOT STARTED

| Item | Status | Description |
|------|--------|-------------|
| Proxy Rotation | ⬜ | Integration with proxy providers for hard sites |
| Distributed Queues | ⬜ | Move beyond SQLite (Redis/Postgres) for multi-machine |

---

## Current Capabilities

### Crawl Modes

1. **Basic Mode**: Simple URL following, Readability extraction
2. **Intelligent Mode**: Planner-driven, country hub discovery, pattern learning
3. **Gazetteer/Geography Mode**: Wikidata integration, place-focused crawling
4. **Structure-Only Mode**: Discover site structure without downloading content

### Planning Systems

Two parallel planning architectures exist:

| System | Location | Status |
|--------|----------|--------|
| **Legacy Planner** | `src/crawler/planner/` | Active, pattern-based |
| **Advanced Planning Suite (APS)** | `src/planner/` | Optional, GOFAI reasoning |

The `IntelligentPlanningFacade` provides a unified interface:
```javascript
// Legacy system
new IntelligentPlanningFacade({ useAPS: false, ... })

// Advanced Planning Suite
new IntelligentPlanningFacade({ useAPS: true, ... })
```

### Telemetry & Observability

- **CrawlerTelemetry**: Event emission for progress, milestones, errors
- **CrawlTelemetryBridge**: Normalizes crawler events to standard schema
- **TelemetryIntegration**: SSE broadcast for UI consumption
- **MilestoneTracker**: Achievement tracking (first article, 100th URL, etc.)

### Sequence System

The crawler supports declarative crawl sequences:
- `SequenceRunner` executes operation chains
- Operations include: `CrawlCountryHubsHistoryOperation`, `FindPlaceAndTopicHubsOperation`, `ExploreCountryHubsOperation`, etc.
- Sequence configs live in `config/crawl-sequences/`

---

## Recent Refactoring Progress

### DB Access Simplification (Dec 2025)

Completed soft dependency injection across 10+ services:
- `HierarchicalPlanner`, `MultiGoalOptimizer`, `PredictiveHubDiscovery`
- `TemporalPatternLearner`, `AdaptiveExplorer`, `BudgetAllocator`
- `CrawlStrategyTemplates`, `TopicHubGapAnalyzer`, `CityHubGapAnalyzer`
- `RegionHubGapAnalyzer`, `UrlPatternLearningService`, `ArticleCache`

Pattern used:
```javascript
class Service {
  constructor(options = {}) {
    this._db = options.db || null;
  }
  _getDb() {
    return this._db || require('../db').getDb();
  }
}
```

### Factory Pattern Abandoned

`CrawlerFactory.js` was **deleted**—the factory pattern was redundant since NewsCrawler already supported dependency injection via `_applyInjectedServices()`.

### Utility Extraction

- `safeCall(fn, fallback)` utility for fire-and-forget callbacks
- `safeCallAsync(fn, fallback)` for async equivalents
- `safeHostFromUrl(url)` for defensive URL parsing

---

## Known Issues & Technical Debt

### From FOLLOW_UPS across sessions:

1. **Telemetry Integration Gap**: Real crawl entrypoints need verification that `TelemetryIntegration.connectCrawler()` is called for SSE event flow
2. **Hub Freshness Config**: `maxAgeHubMs` not exposed in `crawl-runner.json` schema
3. **latest_fetch Table Staleness**: Table may show outdated fetch status; needs backfill mechanism
4. **UrlDecisionOrchestrator Integration**: Phase 1 discovery services wired but triggers pending in orchestrator

### Code-Level TODOs:

```javascript
// IntelligentPlanningFacade.js line 15
// TODO (future refactoring):
// - Consolidate legacy planner into single directory with modular structure
// - Extract shared utilities between legacy and APS
// - Consider deprecation timeline for legacy system
```

---

## 5+ Further Improvement Opportunities

### 1. **Puppeteer Teacher Module** (Phase 2 Priority)

**Problem**: Static HTML analysis cannot handle JS-rendered content or accurately identify article boundaries on complex layouts.

**Solution**: Implement `src/teacher/` module with:
- Visual bounding box analysis for content detection
- Screenshot-based template learning
- Skeleton hashing for page fingerprinting

**Benefit**: Dramatically improve extraction quality on JS-heavy news sites.

### 2. **Extraction Confidence Scoring**

**Problem**: No way to know if extracted content is complete/accurate until human review.

**Solution**: Score each extraction based on:
- Text-to-boilerplate ratio
- Presence of expected metadata (date, author)
- Match against known layout template
- Paragraph count and structure

**Benefit**: Auto-queue low-confidence extractions for Teacher analysis or human review.

### 3. **Incremental Sitemap Processing**

**Problem**: Large sitemaps (100k+ URLs) are processed in batch, causing memory spikes.

**Solution**: 
- Stream sitemap parsing with backpressure
- Checkpoint progress for resume-on-failure
- Process in configurable batch sizes

**Benefit**: Handle enterprise-scale sitemaps without memory issues.

### 4. **Domain-Specific Rate Limiting Profiles**

**Problem**: Single global rate limit doesn't account for per-site tolerance.

**Solution**: 
- Learn optimal request rates per domain from 429/503 responses
- Persist learned rates in database
- Auto-adjust based on time-of-day patterns

**Benefit**: Maximize throughput per domain without triggering blocks.

### 5. **Robots.txt Directive Caching with TTL**

**Problem**: Robots.txt is re-fetched too frequently for active domains.

**Solution**:
- Cache robots.txt with configurable TTL (default: 24h)
- Store in SQLite with `fetched_at` timestamp
- Background refresh for high-priority domains

**Benefit**: Reduce overhead HTTP requests, faster crawl startup.

### 6. **Content Deduplication Pipeline**

**Problem**: Same article appears on multiple URLs (canonical, AMP, mobile versions).

**Solution**:
- Compute content hash at extraction time
- Check against existing hashes before storage
- Link duplicate URLs to single canonical article

**Benefit**: Reduce storage waste, improve article uniqueness.

### 7. **Adaptive Concurrency**

**Problem**: Fixed concurrency setting doesn't respond to system load or target site conditions.

**Solution**:
- Monitor response latencies and error rates
- Dynamically scale workers up/down
- Implement "slow start" for new domains

**Benefit**: Optimal resource utilization without manual tuning.

---

## File Reference

### Key Files

| File | Purpose |
|------|---------|
| [NewsCrawler.js](../../src/crawler/NewsCrawler.js) | Main crawler implementation |
| [CrawlerServiceWiring.js](../../src/crawler/CrawlerServiceWiring.js) | Service injection |
| [FetchPipeline.js](../../src/crawler/FetchPipeline.js) | HTTP fetching |
| [ResilienceService.js](../../src/crawler/services/ResilienceService.js) | Phase 1 resilience |
| [ContentValidationService.js](../../src/crawler/services/ContentValidationService.js) | Phase 1 validation |

### Documentation

| Document | Purpose |
|----------|---------|
| [RELIABLE_CRAWLER_ROADMAP.md](../goals/RELIABLE_CRAWLER_ROADMAP.md) | 4-phase roadmap |
| [RELIABLE_CRAWLER_PHASE_1_SPEC.md](../designs/RELIABLE_CRAWLER_PHASE_1_SPEC.md) | Phase 1 specification |
| [HYBRID_CRAWLER_ARCHITECTURE.md](../designs/HYBRID_CRAWLER_ARCHITECTURE.md) | Teacher/Worker design |
| [ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md](../ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md) | System overview |

---

## Recommendations for Next Steps

1. **Complete Phase 1 Integration**: Wire ArchiveDiscoveryStrategy and PaginationPredictorService triggers into UrlDecisionOrchestrator
2. **Start Phase 2**: Begin with Puppeteer integration as a dev-dependency
3. **Address Telemetry Gap**: Verify SSE flow works end-to-end for live crawl monitoring
4. **Consolidate Planners**: Establish deprecation timeline for legacy planner vs APS

---

*Generated by Knowledge Consolidator Prime mode*
