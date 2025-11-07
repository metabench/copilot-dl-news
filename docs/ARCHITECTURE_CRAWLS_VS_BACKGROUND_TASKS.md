# Architecture: Crawls vs Background Tasks

**Date**: October 10, 2025  
**Status**: Architectural Clarification  
**When to Read**: ⭐ START HERE when working with crawls or background tasks. Essential for understanding the two-system architecture, their distinct purposes, and shared infrastructure. Read before implementing new crawl types or background task types.

---

## Executive Summary

This project has **two distinct but complementary systems** for executing work:

1. **Crawls** (Foreground) - Real-time web crawling operations with live progress tracking
2. **Background Tasks** (Background) - Long-running maintenance, analysis, and data processing operations

While they share some infrastructure (telemetry, progress tracking, SSE broadcasting), they serve different purposes, have different lifecycles, and are managed by separate systems.

---

## System Comparison

| Aspect | Crawls (Foreground) | Background Tasks (Background) |
|--------|---------------------|-------------------------------|
| **Purpose** | Fetch content from websites | Process/analyze existing data |
| **Manager** | `CrawlOrchestrationService` + `JobRegistry` | `BackgroundTaskManager` |
| **Location** | `src/crawler/` + `src/ui/express/services/` | `src/background/` |
| **Execution** | Child processes (node spawn) | In-process tasks with workers |
| **Primary Use** | News site crawling, sitemap discovery | Compression, analysis, exports |
| **User Interaction** | High - monitored actively | Low - runs unattended |
| **Duration** | Minutes to hours | Hours to days |
| **Restart Behavior** | Manual restart required | Auto-resume on server restart |
| **Database Tables** | `crawl_jobs`, `queue_events` | `background_tasks` |
| **API Prefix** | `/api/crawl`, `/api/crawls` | `/api/background-tasks` |
| **UI Page** | `/crawls` (crawls list) | `/background-tasks.html` |

---

## 1. Crawls (Foreground System)

### Purpose

Crawls are **real-time operations** that fetch content from external websites. They are the "foreground" of the system - the primary user-facing activity that populates the database with articles.

### Examples

- Crawling a news website (BBC, CNN, etc.)
- Discovering sitemaps and RSS feeds
- Fetching geography data from Wikidata
- Following links from hub pages
- Seeding queue from country/topic hubs

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Crawls System                        │
│                        (Foreground)                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐                                           │
│  │ User clicks  │                                           │
│  │ "Start Crawl"│                                           │
│  └──────┬───────┘                                           │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────────────────────────────┐                  │
│  │  POST /api/crawl                     │                  │
│  │  • Validates URL                     │                  │
│  │  • Creates crawl_job record          │                  │
│  │  • Spawns child process              │                  │
│  └──────────┬───────────────────────────┘                  │
│             │                                                │
│             ▼                                                │
│  ┌─────────────────────────────────────────────┐           │
│  │  CrawlOrchestrationService                   │           │
│  │  • Validates can start (JobRegistry)         │           │
│  │  • Builds arguments from options             │           │
│  │  • Spawns node child process                 │           │
│  │  • Creates job descriptor                    │           │
│  │  • Records start in database                 │           │
│  └─────────────┬───────────────────────────────┘           │
│                │                                             │
│                ▼                                             │
│  ┌───────────────────────────────────────────┐             │
│  │  JobRegistry + IntelligentCrawlerManager  │             │
│  │  • Tracks running jobs (Map<jobId, job>)  │             │
│  │  • Manages job state and metrics          │             │
│  │  • Collects achievements and milestones   │             │
│  │  • Provides job summaries                 │             │
│  └─────────────┬───────────────────────────────┘           │
│                │                                             │
│                ▼                                             │
│  ┌───────────────────────────────────────────┐             │
│  │  JobEventHandlerService                   │             │
│  │  • Attaches stdout/stderr/exit handlers   │             │
│  │  • Parses structured output               │             │
│  │  • Updates job state                      │             │
│  │  • Records events in database             │             │
│  │  • Broadcasts progress via SSE            │             │
│  └─────────────┬───────────────────────────────┘           │
│                │                                             │
│                ▼                                             │
│  ┌───────────────────────────────────────────┐             │
│  │  Child Process (src/crawl.js)             │             │
│  │  • FetchPipeline - HTTP requests          │             │
│  │  • QueueManager - URL prioritization      │             │
│  │  • LinkExtractor - Parse HTML             │             │
│  │  • ArticleProcessor - Extract content     │             │
│  │  • Writes to database                     │             │
│  │  • Emits PROGRESS/MILESTONE/TELEMETRY     │             │
│  └───────────────────────────────────────────┘             │
│                                                              │
│  Database Tables:                                           │
│  • crawl_jobs (id, status, started_at, config)             │
│  • queue_events (job_id, event_type, data)                 │
│  • articles (crawled content)                               │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Crawler Base Class Architecture (Nov 2025)

**Location:** `src/crawler/core/Crawler.js` (≈375 lines) plus `src/crawler/core/EventedCrawlerBase.js` (adapter)

**Purpose:** Provides reusable crawl lifecycle infrastructure backed by an `Evented_Class` adapter so subclasses retain familiar EventEmitter-style listeners while unlocking richer event tooling.

#### Event Adapter (Nov 2025)

`EventedCrawlerBase` extends `lang-tools`' `Evented_Class`, adding Node-compatible helpers (`emit`, `once`, `addListener`, `removeListener`, `off`) and preserving method chaining. `Crawler` now derives from this adapter, so existing listener code continues to work and new Evented_Class capabilities can be introduced incrementally. The adapter returns `true/false` from `emit` to mirror Node semantics.

#### Responsibilities

| Category | Features |
|----------|----------|
| **Lifecycle** | Init hook, crawl entry point (abstract), dispose cleanup |
| **State Management** | CrawlerState integration, pause/resume/abort control |
| **Startup Tracking** | Stage tracking via StartupProgressTracker, telemetry emission |
| **Progress** | Throttled progress events with state stats |
| **Rate Limiting** | Global request spacing (acquireRateToken) |
| **Worker Orchestration** | Busy worker counting, workers-idle detection |
| **Networking** | HTTP/HTTPS keep-alive agents |

#### Events Emitted

- `paused` / `resumed` / `abort-requested` - Control flow state changes
- `startup-stage` - Stage lifecycle: started/completed/skipped/failed
- `startup-complete` - All startup stages finished
- `startup-progress` - Startup progress updates
- `progress` - Crawler progress with stats (throttled to 5s default)
- `workers-idle` - All concurrent workers finished
- `disposed` - Cleanup complete

#### Creating Custom Crawlers

```javascript
const Crawler = require('./core/Crawler');

class MyCrawler extends Crawler {
  constructor(startUrl, options) {
    super(startUrl, options);
    
    // Initialize domain-specific services
    this.myQueue = [];
    this.myService = new MyService();
  }

  async init() {
    // Use _trackStartupStage for progress tracking
    await this._trackStartupStage('db-connect', 'Connect to database', async () => {
      this.dbAdapter = await openDatabase();
      return { status: 'completed', message: 'Connected' };
    });
    
    await this._trackStartupStage('load-config', 'Load configuration', async () => {
      this.config = await loadConfig();
      return { status: 'completed' };
    });
  }

  async crawl() {
    await this.init();
    
    while (!this.isAbortRequested() && this.myQueue.length > 0) {
      // Pause handling
      while (this.isPaused() && !this.isAbortRequested()) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Rate limiting
      await this.acquireRateToken();
      
      const item = this.myQueue.shift();
      await this.processItem(item);
      
      // Progress emission (throttled)
      this.emitProgress({ queueSize: this.myQueue.length });
    }
    
    await this.dispose();
  }
}
```

#### NewsCrawler Extension

`src/crawler/NewsCrawler.js` (2,490 lines) extends `Crawler` with:

- **News-specific initialization:** Robots.txt coordination, sitemap loading, intelligent planner, gazetteer controllers, enhanced features
- **Orchestration:** Sequential loop, concurrent workers, intelligent plan execution
- **Overrides:** pause() with queue clearing, requestAbort() with fatal issue tracking, _trackStartupStage() with custom telemetry events

**Integration verified (2025-11-17):** NewsCrawler instantiates correctly, inherits state/startupTracker/httpAgent from base class, all existing tests pass.

#### Testing

**Test files:**
- `src/crawler/core/__tests__/EventedCrawlerBase.test.js`
- `src/crawler/core/__tests__/Crawler.test.js`

Coverage:
- Constructor initialization (state, startup tracker, HTTP agents, options)
- Pause/resume/abort control with event emission
- Startup stage tracking (success/skip/fail paths)
- Progress emission with throttling
- Rate limiting enforcement
- Worker orchestration and idle detection
- Lifecycle hooks (init, crawl abstract method)
- Cleanup (HTTP agent destruction, database closure)
- Evented_Class adapter integration (emit/once/addListener/removeListener aliases)
- `src/crawler/core/__tests__/Crawler.test.js` (lifecycle + event integration)

**Validation:**
```bash
# Run Crawler base class tests
npx jest --config jest.careful.config.js src/crawler/core/__tests__/Crawler.test.js --bail=1
# Output: 25/25 tests passing

# Verify NewsCrawler integration
node -e "const NewsCrawler = require('./src/crawler/NewsCrawler'); const crawler = new NewsCrawler('https://example.com'); console.log('Extends Crawler:', crawler instanceof require('./src/crawler/core/Crawler'));"
# Output: Extends Crawler: true
```

### High-Level Crawl Operations (Nov 2025)

- `src/crawler/CrawlOperations.js` provides a thin façade over `NewsCrawler`, exposing pre-configured operations (`ensureCountryHubs`, `exploreCountryHubs`, `crawlCountryHubHistory`, `crawlCountryHubsHistory`, `findTopicHubs`, `findPlaceAndTopicHubs`).
npx jest --config jest.careful.config.js --runTestsByPath \
  src/crawler/core/__tests__/EventedCrawlerBase.test.js \
  src/crawler/core/__tests__/Crawler.test.js --bail=1 --maxWorkers=50%
- Each operation maps to a curated option preset (hub-only structure passes, intelligent planner modes, history refresh) and returns structured status objects with stats and elapsed time.
- `executeSequence()` accepts an ordered list of operation names (or objects) and orchestrates multi-step crawl algorithms with optional error continuation, enabling concise scripting like:
  ```javascript
# Crawl CLI smoke (validates adapter wiring through legacy surfaces)
node src/crawl.js --help > tmp/crawl-help.txt
node src/tools/crawl-operations.js --list-operations --json > tmp/crawl-operations.json
  const { CrawlOperations } = require('../crawler/CrawlOperations');
  const ops = new CrawlOperations();
  await ops.executeSequence([
    'ensureCountryHubs',
    { operation: 'exploreCountryHubs', overrides: { plannerVerbosity: 2 } },
    'findTopicHubs'
  ], { startUrl: 'https://example.com', continueOnError: false });
  ```
- Consumers can override defaults or inject custom `crawlerFactory` implementations (useful for tests) while production code lazily loads `NewsCrawler` only when needed.

### CLI Module Architecture (Phase 3 - Nov 2025)

The legacy CLI (`src/crawl.js`) has been modularized into focused, testable components living in `src/crawler/cli/`:

**Module Structure:**

| Module | Purpose | Responsibilities | Test Coverage |
|--------|---------|------------------|---------------|
| `bootstrap.js` | Environment setup | Verbose mode, console interception, global flag management, teardown | 9/9 tests |
| `argumentNormalizer.js` | Flag parsing | 30+ CLI flag normalization, database path resolution, geography parsing, JSON validation | 3/3 tests |
| `progressReporter.js` | Output formatting | CLI logger factory, geography progress formatting, color/icon constants, verbose mode toggle | 58/58 tests |
| `progressAdapter.js` | Event routing | TELEMETRY/MILESTONE/PROGRESS interception, suppressed prefix filtering, console restoration | Tested via integration |
| `runLegacyCommand.js` | Orchestration | Composes bootstrap/normalizer/reporter, handles --help, instantiates NewsCrawler, manages lifecycle | 20/20 tests |

**Entry Points:**

- **`src/crawl.js`** (35 lines): Thin shim delegating to `runLegacyCommand` when `require.main === module`. Exports `NewsCrawler`, `runLegacyCommand`, and `HELP_TEXT` for programmatic reuse.
- **`src/tools/crawl-operations.js`**: High-level CLI following CliArgumentParser/CliFormatter patterns, surfaces `CrawlOperations` façade with `--list-operations`, `--list-sequences`, ASCII/JSON output, and `--db-path` playbook integration.

**Workflow:**

```javascript
// src/crawl.js minimal entry
async function main() {
  const { exitCode = 0 } = await runLegacyCommand({
    argv: process.argv.slice(2),
    stdin: process.stdin,
    stdout: console.log,
    stderr: console.error
  });
  process.exit(exitCode);
}

// runLegacyCommand orchestration
async function runLegacyCommand({ argv, stdin, stdout, stderr }) {
  const log = createCliLogger({ stdout, stderr });
  const { verboseModeEnabled, restoreConsole } = setupLegacyCliEnvironment({ args: argv, log });
  
  const { startUrl, options, sequenceConfig } = normalizeLegacyArguments(argv, { log });
  
  if (sequenceConfig) {
    return await NewsCrawler.loadAndRunSequence({ ...sequenceConfig, defaults: options, logger: log });
  }
  
  const crawler = new NewsCrawler(startUrl, options);
  await crawler.crawl();
  restoreConsole();
  return { exitCode: 0 };
}
```

**Rationale:**

- **Testability**: Each module can be tested in isolation with mocked dependencies (90/90 tests passing).
- **Reusability**: CLI logger, argument normalization, and progress formatting now available to other entry points (e.g., `crawl-operations.js`).
- **Maintainability**: Clear separation of concerns—bootstrap handles environment, normalizer handles flags, reporter handles output, orchestrator composes them.
- **Backward Compatibility**: Existing `node src/crawl.js` usage unchanged; legacy export structure preserved (`module.exports = NewsCrawler`, `.default`, `.runLegacyCommand`, `.HELP_TEXT`).

**Validation:**

```bash
# Smoke test help
node src/crawl.js --help

# Run all CLI module tests
npx jest --config jest.careful.config.js src/crawler/cli/__tests__/ --bail=1 --maxWorkers=50%
# Output: 90/90 tests passing (argumentNormalizer: 3, bootstrap: 9, progressReporter: 58, runLegacyCommand: 20)
```

### Sequence Config System

**Purpose:** Load declarative crawl sequences from version-controlled YAML/JSON files, resolve host-specific tokens (`@playbook.*`, `@config.*`, `@cli.*`), and orchestrate multi-step crawl workflows.

| Module | Purpose | Location | Tests |
|--------|---------|----------|-------|
| `SequenceConfigLoader` | Locate, parse, validate, resolve tokens in config files | `src/orchestration/` | 6/6 tests |
| `SequenceConfigRunner` | Execute loaded configs through CrawlOperations.executeSequence | `src/orchestration/` | 3/3 tests |
| `createSequenceResolvers` | Pluggable resolvers for @playbook/@config tokens | `src/orchestration/` | 2/2 tests |
| `sequenceResolverCatalog` | Token namespace catalog and documentation | `src/orchestration/` | - |

**Config Location:** `config/crawl-sequences/`

**Supported Formats:** JSON, YAML, YML

**Resolution Order:** `<name>.<host>.json` → `<name>.json` → `default.json`

**Token Namespaces:**
- `@playbook.*` — Host-specific data from CrawlPlaybookService (e.g., `@playbook.primarySeed`)
- `@config.*` — Project config from ConfigManager/priority-config.json
- `@cli.*` — Command-line overrides passed during invocation

**Config Structure:**
```yaml
# config/crawl-sequences/example.yaml
version: "1"
host: news-example-com  # Optional, enables host-specific selection
startUrl: "@playbook.primarySeed"  # Resolver token
sharedOverrides:
  maxDepth: 2
  retries: 3
steps:
  - operation: EnsureCountryHubsOperation
    startUrl: "@config.seedUrl"  # Step-specific override
    overrides:
      limit: 100
    continueOnError: true
  - operation: ExploreCountryHubsOperation
  - FindTopicHubsOperation  # String shorthand
```

**Usage:**
```javascript
// Via NewsCrawler static method
const result = await NewsCrawler.loadAndRunSequence({
  sequenceConfigName: 'example',
  configHost: 'news-example-com',
  configDir: 'config/crawl-sequences',
  defaults: { maxPages: 500 },
  logger: console
});

// Via CrawlOperations facade
const ops = new CrawlOperations();
const { runSequenceConfig } = require('../orchestration/SequenceConfigRunner');
const { createSequenceConfigLoader } = require('../orchestration/SequenceConfigLoader');
const { createSequenceResolverMap } = require('../orchestration/createSequenceResolvers');

const loader = createSequenceConfigLoader({ configDir: './config/crawl-sequences' });
const { resolvers, cleanup } = createSequenceResolverMap({
  configHost: 'news-example-com',
  defaults: { maxPages: 500 }
});

await runSequenceConfig({
  facade: ops,
  loader,
  sequenceConfigName: 'example',
  configHost: 'news-example-com',
  resolvers
});
cleanup();
```

**Validation:**
```bash
# Test sequence config modules
npx jest --config jest.careful.config.js src/orchestration/__tests__/SequenceConfigLoader.test.js src/orchestration/__tests__/SequenceConfigRunner.test.js src/orchestration/__tests__/createSequenceResolvers.test.js
# Output: 11/11 tests passing

# Load and validate a config (dry-run)
node -e "const { createSequenceConfigLoader } = require('./src/orchestration/SequenceConfigLoader'); const loader = createSequenceConfigLoader({ configDir: './config/crawl-sequences' }); loader.loadDryRun({ sequenceName: 'example' }).then(r => console.log(r.ok ? 'Valid' : r.error.message));"
```

**Documentation:** `config/crawl-sequences/README.md` (config format guide)

### Hub Freshness Control Refactor Plan *(Planning — November 2025)*

**Objective:** Give crawl operations precise control over when to bypass cached HTML so hub pages (front pages, country/topic hubs) can be refreshed with the latest markup before downstream acquisition runs.

#### Current Constraints
- `FetchPipeline._tryCache` forces cache usage whenever the request context sets `forceCache` or when QueueManager routes a `rateLimitedHost` flag; callers cannot override this for hubs that need fresh HTML.
- `QueueManager` does not persist fetch-policy metadata alongside queued URLs, so operations cannot request network-first behavior when enqueuing hubs.
- Hub refresh attempts compete with acquisition URLs in the same priority queues, making it hard to guarantee a freshness pass finishes before article crawling resumes.
- Telemetry only reports whether a page came from cache, without exposing intent (e.g., “hub forced network”), limiting visibility into stale content incidents.

#### Proposed Architecture
- **FetchPolicy enum:** Introduce a compact `fetchPolicy` field (values: `cache-preferred`, `network-first`, `cache-only`) that travels with queue entries and per-request contexts.
- **Queue metadata propagation:** Extend `QueueManager.enqueue()` to accept an optional policy and persist it with the queued item. Dequeue operations should attach the policy to the worker context so FetchPipeline can honor it.
- **FetchPipeline policy handling:** Update `_tryCache` and network fetch logic to respect the requested policy—`network-first` hits the network unless the host is blacked out, `cache-only` skips network fallbacks, and `cache-preferred` retains current behavior. When DomainThrottleManager reports a blackout, downgrade to cache with a milestone noting the fallback.
- **Hub refresh orchestration:** Add a dedicated `HubRefreshOperation` (and sequence preset) that re-enqueues hub URLs with `network-first` policy, throttles concurrency, and verifies that newly fetched HTML outranks cached timestamps before releasing acquisition work.
- **Telemetry & analytics:** Emit structured telemetry (`FETCH_POLICY_DECISION`) capturing requested policy, actual source (cache/network), and whether DomainThrottleManager forced a downgrade. Surface summaries in CrawlOperations results so operators see freshness coverage.
- **Safeguards:** Preserve DomainThrottleManager authority—if a host is in blackout, the operation must respect backoff and fall back to cache or defer the hub until a retry window opens.

#### Configuration & Defaults
- **Centralized configuration:** Add a `hubFreshness` block to `priority-config.json` (surfaced via ConfigManager) with keys such as `maxCacheAgeMs`, `firstPageMaxAgeMs`, and `refreshOnStartup`. Provide typed accessor helpers to avoid scattering option lookup logic.
- **Default thresholds:** Set `maxCacheAgeMs` to 10 minutes (600000 ms) so any hub older than that is re-downloaded before being processed. `firstPageMaxAgeMs` defaults to the same value but can be tuned per environment; if a crawl starts and the primary start URL exceeds the threshold, FetchPipeline must fetch it from the network immediately.
- **Platform SDK integration:** Expose configuration through the forthcoming crawl platform layer (`platform.hubs.getPolicy()`) so operations request freshness without duplicating config wiring.
- **Operational overrides:** Support CLI/sequence overrides that map directly to the configuration keys while emitting validation warnings if they diverge from centralized defaults.

#### Implementation Roadmap
1. **Policy plumbing:** Add policy enum definition, update `QueueManager.enqueue/dequeue`, and thread policy through worker contexts without altering default behavior (`cache-preferred`).
2. **FetchPipeline updates:** Modify `_tryCache` and `_performNetworkFetch` to read the policy, emit telemetry, and downgrade safely when throttled. Add guardrails to prevent policy misuse (e.g., throwing if `network-first` is requested for off-domain URLs).
  - *2025-11-18 update:* NewsCrawler now consumes ConfigManager `hubFreshness` settings to tag hub queue items with `network-first` policy, per-page cache-age ceilings, and fallback preferences.
3. **HubRefreshOperation:** Implement a new operation (and preset) that performs a freshness pass before acquisition. Responsibilities include seeding hub URLs, adjusting concurrency, recording freshness metrics, and optionally re-queuing hub URLs when markup changes.
4. **Sequence integration:** Update sequence presets/config loaders so operators can insert the refresh step (e.g., `ensureCountryHubsFresh`) before article exploration. Support `fetchPolicy` overrides inside config files.
5. **Telemetry & docs:** Extend CrawlOperations result payloads and CLI formatter to summarize policy usage. Document the workflow here and in CLI guides.

#### Validation & Rollout
- Unit tests for `QueueManager` policy storage and FetchPipeline decision matrix.
- Integration tests (Jest) using stubbed HTTP responses to assert `HubRefreshOperation` triggers network fetches and records freshness deltas.
- CLI smoke test: `node src/tools/crawl-operations.js --operation hubRefresh --start-url <hub>` hitting a mocked stack to verify end-to-end policy flow.
- Staged rollout: enable policy-aware refresh in configuration-driven sequences first; keep legacy CLI defaulting to cache-preferred until monitoring confirms stability.

#### Open Questions
- Should freshness passes compare HTTP `Last-Modified`/ETag values or rely solely on crawl timestamps?
- Do we need a persistence trail for failed freshness attempts (e.g., storing last network fetch result per hub) to inform future retries?
- How aggressively should `HubRefreshOperation` retry after blackouts—immediate requeue with exponential backoff, or defer to scheduled runs?

### Crawl Platform Layer Vision *(Discovery — November 2025)*

**Intent:** Shrink per-crawl code surfaces by introducing a unified platform that handles lifecycle wiring, queue management, telemetry, and policy enforcement while exposing a concise SDK for domain logic.

#### Platform Layers
- **Core Runtime:** Builds on `Crawler` base class, publishing stable hooks for startup stages, fetch pipeline interaction, and domain throttling. Provides dependency container (queue adapters, fetch policy manager, telemetry bus) that operations can request without manual wiring.
- **Operation SDK:** High-level API (`platform.hubs.refresh`, `platform.links.enqueue`, `platform.telemetry.track`) that composes common crawl behaviors. Exposes declarative helpers (e.g., describing hub targets, filters, retry strategy) that compile down to runtime actions.
- **Sequence Integration:** Enhances `SequenceRunner` and config loader to understand SDK steps, allowing configuration files to reference platform primitives (`run: hubRefresh`, `after: acquireArticles`).
- **Extensibility Surface:** Plugin interface for domain-specific enrichers (e.g., Guardian-specific parser) with lifecycle hooks (beforeFetch, afterParse) protected by capability flags.

#### Benefits
- **Smaller code surfaces:** Domain operations describe intent using SDK calls instead of orchestrating queue/fetch logic manually.
- **Consistency:** Telemetry, milestones, and error handling flow through platform defaults, reducing per-operation variance.
- **Testability:** SDK functions can be unit-tested with mocked platform runtime, avoiding end-to-end crawler setup for simple operations.

#### Example Flow
```javascript
module.exports = async function guardianFrontPage(platform) {
  await platform.hubs.refresh({
    startUrl: 'https://www.theguardian.com',
    fetchPolicy: 'network-first',
    telemetryTag: 'guardian-front-page'
  });

  await platform.articles.acquire({
    seed: 'https://www.theguardian.com/world',
    maxPages: 200,
    allowRevisit: false
  });
};
```

#### Next Steps
1. Draft capability matrix mapping existing services to platform APIs (Task 5.1).
2. Define SDK contract (methods, events, error semantics) and document migration strategy for existing operation classes.
3. Prototype a thin adapter that lets `CrawlOperations` invoke platform functions while preserving current tests.
4. Update CLI and telemetry layers to recognize platform-generated events automatically (no manual wiring).

#### Considerations
- Maintain escape hatches so advanced operations can access underlying services when necessary.
- Ensure platform lifecycle honors DomainThrottleManager and FetchPolicy decisions from Hub Freshness initiative.
- Keep SDK functions composable (promise-based) to align with async sequencing in existing façade.

### Key Characteristics

1. **Child Process Execution**: Each crawl runs in a separate Node.js child process spawned from the main server
2. **Live Progress**: Emits structured events (PROGRESS, MILESTONE, TELEMETRY) parsed by parent
3. **Interactive**: Users actively monitor crawl progress via SSE stream
4. **Network I/O Bound**: Spends most time waiting for HTTP responses
5. **Pause/Resume**: Via stdin/stdout communication with child process
6. **Lifecycle**: Created → Running → Paused/Resumed → Completed/Failed

### Crawl Types

Implemented in `src/crawler/`:
- **Standard News Crawl** - Follow links, extract articles
- **Sitemap Discovery** - Parse XML sitemaps
- **Hub-Based Crawl** - Start from hub pages (countries, topics)
- **Geography Ingestion** - Wikidata/OSM gazetteer data (via ingestors in `src/crawler/gazetteer/ingestors/`)

### Management

- **Coordinator**: `CrawlOrchestrationService` (validates, builds args, spawns processes)
- **State & Metrics**: `JobRegistry` + `IntelligentCrawlerManager` (job lifecycle, achievements, summaries)
- **Event Handling**: `JobEventHandlerService` (structured output parsing, SSE broadcast)
- **API**: `src/ui/express/routes/api.crawl.js`, `api.crawls.js`
- **UI**: `/crawls` page with real-time progress bars
- **Routing**: Job events broadcast to all SSE clients watching `/events`

---

## 2. Background Tasks (Background System)

### Purpose

Background tasks are **long-running maintenance operations** that process data already in the database. They are the "background" of the system - supporting infrastructure that keeps the system optimized and enriched.

### Examples

- Compressing article HTML (Brotli/Gzip)
- Running analysis on articles (places, topics, quality)
- Exporting database to JSON/NDJSON
- Importing gazetteer data
- Vacuuming database for space reclamation
- Bucket compression (grouping similar content)

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Background Tasks System                    │
│                       (Background)                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐                                           │
│  │ User creates │                                           │
│  │ task via UI  │                                           │
│  └──────┬───────┘                                           │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────────────────────────────┐                  │
│  │  POST /api/background-tasks          │                  │
│  │  • Validates task type & config      │                  │
│  │  • Creates background_tasks record   │                  │
│  │  • Returns taskId                    │                  │
│  └──────────┬───────────────────────────┘                  │
│             │                                                │
│             ▼                                                │
│  ┌─────────────────────────────────────────────┐           │
│  │  BackgroundTaskManager                       │           │
│  │  • Task registry (taskType → TaskClass)     │           │
│  │  • Active tasks (Map<taskId, instance>)     │           │
│  │  • Progress tracking & throttling            │           │
│  │  • Pause/resume with AbortController         │           │
│  │  • Auto-resume paused tasks on startup       │           │
│  │  • Broadcasts events via SSE                 │           │
│  └─────────────┬───────────────────────────────┘           │
│                │                                             │
│                ▼                                             │
│  ┌───────────────────────────────────────────┐             │
│  │  Task Instances (in-process)              │             │
│  │                                            │             │
│  │  CompressionTask:                          │             │
│  │  • Reads articles in batches              │             │
│  │  • Sends to worker pool OR main thread    │             │
│  │  • Writes compressed content               │             │
│  │  • Emits progress every N articles         │             │
│  │                                            │             │
│  │  AnalysisTask:                             │             │
│  │  • Analyzes article content                │             │
│  │  • Extracts places, topics, quality        │             │
│  │  • Awards milestones                       │             │
│  │  • Updates analysis_runs table             │             │
│  │                                            │             │
│  │  (Future: ExportTask, ImportTask, etc.)   │             │
│  └───────────────────────────────────────────┘             │
│                                                              │
│  Worker Pool (optional):                                    │
│  • Parallel compression workers                             │
│  • CPU-intensive operations offloaded                       │
│                                                              │
│  Database Tables:                                           │
│  • background_tasks (id, task_type, status, progress_*)    │
│  • compression_results (if compression)                     │
│  • analysis_runs (if analysis)                              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Key Characteristics

1. **In-Process Execution**: Tasks run in the same Node.js process as the server (not spawned)
2. **Database-Driven**: Operates on data already in the database
3. **Unattended**: Runs with minimal user supervision once started
4. **CPU/Disk I/O Bound**: Compression, analysis, database queries
5. **Pause/Resume**: Via AbortController signals, persisted progress state
6. **Lifecycle**: Pending → Resuming → Running → Paused/Completed/Failed
7. **Auto-Resume**: Automatically resumes paused tasks on server restart

### Task Types

Implemented in `src/background/tasks/`:
- **CompressionTask** - Compress article HTML with Brotli/Gzip
- **AnalysisTask** - Analyze article content for places, topics, quality
- **(Future)** ExportTask, ImportTask, VacuumTask, BucketCompressionTask

### Management

- **Manager**: `BackgroundTaskManager` (EventEmitter with task registry)
- **API**: `src/ui/express/routes/api.background-tasks.js`
- **UI**: `/background-tasks.html` page with task cards
- **Worker Pool**: Optional parallel worker threads for CPU-intensive tasks

---

## Shared Infrastructure

While crawls and background tasks are separate systems, they **share common patterns and infrastructure**:

### 1. Telemetry System

Both systems emit telemetry events for observability:

```javascript
// Common telemetry structure
{
  event: 'milestone' | 'progress' | 'problem' | 'queue',
  ts: '2025-10-10T12:00:00.000Z',
  severity: 'info' | 'warning' | 'error',
  message: 'Human-readable description',
  details: { /* context-specific data */ }
}
```

**Crawls**: Emit via structured stdout (MILESTONE, PROGRESS, TELEMETRY lines)  
**Background Tasks**: Emit via `_telemetry()` method, broadcast through SSE

### 2. Progress Tracking

Both systems track progress with similar metrics:

```javascript
// Common progress structure
{
  current: 50,        // Items processed
  total: 100,         // Total items
  percentage: 50,     // Calculated percentage
  message: 'Processed 50/100 articles'
}
```

**Crawls**: Progress stored in `queue_events` table, broadcast via PROGRESS events  
**Background Tasks**: Progress stored in `background_tasks` table columns, broadcast via SSE

### 3. SSE Broadcasting

Both systems broadcast real-time updates to connected clients:

```javascript
// SSE broadcast function (shared)
function broadcast(eventType, data) {
  sseClients.forEach(client => {
    client.write(`event: ${eventType}\n`);
    client.write(`data: ${JSON.stringify(data)}\n\n`);
  });
}
```

**Crawls**: Broadcast `job-progress`, `job-milestone`, `job-error` events  
**Background Tasks**: Broadcast `task-progress`, `task-status-changed`, `task-completed` events

### 4. Pause/Resume

Both systems support pausing and resuming work:

**Crawls**: 
- Pause: Send 'PAUSE\n' to child process stdin
- Resume: Send 'RESUME\n' to child process stdin
- State tracked in `crawl_jobs.paused` boolean

**Background Tasks**:
- Pause: Call `AbortController.abort()`, save progress to DB
- Resume: Load saved progress, continue execution
- State tracked in `background_tasks.status` enum

### 5. Database Schema

Both systems persist state to the database:

**Crawl Tables**:
```sql
CREATE TABLE crawl_jobs (
  id TEXT PRIMARY KEY,
  status TEXT,
  started_at TEXT,
  config TEXT
);

CREATE TABLE queue_events (
  id INTEGER PRIMARY KEY,
  job_id TEXT,
  event_type TEXT,
  data TEXT
);
```

**Background Task Tables**:
```sql
CREATE TABLE background_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_type TEXT,
  status TEXT CHECK(status IN ('pending', 'resuming', 'running', 'paused', 'completed', 'failed', 'cancelled')),
  progress_current INTEGER,
  progress_total INTEGER,
  progress_message TEXT,
  config TEXT,
  metadata TEXT,
  created_at TEXT,
  started_at TEXT,
  updated_at TEXT,
  completed_at TEXT,
  resume_started_at TEXT
);
```

---

## When to Use Which System

### Use **Crawls** When:

✅ You need to **fetch content from external websites**  
✅ You need **real-time progress monitoring** during execution  
✅ The operation is **network I/O bound** (waiting for HTTP responses)  
✅ You need **interactive pause/resume** (via stdin/stdout)  
✅ The operation is **user-initiated and time-sensitive**  
✅ You want to **spawn isolated child processes**  

**Examples**:
- Crawl BBC News for recent articles
- Discover all sitemaps on a domain
- Fetch Wikidata entries for all countries
- Follow links from a country hub page

### Use **Background Tasks** When:

✅ You need to **process data already in the database**  
✅ The operation can **run unattended** for hours/days  
✅ The operation is **CPU or disk I/O bound** (compression, analysis)  
✅ You want **automatic resume on server restart**  
✅ You need **worker pool parallelization**  
✅ The operation is **maintenance or optimization**  

**Examples**:
- Compress 100,000 articles with Brotli
- Analyze article content for places and topics
- Export entire database to NDJSON
- Vacuum database to reclaim space
- Group similar articles into compression buckets

---

## Integration Points

Despite being separate systems, crawls and background tasks **can interact**:

### 1. Geography Crawl as Background Task

**Problem**: Geography ingestion (WikidataCountryIngestor) is technically a "crawl" (fetches external data) but benefits from background task infrastructure (long-running, auto-resume).

**Solution**: Geography ingestion runs as a **background task** that internally uses **crawler ingestors**:

```javascript
// GeographyTask wraps WikidataCountryIngestor
class GeographyTask {
  constructor({ db }) {
    this.ingestor = new WikidataCountryIngestor({ db });
  }
  
  async execute({ signal, emitProgress }) {
    // Use ingestor's execute() method
    return await this.ingestor.execute({ signal, emitProgress });
  }
}

// Registered with BackgroundTaskManager
backgroundTaskManager.registerTaskType('geography-ingest', GeographyTask, { db });
```

This is a **hybrid**: Uses crawler ingestors (`src/crawler/gazetteer/ingestors/`) but runs via BackgroundTaskManager.

### 2. Post-Crawl Analysis

**Workflow**: After a crawl completes, automatically trigger analysis as a background task:

```javascript
// In crawl completion handler
crawlerManager.on('job-completed', async (jobId) => {
  const crawl = db.prepare('SELECT * FROM crawl_jobs WHERE id = ?').get(jobId);
  
  // Create analysis task for crawled articles
  const taskId = backgroundTaskManager.createTask('analysis-run', {
    analysisVersion: 1,
    domainLimit: 1,  // Analyze just this domain
    filter: { crawlJobId: jobId }
  });
  
  await backgroundTaskManager.startTask(taskId);
});
```

### 3. Shared Telemetry Database

Both systems write to the same `query_telemetry` table for cost estimation:

```javascript
// Both crawls and tasks use instrumented DB
const db = wrapWithTelemetry(rawDb, { trackQueries: true });

// All queries tracked for QueryCostEstimatorPlugin
db.prepare('SELECT * FROM articles').all(); // Recorded in query_telemetry
```

---

## Anti-Patterns to Avoid

### ❌ Don't Mix Concerns

**Wrong**: Creating a "crawl" that compresses articles  
**Right**: Crawl populates articles → background task compresses them

**Wrong**: Creating a background task that fetches URLs  
**Right**: Crawl fetches URLs → background task processes them

### ❌ Don't Confuse the UIs

**Wrong**: Showing background tasks on `/crawls` page  
**Right**: `/crawls` for crawls, `/background-tasks.html` for tasks

**Wrong**: Using `/api/crawl` for background tasks  
**Right**: `/api/crawl` for crawls, `/api/background-tasks` for tasks

### ❌ Don't Duplicate Infrastructure

**Wrong**: Creating separate telemetry systems  
**Right**: Both use shared telemetry with different event types

**Wrong**: Creating separate progress tracking  
**Right**: Both emit progress events, different tables/broadcast channels

---

## Future Enhancements

### Planned Background Tasks

- **ExportTask** - Export database to various formats
- **ImportTask** - Import gazetteer data from files
- **VacuumTask** - Database maintenance and optimization
- **BucketCompressionTask** - Group similar articles for better compression
- **MigrationTask** - Run schema migrations (Phase 0-5)

### Potential Crawl Types

- **RSS Crawl** - Monitor RSS feeds for new articles
- **Sitemap Monitor** - Periodic sitemap checks for changes
- **Social Media Crawl** - Fetch articles from social media APIs
- **Archive Crawl** - Fetch historical articles from archives

### Integration Ideas

- **Scheduled Background Tasks** - Cron-like scheduling for periodic tasks
- **Crawl Chains** - Trigger background analysis after crawl completes
- **Smart Resume** - Background tasks detect stale crawl data and trigger refresh
- **Cost Optimization** - Use telemetry to prioritize cheap operations

---

## Summary

| What | Where | Purpose |
|------|-------|---------|
| **Crawls** | `src/crawler/`, child processes | Fetch external content (foreground) |
| **Background Tasks** | `src/background/`, in-process | Process internal data (background) |
| **Shared Infra** | Telemetry, SSE, progress tracking | Observability for both systems |

**Key Insight**: Crawls are about **acquiring new data**, background tasks are about **processing existing data**. They complement each other but remain architecturally separate for clarity and maintainability.
