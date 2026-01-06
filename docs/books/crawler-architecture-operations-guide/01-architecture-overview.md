# Chapter 1: Architecture Overview

## Introduction

The crawler follows a **modular service-oriented architecture with dependency injection**. The key principle is separation of concerns through specialized services that communicate via:

- Constructor-based dependency injection
- Event-based communication (EventEmitter pattern)
- Callback function injection for tight integration points
- Telemetry bridging for monitoring

## Class Hierarchy

```
EventEmitter
    └── Crawler (base lifecycle management)
            └── NewsCrawler (domain-specific orchestration)
```

### Base Crawler Class

**File:** [src/crawler/core/Crawler.js](../../../src/crawler/core/Crawler.js)

The base `Crawler` class provides:

| Responsibility | Methods | Lines |
|---------------|---------|-------|
| Lifecycle hooks | `init()`, `crawl()`, `dispose()` | 124-151, 389-404 |
| Pause/abort control | `pause()`, `resume()`, `isPaused()` | 159-214 |
| Startup tracking | `_trackStartupStage()` | 233-282 |
| Progress emission | `emitProgress()` | 325-347 |
| Rate limiting | `acquireRateToken()` | 359-366 |

**Key Events Emitted:**
- `paused`, `resumed`, `abort-requested`
- `startup-stage`, `startup-complete`, `startup-progress`
- `progress`, `workers-idle`, `disposed`

### NewsCrawler Orchestrator

**File:** [src/crawler/NewsCrawler.js](../../../src/crawler/NewsCrawler.js) (2305 lines)

The `NewsCrawler` extends the base crawler with news-specific functionality:

```javascript
class NewsCrawler extends Crawler {
  constructor(startUrl, options = {}, services = null) {
    super(startUrl, options);
    // Option validation via buildOptions()
    // Service wiring triggered:
    wireCrawlerServices(this, {
      rawOptions: options,
      resolvedOptions: opts
    });
  }
}
```

**Option Schema** (50+ configuration options):
- `jobId`, `slowMode`, `rateLimitMs`, `maxDepth`
- `dataDir`, `concurrency`, `maxQueue`, `maxDownloads`
- `dbPath`, `enableDb`, `preferCache`, `useSitemap`
- `crawlType`, `outputVerbosity`, `skipQueryUrls`

## Service Wiring (IoC Container)

**File:** [src/crawler/CrawlerServiceWiring.js](../../../src/crawler/CrawlerServiceWiring.js) (448 lines)

The `wireCrawlerServices()` function is the central composition root that instantiates and wires all services together.

```javascript
wireCrawlerServices(crawler, { rawOptions = {}, resolvedOptions = {} } = {})
```

### Wiring Phases

Services are organized into phases for orderly initialization:

#### Phase 0: Core State & Configuration (Lines 90-156)

| Service | Purpose | Line |
|---------|---------|------|
| `ArticleSignalsService` | URL/content signal analysis | 90 |
| `EnhancedFeaturesManager` | Feature flagging | 113 |
| `ArticleCache` | Article content caching | 130 |
| `HubFreshnessController` | Hub freshness policies | 131 |
| `PriorityCalculator` | Base priority calculations | 140 |
| `GazetteerManager` | Geographic mode support | 141 |
| `UrlPolicy` | URL filtering policies | 155 |
| `DeepUrlAnalyzer` | Deep URL analysis | 156 |
| `UrlDecisionService` | URL decision caching | 157 |

#### Phase 1: Resilience & Discovery (Lines 169-196)

| Service | Purpose | Configuration |
|---------|---------|---------------|
| `ResilienceService` | Self-monitoring, circuit breaker | Stall: 60s, Heartbeat: 10s, Errors: 5 |
| `ContentValidationService` | Response body validation | |
| `ArchiveDiscoveryStrategy` | Wayback machine discovery | |
| `PaginationPredictorService` | Pagination detection | |

#### Phase 2: JavaScript Rendering (Lines 198-213)

| Service | Purpose | Notes |
|---------|---------|-------|
| `TeacherService` | Puppeteer-based JS rendering | Lazy-loaded, pool size: 2 |

#### Phase 5: Proxy & Rate Limiting (Lines 215-263)

| Service | Purpose |
|---------|---------|
| `ProxyManager` | IP rotation support |
| `DomainThrottleManager` | Per-domain rate limiting |
| `QueueManager` | Priority queue with depth management |

#### Core Processing Pipeline (Lines 262-406)

| Service | Purpose | Line |
|---------|---------|------|
| `RobotsAndSitemapCoordinator` | robots.txt & sitemap handling | 262 |
| `FetchPipeline` | HTTP fetching with retry logic | 297 |
| `PageExecutionService` | Page processing orchestrator | 407 |
| `LinkExtractor` | DOM parsing and link classification | 161 |
| `ArticleProcessor` | Content analysis and persistence | 224 |
| `NavigationDiscoveryService` | Page structure discovery | 225 |
| `ContentAcquisitionService` | Content retrieval wrapper | 226 |

## Dependency Injection Patterns

### Pattern 1: Constructor Functions

```javascript
new LinkExtractor({
  normalizeUrl: (url, ctx) => crawler.normalizeUrl(url, ctx),
  isOnDomain: (url) => crawler.isOnDomain(url),
  looksLikeArticle: (url) => crawler.looksLikeArticle(url)
})
```

### Pattern 2: Service Instance Injection

```javascript
new PageExecutionService({
  fetchPipeline: crawler.fetchPipeline,
  navigationDiscoveryService: crawler.navigationDiscoveryService,
  contentAcquisitionService: crawler.contentAcquisitionService,
  articleProcessor: crawler.articleProcessor,
  // ... 20+ dependencies
})
```

### Pattern 3: Getter Function Injection (Lazy Resolution)

```javascript
new CrawlerEvents({
  getStats: () => crawler.state.getStats(),
  getQueueSize: () => (crawler.queue?.size?.() || 0),
  getCurrentDownloads: () => crawler.state.currentDownloads,
  getDbAdapter: () => crawler.dbAdapter,
  // ... avoids circular dependencies
})
```

### Pattern 4: Callback/Handler Injection

```javascript
new QueueManager({
  emitQueueEvent: (evt) => crawler.telemetry.queueEvent(evt),
  computePriority: (args) => crawler.computePriority(args),
  handlePolicySkip: (decision, info) => crawler._handlePolicySkip(decision, info),
  onRateLimitDeferred: () => crawler.state.incrementCacheRateLimitedDeferred()
})
```

## Event Flow Architecture

### CrawlerEvents Class

**File:** [src/crawler/CrawlerEvents.js](../../../src/crawler/CrawlerEvents.js)

Central event emission hub with dependency getter injection:

```javascript
new CrawlerEvents({
  domain,                              // String identifier
  getStats,                            // () => stats object
  getQueueSize,                        // () => number
  getCurrentDownloads,                 // () => Map<url, info>
  getDomainLimits,                     // () => Map<host, limitState>
  getRobotsInfo,                       // () => { robotsLoaded, ... }
  getSitemapInfo,                      // () => { urls: [], discovered: 0 }
  getFeatures,                         // () => enabled features
  getEnhancedDbAdapter,                // () => adapter
  getProblemClusteringService,         // () => service
  getProblemResolutionService,         // () => service
  getJobId,                            // () => job ID
  isPlannerEnabled,                    // () => boolean
  isPaused,                            // () => boolean
  getGoalSummary,                      // () => goals array
  getQueueHeatmap,                     // () => heatmap data
  getCoverageSummary,                  // () => coverage stats
  logger,                              // console interface
  outputVerbosity                      // verbosity level
})
```

**Event Emission Methods:**

| Method | Purpose | Throttling |
|--------|---------|------------|
| `emitProgress()` | Progress updates | 300ms |
| `emitQueueEvent()` | Queue operations | None |
| `emitEnhancedQueueEvent()` | Enhanced queue events | None |
| `emitProblem()` | Problem tracking | None |
| `emitMilestone()` | Milestone achievements | None |
| `emitMilestoneOnce()` | One-time milestones | Deduplicated |
| `emitPlannerStage()` | Planner state changes | None |
| `emitTelemetry()` | Raw telemetry | None |

## Data Flow Through Pipeline

```
1. enqueueRequest(url)
   ↓
2. QueueManager.enqueue()
   - Evaluates URL eligibility
   - Calculates priority
   - Deduplicates
   ↓
3. PageExecutionService.processPage()
   ↓
4. FetchPipeline.fetch()
   - Applies retry policy
   - Rate limiting
   - Proxy rotation
   - Soft failure handling (Teacher queue)
   ↓
5. NavigationDiscoveryService.discover()
   - LinkExtractor.extract()
   - Classifies links (nav/article/pagination)
   ↓
6. ContentAcquisitionService.acquire()
   ↓
7. ArticleProcessor.process()
   - Readability extraction
   - Signal computation (URL + content)
   - Metadata extraction
   - Database persistence
```

## State Management

**File:** [src/crawler/CrawlerState.js](../../../src/crawler/CrawlerState.js) (652 lines)

Key state structures:

```javascript
{
  // URL tracking
  visited: Set<string>,
  seededHubUrls: Set<string>,
  currentDownloads: Map<url, info>,

  // Caching
  knownArticlesCache: Map,
  articleHeaderCache: Map,
  urlAnalysisCache: Map,
  urlDecisionCache: Map,

  // Metrics
  stats: {
    pagesVisited,
    pagesDownloaded,
    articlesFound,
    articlesSaved,
    errors,
    bytesDownloaded,
    bytesSaved,
    bytesSavedCompressed,
    cacheRateLimitedServed,
    cacheRateLimitedDeferred
  },

  // Site structure
  structure: {
    navPagesVisited,
    articleCandidatesSkipped,
    sectionCounts: Map<section, count>
  },

  // Rate limiting
  domainLimits: Map<host, limitState>,

  // Error tracking
  connectionResetState: Map<url, info>,
  problemCounters: Map,
  problemSamples: Map
}
```

## Error Handling & Resilience

### ErrorTracker
- Connection reset detection and windowing
- Circuit breaker integration
- Problem clustering

### ResilienceService (Lines 170-177)
- Stall detection (60s threshold)
- Heartbeat monitoring (10s interval)
- Circuit breaker (5 errors, 30s reset)

### ProblemResolutionHandler
- Emits problem events
- Triggers remediation workflows

### ExitManager
- Graceful shutdown orchestration
- Telemetry finalization

## Key Method Signatures

| Service | Method | Signature |
|---------|--------|-----------|
| FetchPipeline | fetch | `async fetch({ url, context })` |
| PageExecutionService | processPage | `async processPage({ url, depth, context })` |
| ArticleProcessor | process | `async process({ url, html, fetchMeta, ... })` |
| LinkExtractor | extract | `extract(htmlOrCheerio, options)` |
| NavigationDiscoveryService | discover | `discover({ url, html, depth, ... })` |
| ContentAcquisitionService | acquire | `async acquire({ url, html, fetchMeta, ... })` |
| QueueManager | enqueue | `enqueue({ url, depth, type, meta, priority })` |
| CrawlerEvents | emitProgress | `emitProgress({ force, patch, stage, ... })` |

## Architectural Strengths

1. **Clean Dependency Injection** - Services declare dependencies explicitly
2. **Composition Root Pattern** - `wireCrawlerServices()` centralizes wiring
3. **Event-Driven Updates** - Telemetry/events decouple components
4. **Layered Architecture** - Clear phases (0-5) for feature evolution
5. **Graceful Degradation** - Optional features (Puppeteer, TeacherService) fail safely
6. **Testability** - Services can be mocked/injected for testing
7. **Performance Monitoring** - Extensive telemetry hooks at all levels

## Next Chapter

Continue to [Chapter 2: The Fetch Pipeline](./02-fetch-pipeline.md) to learn about HTTP fetching, fallbacks, and retry mechanisms.
