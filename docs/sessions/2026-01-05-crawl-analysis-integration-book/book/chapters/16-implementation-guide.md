# Chapter 16: Implementation Guide

## Current State Assessment

This chapter maps the actual codebase to the book's architecture, identifying what exists, what's partial, and what's missing. Each section includes **exact file paths** for implemented features.

---

## Chapter-by-Chapter Implementation Status

### Part I: Foundation (Chapters 1-3)

| Chapter | Feature | Status | Implementation Location |
|---------|---------|--------|------------------------|
| Ch 1 | System architecture | ✅ Implemented | See "Component Inventory" below |
| Ch 2 | 6-phase data flow | ⚠️ Partial | Crawl→Analysis automated; Disambiguation→Export manual |
| Ch 3 | Database schema | ✅ Implemented | `src/db/sqlite/v1/schema-definitions.js` |
| Ch 3 | `content_cache` table | ✅ Implemented | `src/db/sqlite/v1/queries/contentCache.js` |
| Ch 3 | `content_analysis` table | ✅ Implemented | `src/db/sqlite/v1/queries/analysisAdapter.js` |
| Ch 3 | `place_mentions` table | ✅ Implemented | `src/db/sqlite/v1/queries/placeMentionsAdapter.js` |
| Ch 3 | `gazetteer` tables | ✅ Implemented | `src/db/sqlite/v1/queries/gazetteerQueries.js` |

### Part II: Crawl System (Chapters 4-7)

| Chapter | Feature | Status | Implementation Location |
|---------|---------|--------|------------------------|
| Ch 4 | Crawl daemon | ✅ Implemented | `src/cli/crawl/daemon.js` |
| Ch 4 | HTTP API (port 3099) | ✅ Implemented | `src/api/server.js`, `src/api/routes/crawl.js` |
| Ch 4 | Job registry | ✅ Implemented | `src/cli/crawl/daemon.js` (InProcessCrawlJobRegistry) |
| Ch 5 | Console filter (40+ patterns) | ✅ Implemented | `src/cli/crawl/daemon.js` lines 30-85 |
| Ch 5 | PID/log file management | ✅ Implemented | `src/cli/crawl/daemon.js` (getDaemonConfig) |
| Ch 6 | CrawlOperations facade | ✅ Implemented | `src/crawler/CrawlOperations.js` |
| Ch 6 | siteExplorer operation | ✅ Implemented | `src/crawler/operations/SiteExplorerOperation.js` |
| Ch 6 | quickDiscovery operation | ✅ Implemented | `src/crawler/operations/BasicArticleCrawlOperation.js` |
| Ch 6 | hubRefresh operation | ✅ Implemented | `src/crawler/operations/CrawlCountryHubsHistoryOperation.js` |
| Ch 6 | Operation sequences | ✅ Implemented | `src/crawler/operations/SequenceRunner.js` |
| Ch 6 | Priority scoring | ✅ Implemented | `src/crawler/PriorityScorer.js`, `src/crawler/PriorityCalculator.js` |
| Ch 6 | Multi-modal crawl orchestrator | ✅ Implemented | `src/crawler/multimodal/MultiModalCrawlOrchestrator.js` |
| Ch 6 | Multi-modal crawl manager | ✅ Implemented | `src/crawler/multimodal/MultiModalCrawlManager.js` |
| Ch 7 | CrawlerEvents class | ✅ Implemented | `src/crawler/CrawlerEvents.js` |
| Ch 7 | TaskEventWriter | ✅ Implemented | `src/db/TaskEventWriter.js` |
| Ch 7 | TelemetryIntegration | ✅ Implemented | `src/crawler/telemetry/TelemetryIntegration.js` |
| Ch 7 | SSE streaming | ✅ Implemented | `src/api/routes/crawl.js` (job progress endpoint) |
| Ch 7 | Multi-modal SSE streaming | ✅ Implemented | `src/ui/server/multiModalCrawl/server.js` |

### Part III: Analysis System (Chapters 8-10)

| Chapter | Feature | Status | Implementation Location |
|---------|---------|--------|------------------------|
| Ch 8 | Analysis pipeline core | ✅ Implemented | `src/tools/analyse-pages-core.js` |
| Ch 8 | Version tracking | ✅ Implemented | `labs/analysis-observable/analysis-version.js` |
| Ch 8 | zstd decompression | ✅ Implemented | `src/utils/CompressionFacade.js` |
| Ch 8 | XPath extraction | ⚠️ Partial | `config/extractors.json` (~20 patterns) |
| Ch 8 | Readability fallback | ✅ Implemented | Uses `@mozilla/readability` |
| Ch 8 | Fact extractors | ✅ Implemented | `src/facts/` directory |
| Ch 9 | Analysis Observable | ✅ Implemented (lab) | `labs/analysis-observable/analysis-observable.js` |
| Ch 9 | SSE progress server | ✅ Implemented (lab) | `labs/analysis-observable/analysis-server.js` |
| Ch 9 | Electron UI | ✅ Implemented (lab) | `labs/analysis-observable/electron-main.js` |
| Ch 9 | Graceful stop | ✅ Implemented | `labs/analysis-observable/run-all.js` |
| Ch 10 | Place mention detection | ✅ Implemented | `src/analysis/place-extraction.js` |
| Ch 10 | Gazetteer lookup | ✅ Implemented | `src/db/sqlite/v1/queries/gazetteerQueries.js` |
| Ch 10 | Population scoring | ✅ Implemented | `src/analysis/place-extraction.js` |
| Ch 10 | Publisher prior | ⚠️ Partial | Hub matrix exists; scoring not wired |
| Ch 10 | Multi-feature scoring | ❌ Missing | Documented but not implemented |
| Ch 10 | Coherence pass | ❌ Missing | Documented but not implemented |
| Ch 10 | Place Hub Matrix UI | ✅ Implemented | `src/ui/server/placeHubGuessing/` |
| Ch 10 | Hub Depth Probing | ✅ Implemented | `src/services/HubTaskGenerator.js` |
| Ch 10 | Hub Archive Crawl | ✅ Implemented | `src/crawler/operations/HubArchiveCrawlOperation.js` |
| Ch 10 | Intelligent Crawl Server | ✅ Implemented | `src/services/IntelligentCrawlServer.js` |

### Part IV: Integration (Chapters 11-13)

| Chapter | Feature | Status | Implementation Location |
|---------|---------|--------|------------------------|
| Ch 11 | UnifiedPipeline class | ❌ Missing | Target: `src/pipelines/UnifiedPipeline.js` |
| Ch 11 | PipelineOrchestrator | ❌ Missing | Target: `src/pipelines/PipelineOrchestrator.js` |
| Ch 11 | Multi-stage progress UI | ⚠️ Partial | `labs/crawler-progress-integration/` (lab only) |
| Ch 12 | JSON-first API responses | ✅ Implemented | All CLI tools support `--json` |
| Ch 12 | Pre-flight checks | ⚠️ Partial | `tools/dev/mcp-check.js` (MCP only) |
| Ch 12 | Decision logging | ⚠️ Partial | `src/crawler/DecisionExplainer.js` |
| Ch 12 | `/explain` API | ❌ Missing | Target: `src/api/routes/explain.js` |
| Ch 13 | Retry with backoff | ✅ Implemented | `src/crawler/retry/` |
| Ch 13 | Graceful shutdown | ✅ Implemented | `src/cli/crawl/daemon.js` |
| Ch 13 | Error telemetry | ✅ Implemented | `src/db/TaskEventWriter.js` |

### Part V: Future Vision (Chapters 14-15)

| Chapter | Feature | Status | Implementation Location |
|---------|---------|--------|------------------------|
| Ch 14 | Roadmap phases | Planning | This chapter documents the plan |
| Ch 15 | Performance benchmarks | ⚠️ Partial | Some checks exist in `checks/` |
| Ch 15 | Throughput monitoring | ⚠️ Partial | `labs/analysis-observable/` tracks rates |

---

## Component Inventory

### ✅ Fully Implemented

| Component | Location | Status | Related Docs |
|-----------|----------|--------|--------------|
| **Crawl Daemon** | | | |
| CLI wrapper | `tools/dev/crawl-daemon.js` | Complete | `tools/dev/README.md` |
| Daemon core | `src/cli/crawl/daemon.js` | Complete with 40+ console filter patterns | |
| API client CLI | `tools/dev/crawl-api.js` | Complete | `tools/dev/README.md` |
| **Crawl Operations** | | | |
| Operations facade | `src/crawler/CrawlOperations.js` | Complete | Ch 6 |
| SiteExplorer | `src/crawler/operations/SiteExplorerOperation.js` | Default depth=3, pages=500 | |
| BasicArticleCrawl | `src/crawler/operations/BasicArticleCrawlOperation.js` | Quick discovery | |
| Hub operations | `src/crawler/operations/CrawlCountryHub*.js` | Multiple variants | |
| Sequence runner | `src/crawler/operations/SequenceRunner.js` | Multi-step workflows | |
| **Multi-Modal Crawl** | | | |
| Orchestrator | `src/crawler/multimodal/MultiModalCrawlOrchestrator.js` | Batch → analyze → learn loop | Ch 4 |
| Manager | `src/crawler/multimodal/MultiModalCrawlManager.js` | Multi-domain concurrency | Ch 4 |
| SSE/API server | `src/ui/server/multiModalCrawl/server.js` | SSE + REST controls | Ch 7 |
| CLI tool | `tools/crawl-multi-modal.js` | Multi-modal CLI | |
| Adapter queries | `src/db/sqlite/v1/queries/multiModalCrawl.js` | SQL boundary for multi-modal | Ch 8 |

**Default multi-modal run config (config.json)**:

```json
{
  "crawlDefaults": {
    "mode": "multi-modal",
    "startUrl": "https://www.theguardian.com",
    "multiModal": {
      "batchSize": 1000,
      "hubDiscoverySequence": "intelligentCountryHubDiscovery",
      "hubDiscoveryMaxDownloads": 250,
      "hubGuessingKinds": ["country", "region"],
      "hubGuessingLimit": 50
    }
  }
}
```

Multi-modal CLI updates: `tools/crawl-multi-modal.js` now supports status summaries (`--status-interval`),
hub discovery sequencing (`--hub-sequence`), hub guessing toggles (`--no-hub-guessing` / `--hub-guess-kinds`),
and quiet output (`--quiet`) for low-noise monitoring.
| **Event System** | | | |
| CrawlerEvents | `src/crawler/CrawlerEvents.js` | 6 event types | Ch 7 |
| TaskEventWriter | `src/db/TaskEventWriter.js` | DB persistence | Ch 7 |
| TelemetryIntegration | `src/crawler/telemetry/TelemetryIntegration.js` | Bridge class | |
| **Analysis Observable** | | | |
| Observable core | `labs/analysis-observable/analysis-observable.js` | Metrics + streaming | Ch 9 |
| SSE server | `labs/analysis-observable/analysis-server.js` | Progress endpoint | |
| Electron app | `labs/analysis-observable/electron-main.js` | Visual monitoring | |
| Version resolver | `labs/analysis-observable/analysis-version.js` | Auto-detect version | |
| **Content Storage** | | | |
| Compression | `src/db/sqlite/v1/queries/contentCache.js` | zstd buckets | |
| CompressionFacade | `src/utils/CompressionFacade.js` | Unified interface | |
| **Place Hub Matrix** | | | |
| Matrix UI server | `src/ui/server/placeHubGuessing/server.js` | Coverage visualization | Ch 10 |
| Matrix control | `src/ui/server/placeHubGuessing/controls/PlaceHubGuessingMatrixControl.js` | jsgui3 control | |
| Cell control | `src/ui/server/placeHubGuessing/controls/PlaceHubGuessingCellControl.js` | Drill-down view | |
| Hub discovery CLI | `src/tools/guess-place-hubs.js` | Batch hub guessing | |
| Hub API routes | `src/api/routes/place-hubs.js` | REST endpoints | |
| **Place Extraction** | | | |
| Core extraction | `src/analysis/place-extraction.js` | 954 lines, slug matching | Ch 10 |
| Gazetteer queries | `src/db/sqlite/v1/queries/gazetteerQueries.js` | Lookup functions | |
| **Hub Archive System** | | | |
| HubTaskGenerator | `src/services/HubTaskGenerator.js` | Depth probing + task generation | Hub Deepening book |
| HubArchiveCrawlOperation | `src/crawler/operations/HubArchiveCrawlOperation.js` | Archive crawl ops | |
| IntelligentCrawlServer | `src/services/IntelligentCrawlServer.js` | HTTP API + SSE (port 3150) | |
| Archive queries | `src/db/sqlite/v1/queries/placePageMappings.js` | `getVerifiedHubsForArchive`, `updateHubDepthCheck` | |
| Matrix depth display | `src/ui/server/placeHubGuessing/controls/PlaceHubGuessingMatrixControl.js` | Deep hub styling + tooltips | |

### ⚠️ Partially Implemented

| Component | Location | Current State | Gap |
|-----------|----------|---------------|-----|
| Unified Dashboard | `labs/crawler-progress-integration/` | Works but lab-only | Needs productionization |
| Place Extraction scoring | `src/analysis/place-extraction.js` | Population-based only | Missing publisher prior, containment boost |
| XPath Extraction | `config/extractors.json` | ~20 patterns | Target: 100+ |
| Disambiguation | `src/matching/ArticlePlaceMatcher.js` | Rule levels 1-2 | Levels 3-4 (co-occurrence, coherence) |
| Hub→Prior Integration | Matrix stores coverage | Not wired | Need `publisherPriorScore()` function |
| Pre-flight checks | `tools/dev/mcp-check.js` | MCP servers only | Need daemon/db pre-flight |

### ❌ Not Yet Implemented

| Component | Target Location | Book Chapter | Dependencies |
|-----------|-----------------|--------------|--------------|
| `UnifiedPipeline` class | `src/pipelines/UnifiedPipeline.js` | Ch 11 | Daemon, Analysis Observable |
| `PipelineOrchestrator` | `src/pipelines/PipelineOrchestrator.js` | Ch 11 | UnifiedPipeline |
| Multi-language aliases | `src/db/sqlite/gazetteer/aliases.js` | Ch 10 | Schema migration |
| `/explain` API | `src/api/routes/explain.js` | Ch 12 | Place extraction |
| Analysis migrations | `src/db/migrations/analysis/` | Ch 14 | Version tracking |
| `publisherPriorScore()` | `src/analysis/place-extraction.js` | Ch 10 | Hub matrix data |

---

## Key File Cross-Reference

### Crawl System Files

```
src/
├── cli/crawl/
│   ├── daemon.js              ← Daemon core (Ch 4-5)
│   ├── commands.js            ← CLI command routing
│   └── runner.js              ← Crawl execution
├── crawler/
│   ├── CrawlOperations.js     ← Operations facade (Ch 6)
│   ├── CrawlerEvents.js       ← Event emitter (Ch 7)
│   ├── PriorityScorer.js      ← URL priority (Ch 6)
│   ├── telemetry/
│   │   └── TelemetryIntegration.js ← Telemetry bridge (Ch 7)
│   ├── multimodal/
│   │   ├── MultiModalCrawlOrchestrator.js ← Batch → analyze → learn loop
│   │   ├── MultiModalCrawlManager.js      ← Multi-domain coordination
│   │   ├── CrawlBalancer.js               ← Historical vs newest balancing
│   │   └── PatternDeltaTracker.js         ← Pattern deltas
│   └── operations/
│       ├── index.js           ← Operation exports
│       ├── SiteExplorerOperation.js    ← siteExplorer (Ch 6)
│       ├── BasicArticleCrawlOperation.js ← quickDiscovery
│       └── SequenceRunner.js   ← Multi-step sequences
├── db/
│   ├── TaskEventWriter.js     ← Event persistence (Ch 7)
│   └── sqlite/v1/queries/
│       ├── contentCache.js          ← Compression (Ch 8)
│       ├── analysisAdapter.js       ← Analysis results (Ch 8)
│       ├── gazetteerQueries.js      ← Place lookup (Ch 10)
│       ├── multiModalCrawl.js       ← Multi-modal crawl queries
│       ├── patternLearning.js       ← Pattern learning queries
│       ├── placePageMappings.js     ← Hub archive queries (NEW)
│       └── placeHubGuessingUiQueries.js ← Matrix UI data (NEW)
├── services/
│   ├── HubTaskGenerator.js          ← Depth probe + task generation (NEW)
│   ├── IntelligentCrawlServer.js    ← HTTP API server port 3150 (NEW)
│   └── PlaceHubBackfillService.js   ← Hub backfill service (NEW)
└── api/
    ├── server.js              ← Express API (Ch 4)
    └── routes/
        ├── crawl.js           ← Crawl endpoints
        └── place-hubs.js      ← Hub API (Ch 10)

tools/dev/
├── crawl-daemon.js            ← Daemon CLI wrapper
├── crawl-api.js               ← API client CLI
├── task-events.js             ← Event query CLI
└── mini-crawl.js              ← Quick test crawls

labs/analysis-observable/
├── analysis-observable.js     ← Observable core (Ch 9)
├── analysis-server.js         ← SSE server
├── electron-main.js           ← Electron UI
└── run-all.js                 ← Batch runner

config/
└── extractors.json            ← XPath patterns (Ch 8)
```

### Analysis System Files

```
src/analysis/
├── place-extraction.js        ← Place detection (Ch 10) - 954 lines
├── page-analyzer.js           ← Page analysis
└── tagging/
    └── TaggingService.js      ← Category tagging

src/tools/
├── analyse-pages-core.js      ← Core analysis (Ch 8)
└── guess-place-hubs.js        ← Hub discovery (Ch 10)

src/facts/
├── index.js                   ← Fact extractor registry
└── [various extractors]       ← Boolean fact detection

src/ui/server/placeHubGuessing/
├── server.js                  ← Hub matrix server (Ch 10)
└── controls/
    ├── PlaceHubGuessingMatrixControl.js ← Matrix UI
    └── PlaceHubGuessingCellControl.js   ← Cell detail
```

---

## Migration Path: Daemon to Production

### Current Daemon Architecture

```
tools/dev/crawl-daemon.js     ← CLI wrapper
        │
        ▼
src/cli/crawl/daemon.js       ← Core daemon module
        │
        ├── getDaemonConfig()
        ├── isDaemonRunning()
        ├── startDaemonDetached()
        ├── stopDaemon()
        └── getDaemonStatus()
        │
        ▼
src/api/server.js             ← Express API server
        │
        ├── /api/v1/crawl/operations/:op/start
        ├── /api/crawls
        ├── /api/crawls/:id
        ├── /api/crawls/:id/stop
        ├── /api/crawls/:id/pause
        └── /api/crawls/:id/resume
```

### Step 1: Extract Daemon to Production Module

```javascript
// src/daemon/CrawlDaemon.js (NEW)
'use strict';

const { createApiServer } = require('../api/server');

class CrawlDaemon {
  constructor(config = {}) {
    this.config = {
      port: config.port || 3099,
      pidFile: config.pidFile || 'tmp/crawl-daemon.pid',
      logFile: config.logFile || 'tmp/crawl-daemon.log',
      quietMode: config.quietMode ?? true,
      ...config
    };
    
    this.server = null;
    this.httpServer = null;
  }
  
  async start() {
    // Initialize API server
    this.server = createApiServer(this.config);
    
    // Start HTTP listener
    await new Promise((resolve, reject) => {
      this.httpServer = this.server.listen(this.config.port, () => {
        this._writePidFile();
        resolve();
      });
      this.httpServer.on('error', reject);
    });
    
    return { port: this.config.port };
  }
  
  async stop() {
    if (this.httpServer) {
      await new Promise(resolve => this.httpServer.close(resolve));
      this._removePidFile();
    }
  }
  
  // ... private methods
}

module.exports = { CrawlDaemon };
```

### Step 2: Add to Package Scripts

```json
// package.json additions
{
  "scripts": {
    "daemon:start": "node -e \"require('./src/daemon/CrawlDaemon').start()\"",
    "daemon:stop": "node tools/dev/crawl-daemon.js stop",
    "daemon:status": "node tools/dev/crawl-daemon.js status --json"
  }
}
```

---

## Migration Path: Analysis Observable to Production

### Current Lab Structure

```
labs/analysis-observable/
├── analysis-observable.js    ← Core observable
├── analysis-server.js        ← Express SSE server
├── analysis-version.js       ← Version resolution
├── run-lab.js                ← CLI entry point
├── run-all.js                ← Batch runner
└── electron-main.js          ← Electron wrapper
```

### Step 1: Extract Core Module

```javascript
// src/analysis/AnalysisObservable.js (NEW)
'use strict';

const { analysePages } = require('../tools/analyse-pages-core');

class AnalysisObservable {
  constructor(options = {}) {
    this.options = {
      dbPath: options.dbPath,
      limit: options.limit || null,
      analysisVersion: options.analysisVersion || 1,
      dryRun: options.dryRun || false,
      timeout: options.timeout || 5000,
      ...options
    };
    
    this.subscribers = new Set();
    this.isRunning = false;
    this._metrics = new AnalysisMetrics();
  }
  
  subscribe(observer) {
    this.subscribers.add(observer);
    return () => this.subscribers.delete(observer);
  }
  
  async start() {
    if (this.isRunning) throw new Error('Already running');
    this.isRunning = true;
    
    try {
      const result = await analysePages({
        ...this.options,
        onProgress: (info) => this._emitProgress(info)
      });
      
      this._emitComplete(result);
      return result;
    } catch (error) {
      this._emitError(error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }
  
  stop() {
    // Request graceful stop
    this._stopRequested = true;
  }
  
  // ... private methods
}

module.exports = { AnalysisObservable };
```

### Step 2: Create Production SSE Endpoint

```javascript
// src/api/routes/analysis-stream.js (NEW)
'use strict';

const express = require('express');
const { AnalysisObservable } = require('../../analysis/AnalysisObservable');

function createAnalysisStreamRouter(options = {}) {
  const router = express.Router();
  let currentRun = null;
  
  router.get('/api/analysis/stream', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    
    if (!currentRun) {
      res.write(`data: ${JSON.stringify({ type: 'idle' })}\n\n`);
      return;
    }
    
    const unsubscribe = currentRun.subscribe({
      next: (msg) => res.write(`data: ${JSON.stringify(msg)}\n\n`),
      complete: (msg) => res.write(`data: ${JSON.stringify(msg)}\n\n`),
      error: (msg) => res.write(`data: ${JSON.stringify(msg)}\n\n`)
    });
    
    req.on('close', unsubscribe);
  });
  
  router.post('/api/analysis/start', async (req, res) => {
    if (currentRun?.isRunning) {
      return res.status(409).json({ error: 'Analysis already running' });
    }
    
    currentRun = new AnalysisObservable(req.body);
    
    // Start in background, don't await
    currentRun.start().catch(console.error);
    
    res.json({ started: true, runId: currentRun.runId });
  });
  
  return router;
}

module.exports = { createAnalysisStreamRouter };
```

---

## Migration Path: Unified Pipeline

### Current State: Manual Multi-Step

```bash
# Current workflow requires 3 manual steps:
node tools/dev/crawl-daemon.js start
node tools/dev/crawl-api.js jobs start siteExplorer https://bbc.com -n 100
# Wait for completion...
node labs/analysis-observable/run-all.js --limit 100 --electron
# Wait for completion...
node tools/dev/crawl-daemon.js stop
```

### Target State: Single Command

```bash
# Unified pipeline
node src/cli/pipeline.js run --url https://bbc.com --pages 100 --electron
```

### Implementation: Pipeline Orchestrator

```javascript
// src/pipelines/PipelineOrchestrator.js (NEW)
'use strict';

const EventEmitter = require('events');
const { CrawlDaemon } = require('../daemon/CrawlDaemon');
const { AnalysisObservable } = require('../analysis/AnalysisObservable');

const STAGES = ['init', 'crawl', 'analyze', 'export', 'complete'];

class PipelineOrchestrator extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      crawlUrl: options.crawlUrl,
      maxPages: options.maxPages || 100,
      analysisLimit: options.analysisLimit || null, // null = analyze all new
      exportFormat: options.exportFormat || 'json',
      skipStages: options.skipStages || [],
      ...options
    };
    
    this.stage = 'init';
    this.stageResults = {};
  }
  
  async run() {
    const startTime = Date.now();
    
    try {
      // Stage: Init
      await this._runStage('init', async () => {
        this.daemon = new CrawlDaemon(this.config.daemon);
        await this.daemon.start();
        return { daemonPort: this.daemon.config.port };
      });
      
      // Stage: Crawl
      if (!this.config.skipStages.includes('crawl')) {
        await this._runStage('crawl', async () => {
          return this._runCrawl();
        });
      }
      
      // Stage: Analyze
      if (!this.config.skipStages.includes('analyze')) {
        await this._runStage('analyze', async () => {
          return this._runAnalysis();
        });
      }
      
      // Stage: Export
      if (!this.config.skipStages.includes('export')) {
        await this._runStage('export', async () => {
          return this._runExport();
        });
      }
      
      // Stage: Complete
      await this._runStage('complete', async () => {
        await this.daemon.stop();
        return {
          totalDurationMs: Date.now() - startTime,
          stages: this.stageResults
        };
      });
      
      return this.stageResults;
      
    } catch (error) {
      this.emit('error', { stage: this.stage, error });
      throw error;
    }
  }
  
  async _runStage(stageName, fn) {
    this.stage = stageName;
    const stageStart = Date.now();
    
    this.emit('stage:start', { stage: stageName });
    
    const result = await fn();
    
    this.stageResults[stageName] = {
      ...result,
      durationMs: Date.now() - stageStart
    };
    
    this.emit('stage:complete', { 
      stage: stageName, 
      result: this.stageResults[stageName] 
    });
    
    return result;
  }
  
  async _runCrawl() {
    const crawl = await this.daemon.startJob({
      operation: 'siteExplorer',
      startUrl: this.config.crawlUrl,
      overrides: { maxPages: this.config.maxPages }
    });
    
    // Stream progress
    crawl.on('progress', (p) => {
      this.emit('progress', { stage: 'crawl', ...p });
    });
    
    return crawl.waitForCompletion();
  }
  
  async _runAnalysis() {
    const analysis = new AnalysisObservable({
      limit: this.config.analysisLimit,
      analysisVersion: this.config.analysisVersion
    });
    
    analysis.subscribe({
      next: (msg) => this.emit('progress', { stage: 'analyze', ...msg.value })
    });
    
    return analysis.start();
  }
  
  async _runExport() {
    // Placeholder for export stage
    return { format: this.config.exportFormat, records: 0 };
  }
  
  getProgress() {
    return {
      stage: this.stage,
      stages: STAGES,
      stageIndex: STAGES.indexOf(this.stage),
      stageResults: this.stageResults
    };
  }
}

module.exports = { PipelineOrchestrator, STAGES };
```

### CLI Entry Point

```javascript
// src/cli/pipeline.js (NEW)
#!/usr/bin/env node
'use strict';

const { PipelineOrchestrator } = require('../pipelines/PipelineOrchestrator');

async function main() {
  const args = process.argv.slice(2);
  
  // Parse args...
  const options = {
    crawlUrl: getArg('--url'),
    maxPages: parseInt(getArg('--pages') || '100', 10),
    // ...
  };
  
  const pipeline = new PipelineOrchestrator(options);
  
  // Subscribe to events for progress output
  pipeline.on('stage:start', ({ stage }) => {
    console.log(`\n=== Stage: ${stage.toUpperCase()} ===`);
  });
  
  pipeline.on('progress', (p) => {
    process.stdout.write(`\r[${p.stage}] ${p.processed || 0}/${p.total || '?'}`);
  });
  
  pipeline.on('stage:complete', ({ stage, result }) => {
    console.log(`\n✓ ${stage} complete (${result.durationMs}ms)`);
  });
  
  // Run
  const result = await pipeline.run();
  console.log('\n=== Pipeline Complete ===');
  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);
```

---

## Priority Implementation Order

Based on ROI and dependencies:

### Week 1-2: Foundation

1. **Extract `CrawlDaemon` class** from `src/cli/crawl/daemon.js`
   - Create `src/daemon/CrawlDaemon.js`
   - Add production-grade error handling
   - Add health check endpoint
   
2. **Extract `AnalysisObservable` class** from `labs/analysis-observable/`
   - Create `src/analysis/AnalysisObservable.js`
   - Ensure clean separation from lab code

### Week 3-4: Integration

3. **Create `PipelineOrchestrator`**
   - Implement stage-based execution
   - Add progress streaming
   - Create CLI entry point

4. **Add XPath patterns**
   - Expand `config/extractors.json` from ~20 to 50+ patterns
   - Focus on BBC, Guardian, Reuters, AP, NYT first

### Week 5-6: Disambiguation

5. **Enhance place scoring**
   - Add publisher location prior
   - Add co-occurrence features
   - Create `/explain` endpoint

6. **Add multi-language aliases**
   - Schema update for language codes
   - Import top 10 languages from GeoNames

---

## Testing Checklist

### Daemon Tests

```javascript
// tests/daemon/CrawlDaemon.test.js
describe('CrawlDaemon', () => {
  test('starts and creates PID file', async () => {
    const daemon = new CrawlDaemon({ port: 0 }); // Random port
    await daemon.start();
    expect(fs.existsSync(daemon.config.pidFile)).toBe(true);
    await daemon.stop();
  });
  
  test('health endpoint returns ok', async () => {
    const daemon = new CrawlDaemon({ port: 0 });
    const { port } = await daemon.start();
    
    const res = await fetch(`http://localhost:${port}/health`);
    expect(res.ok).toBe(true);
    
    await daemon.stop();
  });
});
```

### Pipeline Tests

```javascript
// tests/pipelines/PipelineOrchestrator.test.js
describe('PipelineOrchestrator', () => {
  test('runs all stages in order', async () => {
    const stages = [];
    const pipeline = new PipelineOrchestrator({
      crawlUrl: 'https://example.com',
      maxPages: 1
    });
    
    pipeline.on('stage:start', ({ stage }) => stages.push(stage));
    
    await pipeline.run();
    
    expect(stages).toEqual(['init', 'crawl', 'analyze', 'export', 'complete']);
  });
  
  test('skips stages when requested', async () => {
    const pipeline = new PipelineOrchestrator({
      skipStages: ['crawl', 'export']
    });
    
    const result = await pipeline.run();
    
    expect(result.crawl).toBeUndefined();
    expect(result.analyze).toBeDefined();
  });
});
```

---

## Monitoring the Migration

Track progress with these metrics:

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Daemon uptime | Manual | 99% | Health check failures/total |
| Pipeline success rate | N/A | 95% | Completed runs/started runs |
| Analysis throughput | 1-2/sec | 10/sec | Records per second from observable |
| XPath coverage | 20 sites | 100 sites | Patterns in extractors.json |
| Disambiguation accuracy | ~60% | 90% | Manual audit sample |

---

## Next Steps

After completing this implementation guide:

1. **Create migration branches** for each major component
2. **Write integration tests** before refactoring
3. **Update AGENTS.md** with new commands and patterns
4. **Add to docs/INDEX.md** when production modules are ready

---

## Implementation Recipes

### Recipe 1: Add Publisher Prior to Place Scoring

**Location**: `src/analysis/place-extraction.js`

**Current State**: The `buildMatchers()` function in place-extraction.js loads gazetteer data and creates slug maps. Scoring uses only population.

**Implementation Steps**:

```javascript
// Step 1: Load hub coverage from database
// Add to buildMatchers() around line 180

function loadPublisherHubCoverage(db, publisherHost) {
  // Query place_page_mappings for this publisher
  const sql = `
    SELECT pm.place_id, COUNT(*) as article_count
    FROM place_page_mappings pm
    JOIN urls u ON pm.url_id = u.id
    WHERE u.host = ?
    GROUP BY pm.place_id
  `;
  const rows = db.prepare(sql).all(publisherHost);
  const coverage = new Map();
  for (const row of rows) {
    coverage.set(row.place_id, row.article_count);
  }
  return coverage;
}

// Step 2: Add scoring function
// Add after scoreCandidatesByPopulation()

function publisherPriorScore(candidates, publisherCoverage, options = {}) {
  const { weight = 0.3 } = options;
  
  for (const candidate of candidates) {
    const articleCount = publisherCoverage.get(candidate.place_id) || 0;
    if (articleCount > 0) {
      // Log scale: 1 article = 0.1 bonus, 10 = 0.2, 100 = 0.3
      const bonus = Math.min(0.3, Math.log10(articleCount + 1) * 0.1);
      candidate.score += bonus * weight;
      candidate.priorBonus = bonus;
    }
  }
  
  return candidates;
}
```

### Recipe 2: Implement UnifiedPipeline

**Target Location**: `src/pipelines/UnifiedPipeline.js`

**Dependencies**: 
- `src/cli/crawl/daemon.js` (extract startDaemonDetached)
- `labs/analysis-observable/analysis-observable.js` (extract core)

**Step-by-step**:

```javascript
// src/pipelines/UnifiedPipeline.js
'use strict';

const EventEmitter = require('events');
const { isDaemonRunning, startDaemonDetached, stopDaemon } = require('../cli/crawl/daemon');

class UnifiedPipeline extends EventEmitter {
  constructor(options = {}) {
    super();
    this.stages = ['init', 'crawl', 'analyze', 'complete'];
    this.currentStage = null;
    this.results = {};
  }
  
  async run(config) {
    const { seedUrl, operation = 'siteExplorer', maxPages = 100, analyze = true } = config;
    
    try {
      // Stage: Init
      await this._runStage('init', async () => {
        if (!await isDaemonRunning()) {
          await startDaemonDetached();
          await this._waitForDaemon();
        }
        return { daemonReady: true };
      });
      
      // Stage: Crawl
      await this._runStage('crawl', async () => {
        const response = await fetch('http://localhost:3099/api/v1/crawl/operations/' + operation + '/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ startUrl: seedUrl, overrides: { maxPages } })
        });
        const { jobId } = await response.json();
        return this._waitForJob(jobId);
      });
      
      // Stage: Analyze
      if (analyze) {
        await this._runStage('analyze', async () => {
          const { analysePages } = require('../tools/analyse-pages-core');
          return analysePages({
            dbPath: 'data/news.db',
            limit: this.results.crawl?.pagesDownloaded || maxPages,
            onProgress: (p) => this.emit('progress', { stage: 'analyze', ...p })
          });
        });
      }
      
      // Complete
      return this.results;
      
    } catch (error) {
      this.emit('error', { stage: this.currentStage, error });
      throw error;
    }
  }
  
  async _runStage(name, fn) {
    this.currentStage = name;
    this.emit('stage:start', { stage: name });
    const result = await fn();
    this.results[name] = result;
    this.emit('stage:complete', { stage: name, result });
    return result;
  }
  
  async _waitForJob(jobId) {
    while (true) {
      const res = await fetch(`http://localhost:3099/api/crawls/${jobId}`);
      const job = await res.json();
      this.emit('progress', { stage: 'crawl', ...job.progress });
      if (job.status === 'completed' || job.status === 'stopped') {
        return job;
      }
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  
  async _waitForDaemon(timeoutMs = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch('http://localhost:3099/health');
        if (res.ok) return;
      } catch {}
      await new Promise(r => setTimeout(r, 500));
    }
    throw new Error('Daemon did not start in time');
  }
}

module.exports = { UnifiedPipeline };
```

### Recipe 3: Add XPath Pattern for a News Site

**Location**: `config/extractors.json`

**Current patterns**: ~20 sites covered

**Adding a new pattern**:

```json
{
  "www.reuters.com": {
    "title": "//h1[@data-testid='Heading']",
    "body": "//article[@data-testid='article-body']",
    "date": "//time[@data-testid='published-date']/@datetime",
    "author": "//a[@data-testid='author-name']"
  }
}
```

**Testing a pattern**:

```bash
# Test XPath extraction for a URL
node labs/analysis-observable/xpath-test.js https://www.reuters.com/article/example
```

### Recipe 4: Wire Hub Matrix to Analysis

**Goal**: Connect the Place Hub Guessing Matrix data to the disambiguation scoring.

**Files involved**:
- `src/ui/server/placeHubGuessing/server.js` (has the data)
- `src/analysis/place-extraction.js` (needs the data)

**Implementation**:

```javascript
// src/analysis/place-extraction.js - Add near buildMatchers()

async function loadHubCoverageMatrix(db) {
  // The place_page_mappings table stores hub→place relationships
  // This data comes from the Place Hub Guessing workflow
  const sql = `
    SELECT 
      u.host as publisher,
      ppm.place_id,
      COUNT(DISTINCT ppm.url_id) as coverage_count,
      AVG(ppm.confidence) as avg_confidence
    FROM place_page_mappings ppm
    JOIN urls u ON ppm.url_id = u.id
    GROUP BY u.host, ppm.place_id
  `;
  
  const rows = db.prepare(sql).all();
  
  // Build nested map: publisher → place_id → { count, confidence }
  const matrix = new Map();
  for (const row of rows) {
    if (!matrix.has(row.publisher)) {
      matrix.set(row.publisher, new Map());
    }
    matrix.get(row.publisher).set(row.place_id, {
      count: row.coverage_count,
      confidence: row.avg_confidence
    });
  }
  
  return matrix;
}

// Usage in scoring:
// const hubMatrix = loadHubCoverageMatrix(db);
// const publisherCoverage = hubMatrix.get(publisherHost) || new Map();
// candidates = publisherPriorScore(candidates, publisherCoverage);
```

---

## IntelligentCrawlServer API Reference

The IntelligentCrawlServer provides a unified HTTP API for crawling, hub discovery, and archive management.

**Start the server:**
```bash
node src/services/IntelligentCrawlServer.js --port=3150
```

### Core Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/status` | GET | Server status + database info |
| `/events` | GET | SSE event stream |
| `/api/config` | GET | Full configuration |

### Backfill Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/backfill` | POST | Trigger manual backfill |
| `/api/backfill/stats` | GET | Backfill statistics |

### Crawl Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/crawl/start` | POST | Start intelligent crawl |
| `/api/crawl/stop` | POST | Stop current crawl |
| `/api/crawl/status` | GET | Current crawl status |

### Hub Archive Endpoints (NEW)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/hub-archive/probe` | POST | Probe verified hubs for pagination depth |
| `/api/hub-archive/tasks` | POST | Generate crawl tasks for hub archives |
| `/api/hub-archive/stats` | GET | Archive coverage statistics |
| `/api/hub-archive/hubs` | GET | List verified hubs |

**Example: Probe hub depths**
```bash
curl -X POST http://localhost:3150/api/hub-archive/probe \
  -H "Content-Type: application/json" \
  -d '{"host": "theguardian.com", "hubLimit": 50, "probeDelayMs": 500}'
```

**Example: Generate archive tasks**
```bash
curl -X POST http://localhost:3150/api/hub-archive/tasks \
  -H "Content-Type: application/json" \
  -d '{"host": "theguardian.com", "minDepth": 10, "pagesPerHub": 100}'
```

**Example: Monitor via SSE**
```bash
curl -N http://localhost:3150/events
```

### SSE Event Types

| Event | Description |
|-------|-------------|
| `hub-probe:start` | Probe session started |
| `hub-probe:hub-start` | Individual hub probe started |
| `hub-probe:page` | Page checked during exponential search |
| `hub-probe:hub-complete` | Hub probe finished |
| `hub-probe:finish` | All hubs probed |
| `hub-archive:tasks-generated` | Crawl tasks created |
| `crawl:started` | Crawl started |
| `crawl:progress` | Crawl progress update |
| `crawl:complete` | Crawl finished |

---

## DB Adapter Pattern (CRITICAL)

**All SQL must live in the database adapter layer.** This was enforced in commit `c2e3048`.

### Pattern

```
Service Layer (Business Logic - NO SQL)
    ↓
Query Adapter (ALL SQL - parameterized only)
    ↓
Database Engine (SQLite/PostgreSQL)
```

### Query Adapter Locations

| Category | File | Purpose |
|----------|------|---------|
| Core | `contentCache.js` | Content storage + compression |
| Core | `analysisAdapter.js` | Analysis results |
| Core | `gazetteerQueries.js` | Place/gazetteer lookups |
| Hub | `placePageMappings.js` | Hub mappings + archive queries |
| Hub | `placeHubGuessingUiQueries.js` | Matrix UI data |
| Crawl | `multiModalCrawl.js` | Multi-modal crawl state |
| Crawl | `patternLearning.js` | URL pattern learning |

### Key Functions in placePageMappings.js

```javascript
// Get verified hubs ready for archiving
getVerifiedHubsForArchive(db, { host, pageKind, limit, orderBy, needsDepthCheck })

// Update hub depth after probing
updateHubDepthCheck(db, { id, maxPageDepth, oldestContentDate, error })

// Get archive statistics for a host
getArchiveCrawlStats(db, host)

// Get hubs that need archiving (depth >= minDepth)
getHubsNeedingArchive(db, { host, minDepth, limit })
```

---

## Quick Command Reference

### Daemon Control

```powershell
# Start daemon
node tools/dev/crawl-daemon.js start

# Check status
node tools/dev/crawl-daemon.js status --json

# Stop daemon
node tools/dev/crawl-daemon.js stop
```

### Crawl Operations

```powershell
# Quick discovery (few pages)
node tools/dev/crawl-api.js jobs start basicArticleCrawl https://bbc.com -n 10 --json

# Site exploration (deep crawl)
node tools/dev/crawl-api.js jobs start siteExplorer https://bbc.com -n 100 --json

# Check job status
node tools/dev/crawl-api.js jobs get <jobId> --json
```

### Analysis

```powershell
# Run analysis with UI
node labs/analysis-observable/run-all.js --limit 100 --electron

# Check what needs analysis
node labs/analysis-observable/run-all.js --info

# Test XPath for a domain
node labs/analysis-observable/xpath-test.js <url>
```

### Events & Telemetry

```powershell
# Query task events
node tools/dev/task-events.js --list
node tools/dev/task-events.js --summary <taskId>
node tools/dev/task-events.js --problems <taskId>
```

---

[← Back to Index](../README.md)
