# Chapter 11: The Unified Workflow

> **Implementation Status**: ✅ Core implemented — `PipelineOrchestrator` and `UnifiedPipeline` classes ready.

## Codebase Quick Reference

| Component | File Location | Status |
|---------|---------------|--------|
| PipelineOrchestrator | `src/pipelines/PipelineOrchestrator.js` | ✅ Implemented |
| UnifiedPipeline | `src/pipelines/UnifiedPipeline.js` | ✅ Implemented |
| Pipeline index | `src/pipelines/index.js` | ✅ Module exports |
| CLI tool | `tools/dev/unified-pipeline.js` | ✅ Implemented |
| Crawl daemon | `src/cli/crawl/daemon.js` | ✅ Dependency |
| Analysis observable | `labs/analysis-observable/` | ✅ Dependency |

## Quick Start

```powershell
# Full pipeline: crawl + analysis
node tools/dev/unified-pipeline.js --seed https://bbc.com --pages 100

# With Electron UI for progress monitoring
node tools/dev/unified-pipeline.js --seed https://bbc.com --pages 100 --electron

# Analysis only (skip crawl)
node tools/dev/unified-pipeline.js --analyze-only --limit 100

# JSON output for AI agents
node tools/dev/unified-pipeline.js --seed https://bbc.com --pages 10 --json
```

## Programmatic Usage

```javascript
const { UnifiedPipeline } = require('./src/pipelines');

// Simple: crawl and analyze
const result = await UnifiedPipeline.crawlAndAnalyze({
  url: 'https://bbc.com',
  maxPages: 100
});

// With progress events
const pipeline = new UnifiedPipeline({
  url: 'https://bbc.com',
  maxPages: 100,
  analyze: true
});

pipeline.on('stage:start', ({ stage }) => console.log(`Starting: ${stage}`));
pipeline.on('progress', (p) => console.log(p));
pipeline.on('stage:complete', ({ stage, result }) => console.log(`Done: ${stage}`));

await pipeline.run();
```

## Remaining Gaps

| Feature | Status | Notes |
|---------|--------|-------|
| Disambiguation stage | ⚠️ Placeholder | Needs `DisambiguationEngine` integration |
| Electron UI wrapper | ❌ Not started | Use `labs/analysis-observable/` pattern |
| Resume support | ❌ Not started | Save/restore pipeline state |

## Vision

A single command that:
1. Starts a crawl
2. Waits for completion
3. Triggers analysis
4. Runs disambiguation
5. Reports results

All with progress visibility and graceful stop support.

---

## Current State vs Target

### Current State (Manual Steps)

```powershell
# 1. Start daemon
node tools/dev/crawl-daemon.js start

# 2. Start crawl
node tools/dev/crawl-api.js jobs start siteExplorer https://bbc.com -n 100 --json
# → Get jobId

# 3. Poll for completion (manual)
node tools/dev/crawl-api.js jobs get <jobId> --json
# ... repeat until status: completed

# 4. Run analysis
node labs/analysis-observable/run-all.js --limit 100 --electron

# 5. Run disambiguation
# (not yet automated)
```

### Target State (Unified)

```powershell
# One command does everything
node tools/dev/unified-pipeline.js \
  --seed https://bbc.com \
  --operation siteExplorer \
  --max-pages 100 \
  --analyze \
  --disambiguate \
  --ui electron

# Or via npm script
npm run pipeline:full -- --seed https://bbc.com --max-pages 100
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        UNIFIED PIPELINE CLI                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  node tools/dev/unified-pipeline.js                                     │
│    --seed <url>           Starting URL                                  │
│    --operation <name>     Crawl operation                               │
│    --max-pages <n>        Page limit                                    │
│    --analyze              Run analysis after crawl                      │
│    --disambiguate         Run disambiguation after analysis             │
│    --ui <mode>            UI mode: none, browser, electron              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        PIPELINE ORCHESTRATOR                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  class PipelineOrchestrator {                                           │
│    constructor(options) {                                               │
│      this.stages = [];                                                  │
│      this.currentStage = null;                                          │
│      this.progress = new EventEmitter();                                │
│    }                                                                    │
│                                                                         │
│    async run() {                                                        │
│      for (const stage of this.stages) {                                 │
│        this.currentStage = stage;                                       │
│        await stage.execute(this.progress);                              │
│      }                                                                  │
│    }                                                                    │
│                                                                         │
│    stop() {                                                             │
│      this.currentStage?.requestStop();                                  │
│    }                                                                    │
│  }                                                                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            STAGES                                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌────────────┐  │
│  │  CrawlStage │──▶│AnalysisStage│──▶│ DisambStage │──▶│ReportStage │  │
│  │             │   │             │   │             │   │            │  │
│  │ • daemon    │   │ • observable│   │ • engine    │   │ • summary  │  │
│  │ • job API   │   │ • progress  │   │ • batch     │   │ • metrics  │  │
│  │ • events    │   │ • versions  │   │ • coherence │   │ • export   │  │
│  └─────────────┘   └─────────────┘   └─────────────┘   └────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        UNIFIED UI                                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Pipeline Progress                                                │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │ Stage 1/4: Crawl       ████████████████████████░░░░░░ 80%       │   │
│  │            siteExplorer → https://bbc.com                        │   │
│  │            80/100 pages │ 2.3 pages/sec │ ETA: 0:08             │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │ Stage 2/4: Analysis    ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ pending   │   │
│  │ Stage 3/4: Disambig    ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ pending   │   │
│  │ Stage 4/4: Report      ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ pending   │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │ [Stop Pipeline]                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Stage Implementations

### CrawlStage

```javascript
class CrawlStage {
  constructor(options) {
    this.operation = options.operation || 'siteExplorer';
    this.seedUrl = options.seedUrl;
    this.maxPages = options.maxPages || 100;
    this.stopRequested = false;
  }
  
  async execute(progress) {
    // Ensure daemon is running
    const daemonStatus = await this.checkDaemon();
    if (!daemonStatus.running) {
      await this.startDaemon();
    }
    
    // Start crawl job
    const job = await this.startJob();
    progress.emit('stage-started', { stage: 'crawl', jobId: job.jobId });
    
    // Poll for completion
    while (!this.stopRequested) {
      const status = await this.getJobStatus(job.jobId);
      
      progress.emit('progress', {
        stage: 'crawl',
        current: status.progress.pagesVisited,
        total: this.maxPages,
        rate: status.progress.rate,
        eta: status.progress.eta
      });
      
      if (status.status === 'completed' || status.status === 'stopped') {
        break;
      }
      
      await sleep(1000);
    }
    
    progress.emit('stage-completed', { stage: 'crawl' });
    return { pagesDownloaded: status.progress.pagesVisited };
  }
  
  requestStop() {
    this.stopRequested = true;
    // Also request job stop via API
    this.stopJob();
  }
}
```

### AnalysisStage

```javascript
class AnalysisStage {
  constructor(options) {
    this.analysisVersion = options.analysisVersion || getCurrentVersion();
    this.limit = options.limit;
    this.stopRequested = false;
  }
  
  async execute(progress) {
    progress.emit('stage-started', { stage: 'analysis' });
    
    // Create analysis observable
    const observable = createAnalysisObservable({
      analysisVersion: this.analysisVersion,
      limit: this.limit
    });
    
    return new Promise((resolve, reject) => {
      const subscription = observable.subscribe({
        next: (data) => {
          if (this.stopRequested) {
            subscription.unsubscribe();
            resolve({ analysisComplete: false, stopped: true });
            return;
          }
          
          progress.emit('progress', {
            stage: 'analysis',
            current: data.current,
            total: data.total,
            rate: data.rate,
            eta: data.eta
          });
        },
        complete: () => {
          progress.emit('stage-completed', { stage: 'analysis' });
          resolve({ analysisComplete: true });
        },
        error: (err) => {
          reject(err);
        }
      });
    });
  }
  
  requestStop() {
    this.stopRequested = true;
  }
}
```

### DisambiguationStage

```javascript
class DisambiguationStage {
  constructor(options) {
    this.engine = new DisambiguationEngine(options.db);
    this.batchSize = options.batchSize || 100;
    this.stopRequested = false;
  }
  
  async execute(progress) {
    progress.emit('stage-started', { stage: 'disambiguation' });
    
    // Get unresolved mentions
    const mentions = await this.getUnresolvedMentions();
    const total = mentions.length;
    let processed = 0;
    
    // Process in batches
    for (let i = 0; i < mentions.length; i += this.batchSize) {
      if (this.stopRequested) break;
      
      const batch = mentions.slice(i, i + this.batchSize);
      await this.engine.disambiguateBatch(batch);
      
      processed += batch.length;
      progress.emit('progress', {
        stage: 'disambiguation',
        current: processed,
        total,
        rate: processed / (elapsed / 1000),
        eta: (total - processed) / rate
      });
    }
    
    progress.emit('stage-completed', { stage: 'disambiguation' });
    return { disambiguated: processed };
  }
  
  requestStop() {
    this.stopRequested = true;
  }
}
```

---

## Event Protocol

### Progress Events

```javascript
// Stage started
{
  type: 'stage-started',
  stage: 'crawl',  // or 'analysis', 'disambiguation', 'report'
  timestamp: '2026-01-05T10:00:00.000Z'
}

// Progress update
{
  type: 'progress',
  stage: 'crawl',
  current: 45,
  total: 100,
  rate: 2.3,
  eta: 24,
  timestamp: '2026-01-05T10:00:30.000Z'
}

// Stage completed
{
  type: 'stage-completed',
  stage: 'crawl',
  results: { pagesDownloaded: 100 },
  duration: 45000,
  timestamp: '2026-01-05T10:00:45.000Z'
}

// Pipeline complete
{
  type: 'pipeline-complete',
  stages: [
    { stage: 'crawl', duration: 45000, results: {...} },
    { stage: 'analysis', duration: 120000, results: {...} },
    { stage: 'disambiguation', duration: 30000, results: {...} }
  ],
  totalDuration: 200000,
  timestamp: '2026-01-05T10:03:20.000Z'
}
```

---

## Unified UI

### Multi-Stage Display

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Unified Pipeline                                             [Stop All] │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│ ┌────────────────────────────────────────────────────────────────────┐  │
│ │ CRAWL          ████████████████████████████████████████ 100%      │  │
│ │                100/100 pages │ 2.3/sec │ Complete ✓               │  │
│ └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│ ┌────────────────────────────────────────────────────────────────────┐  │
│ │ ANALYSIS       ████████████████████░░░░░░░░░░░░░░░░░░░░ 45%       │  │
│ │                45/100 pages │ 1.2/sec │ ETA: 0:46                 │  │
│ │                                                                    │  │
│ │ Current: https://bbc.com/news/world/article-123                   │  │
│ │ Method: XPath ✓ │ Timing: 89ms                                    │  │
│ └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│ ┌────────────────────────────────────────────────────────────────────┐  │
│ │ DISAMBIGUATION ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ pending   │  │
│ └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│ ┌────────────────────────────────────────────────────────────────────┐  │
│ │ REPORT         ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ pending   │  │
│ └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│ Elapsed: 02:15 │ Estimated Total: 05:30                                 │
└──────────────────────────────────────────────────────────────────────────┘
```

### Stage Transitions

```
Stage Complete
    │
    ├── Show completion checkmark ✓
    │
    ├── Collapse detailed view
    │
    ├── Expand next stage
    │
    └── Start next stage automatically
```

---

## Configuration

### Pipeline Config File

```json
{
  "pipeline": {
    "stages": ["crawl", "analysis", "disambiguation", "report"],
    "ui": "electron",
    "autoStart": true,
    "stopOnError": true
  },
  "crawl": {
    "operation": "siteExplorer",
    "maxPages": 500,
    "maxDepth": 3
  },
  "analysis": {
    "version": 1022,
    "xpathOnly": false,
    "skipSlowDomains": []
  },
  "disambiguation": {
    "minConfidence": 0.7,
    "useCoherence": true,
    "batchSize": 100
  },
  "report": {
    "format": ["json", "csv"],
    "outputDir": "exports"
  }
}
```

### CLI Override

```powershell
node tools/dev/unified-pipeline.js \
  --config pipeline.json \
  --seed https://example.com \
  --crawl.maxPages 100 \
  --analysis.xpathOnly true
```

---

## Error Handling

### Stage Failure

```javascript
async runPipeline() {
  for (const stage of this.stages) {
    try {
      const result = await stage.execute(this.progress);
      this.results[stage.name] = result;
    } catch (error) {
      this.progress.emit('stage-error', {
        stage: stage.name,
        error: error.message
      });
      
      if (this.options.stopOnError) {
        throw error;
      }
      
      // Continue to next stage
      this.results[stage.name] = { failed: true, error: error.message };
    }
  }
}
```

### Recovery Options

| Error Type | Default Behavior | Override |
|------------|------------------|----------|
| Crawl timeout | Stop pipeline | `--continue-on-error` |
| Analysis failure | Skip page, continue | Built-in |
| Disambiguation failure | Skip mention | Built-in |
| Report failure | Warn, complete | Built-in |

---

## Next Chapter

[Chapter 12: AI Agent Patterns →](12-ai-agent-patterns.md)
