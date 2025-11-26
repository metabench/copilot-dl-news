# Crawl.js Startup Process Analysis

This document details the startup sequence of `src/crawl.js`, explaining the operations that contribute to its initialization time. The startup process is compute-intensive and I/O-heavy due to the modular architecture and extensive feature set loaded upfront.

## 1. Module Loading (The "Require" Cascade)

The most significant contributor to initial startup latency is the synchronous loading of the dependency tree. When `node src/crawl.js` is executed, it immediately requires `src/crawler/NewsCrawler.js`, which triggers a cascade of imports.

### Key Dependencies Loaded
- **Core Libraries**: `fs`, `path`, `http`, `https`, `url`, `events`.
- **Third-Party Modules**: 
  - `better-sqlite3` (Native binding, heavy load)
  - `cheerio` (HTML parsing)
  - `robots-parser`
  - `lang-tools`
  - `chalk`
- **Internal Subsystems**:
  - **Database Layer**: `dbClient`, `sqlite`, `EnhancedDatabaseAdapter`.
  - **Planner Suite**: `AdaptiveSeedPlanner`, `IntelligentPlanRunner`, `PatternInference`, `CountryHubPlanner`.
  - **Processing Pipeline**: `ArticleProcessor`, `FetchPipeline`, `LinkExtractor`, `ContentAcquisitionService`.
  - **State Management**: `CrawlerState`, `QueueManager`, `MilestoneTracker`.
  - **Enhanced Features**: `ProblemClusteringService`, `PlannerKnowledgeService`, `CrawlPlaybookService`.

**Impact**: Node.js must parse and compile thousands of lines of JavaScript across dozens of files before a single line of logic executes.

## 2. Configuration Resolution

Before the crawler instantiates, it resolves runtime arguments.

1.  **CLI Argument Parsing**: `src/crawl.js` calls `resolveCliArguments`.
2.  **Config File Discovery**: If no arguments are provided, it looks for `crawl.js.config.json`.
    - Checks `process.cwd()`.
    - Checks project root.
3.  **File I/O**: Reads and parses the JSON configuration file.
4.  **Normalization**: Validates and normalizes arguments (e.g., ensuring `startUrl` is valid).

**Impact**: Minimal, but involves synchronous File I/O.

## 3. Service Instantiation (The Constructor)

Once `NewsCrawler` is instantiated, it synchronously creates instances of its component services. This is a "monolithic" initialization where all potential subsystems are pre-wired, regardless of whether they will be used immediately.

### Services Created in Constructor
- **State Containers**: `CrawlerEvents`, `CrawlerTelemetry`, `ErrorTracker`.
- **Logic Engines**: `UrlPolicy`, `DeepUrlAnalyzer`, `UrlDecisionService`.
- **Pipeline Components**: `LinkExtractor`, `ArticleProcessor`, `NavigationDiscoveryService`.
- **Planners**: `AdaptiveSeedPlanner` (even if not using adaptive mode).
- **Queue**: `QueueManager` (initializes priority queues and buffers).
- **Network Coordinators**: `RobotsAndSitemapCoordinator`, `FetchPipeline`, `DomainThrottleManager`.
- **Enhanced Features**: `EnhancedFeaturesManager` (loads feature flags and sub-services).

**Impact**: High memory allocation and object creation overhead.

## 4. Initialization Phase (`init()` method)

The `init()` method is the first asynchronous phase where heavy I/O occurs.

1.  **Data Directory**: `fs.mkdir` ensures the data directory exists.
2.  **Database Connection**:
    - Opens connection to SQLite (`news.db`).
    - Runs WAL mode configuration (`PRAGMA journal_mode = WAL`).
    - **Gazetteer Mode**: If enabled, runs `ensureGazetteer` which verifies/creates complex schema tables.
3.  **Enhanced Features Init**: Initializes `EnhancedDatabaseAdapter` and other plugins if enabled.
4.  **Hub History**: Hydrates visited hub states from the database (`_hydrateResolvedHubsFromHistory`).
5.  **Robots.txt**:
    - **Network Request**: Fetches `robots.txt` from the target domain.
    - **Parsing**: Parses the rules to configure the `UrlPolicy`.

**Impact**: Significant I/O (Disk + Network). The `robots.txt` fetch is often the first network request and can block subsequent steps.

## 5. Pre-Crawl Sequences

The crawler uses a `SequenceRunner` to orchestrate the startup flow. This adds structure but enforces a sequential execution order.

1.  **Planner Stage** (`_runPlannerStage`):
    - If "Intelligent" mode is active, the `IntelligentPlanRunner` analyzes the domain.
    - May involve database queries to check past performance.
2.  **Sitemap Stage** (`_runSitemapStage`):
    - **Network Requests**: Fetches sitemaps defined in `robots.txt` or standard locations.
    - **Parsing**: XML parsing of sitemaps.
    - **Queueing**: Adds discovered URLs to the queue.
3.  **Seeding**:
    - Adds the `startUrl` to the queue if not already present.

## Summary of Startup Timeline

| Phase | Operation | Type | Impact |
|-------|-----------|------|--------|
| 1 | **Module Loading** | CPU / Disk | High (One-time cost) |
| 2 | **Config Resolution** | Disk I/O | Low |
| 3 | **Constructor** | CPU / Memory | Medium |
| 4 | **Database Init** | Disk I/O | Medium |
| 5 | **Robots.txt** | Network | Variable (Latency dependent) |
| 6 | **Sitemaps/Planning** | Network / CPU | High (Mode dependent) |

## Optimization Opportunities

- **Lazy Loading**: Defer loading of heavy modules (like `better-sqlite3` or specific planners) until they are actually needed.
- **Parallelization**: Fetch `robots.txt` and `sitemaps` in parallel with database initialization.
- **Code Splitting**: Separate the "Geography/Gazetteer" logic from the "News Crawler" logic to reduce the initial bundle size.
