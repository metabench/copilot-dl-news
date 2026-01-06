# Chapter 4: Crawl Architecture

> **Implementation Status**: ✅ Fully implemented. See [Chapter 16](16-implementation-guide.md) for file locations.

## Codebase Quick Reference

| Component | File Location |
|-----------|---------------|
| Daemon core | `src/cli/crawl/daemon.js` |
| Daemon CLI | `tools/dev/crawl-daemon.js` |
| API client | `tools/dev/crawl-api.js` |
| Operations facade | `src/crawler/CrawlOperations.js` |
| Event emitter | `src/crawler/CrawlerEvents.js` |
| API routes | `src/api/routes/crawl.js` |
| Multi-modal orchestrator | `src/crawler/multimodal/MultiModalCrawlOrchestrator.js` |
| Multi-modal manager | `src/crawler/multimodal/MultiModalCrawlManager.js` |
| Multi-modal SSE/API server | `src/ui/server/multiModalCrawl/server.js` |
| Multi-modal CLI | `tools/crawl-multi-modal.js` |

## Multi-Modal Crawl Mode

The multi-modal crawler runs an **endless loop** of download → analyze → learn → re-analyze.
It sits alongside the daemon-driven crawl stack but uses the same `CrawlOperations` facade.
For multi-domain concurrency, `MultiModalCrawlManager` coordinates multiple orchestrators with
a parallelism cap and forwards events to the SSE API.

Recent improvements prioritize hub coverage: early batches trigger hub discovery more aggressively,
hub discovery runs a sequence preset (default `intelligentCountryHubDiscovery`), and a hub-guessing
pass can seed place hubs before analysis cycles continue. Defaults target ~1000 downloads per batch
to ensure enough material for pattern learning.

## Component Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           USER INTERFACE                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────┐    ┌──────────────────┐    ┌─────────────────┐   │
│  │   crawl-api.js   │    │   mini-crawl.js  │    │   Electron UI   │   │
│  │   (CLI client)   │    │   (quick test)   │    │   (dashboard)   │   │
│  └────────┬─────────┘    └────────┬─────────┘    └────────┬────────┘   │
│           │                       │                       │             │
└───────────┼───────────────────────┼───────────────────────┼─────────────┘
            │                       │                       │
            ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          DAEMON LAYER                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                      crawl-daemon.js                              │  │
│  │                                                                   │  │
│  │  • HTTP server on port 3099                                       │  │
│  │  • Detached background process                                    │  │
│  │  • Early console filter (quiet mode)                              │  │
│  │  • Job registry and lifecycle                                     │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                              │                                          │
│                              ▼                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                     CrawlOperations API                           │  │
│  │                                                                   │  │
│  │  POST /api/v1/jobs/start    — Start new crawl                     │  │
│  │  GET  /api/v1/jobs/:id      — Job status                          │  │
│  │  POST /api/v1/jobs/:id/stop — Stop running crawl                  │  │
│  │  GET  /api/v1/operations    — Available operations                │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          CRAWLER CORE                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────────┐  │
│  │ NewsCrawler  │───▶│   Crawler    │───▶│   CrawlerEvents          │  │
│  │              │    │   (core)     │    │                          │  │
│  │ • operations │    │ • queue      │    │ • QUEUE events           │  │
│  │ • DB writes  │    │ • fetch loop │    │ • PAGE events            │  │
│  │ • evidence   │    │ • depth mgmt │    │ • PROGRESS events        │  │
│  └──────────────┘    └──────────────┘    │ • TELEMETRY events       │  │
│         │                   │             └──────────────────────────┘  │
│         ▼                   ▼                                           │
│  ┌──────────────┐    ┌──────────────┐                                  │
│  │   Planner    │    │  Finalizer   │                                  │
│  │              │    │              │                                  │
│  │ • priority   │    │ • summary    │                                  │
│  │ • scoring    │    │ • cleanup    │                                  │
│  │ • depth ctrl │    │ • evidence   │                                  │
│  └──────────────┘    └──────────────┘                                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Daemon Architecture

### Process Model

The daemon runs as a **detached background process**:

```
Terminal Session                    Background
     │                                  │
     │  node crawl-daemon.js start      │
     │  ───────────────────────────────▶│
     │                                  │  spawns detached child
     │                                  │        │
     │  (terminal closes)               │        ▼
     │                                  │  ┌──────────────┐
                                        │  │ daemon.js    │
                                        │  │ PID: 12345   │
                                        │  │ Port: 3099   │
                                        │  └──────────────┘
                                        │        │
                                        │        ▼
                                        │  tmp/crawl-daemon.pid
                                        │  tmp/crawl-daemon.log
```

### File Locations

| File | Purpose |
|------|---------|
| `tmp/crawl-daemon.pid` | Process ID for stop/status |
| `tmp/crawl-daemon.log` | All daemon output |
| `src/cli/crawl/daemon.js` | Core daemon module |
| `tools/dev/crawl-daemon.js` | CLI wrapper |

### Early Console Filter

The daemon intercepts console.log before any modules load:

```javascript
// At very top of daemon.js, before any requires

const _daemonBlockPatterns = [
  /^\s*QUEUE\s*│/i,
  /^\s*PROGRESS\s*│/i,
  /TELEMETRY\s*│/i,
  /Fetching:/i,
  /Enhanced features enabled/i,
  /Crawl completed$/i,
  // ... 40+ patterns
];

const _origConsoleLog = console.log;
const _origConsoleInfo = console.info;

function _shouldDaemonBlockAny(...args) {
  return args.some((a, i) => _shouldDaemonBlock(String(a)));
}

console.log = function (...args) {
  if (!_shouldDaemonBlockAny(...args)) {
    _origConsoleLog.apply(console, args);
  }
};
```

**Why early filter?**
- Modules like NewsCrawler use `createCliLogger()` which writes to console
- Without early intercept, noise appears before daemon can suppress it
- Pattern-based filter catches all variations

---

## API Design

### Job Lifecycle

```
        start                run               complete
   ○ ─────────▶ STARTING ─────────▶ RUNNING ─────────▶ COMPLETED
                    │                  │
                    │ error            │ stop
                    ▼                  ▼
                 FAILED             STOPPED
```

### Endpoints

#### POST /api/v1/jobs/start

Start a new crawl job.

**Request:**
```json
{
  "operation": "siteExplorer",
  "seedUrl": "https://bbc.com",
  "options": {
    "maxPages": 100,
    "maxDepth": 2
  }
}
```

**Response:**
```json
{
  "success": true,
  "jobId": "job-1704412800000-abc123",
  "taskId": "crawl-2026-01-05-001",
  "status": "starting"
}
```

#### GET /api/v1/jobs/:id

Get job status.

**Response:**
```json
{
  "jobId": "job-1704412800000-abc123",
  "status": "running",
  "progress": {
    "pagesVisited": 45,
    "pagesQueued": 123,
    "bytesDownloaded": 4500000
  },
  "timing": {
    "startedAt": "2026-01-05T10:00:00Z",
    "elapsed": 120
  }
}
```

#### POST /api/v1/jobs/:id/stop

Request graceful stop.

**Response:**
```json
{
  "success": true,
  "message": "Stop requested"
}
```

---

## Operations

Operations are named crawl configurations:

| Operation | Purpose | Default Max |
|-----------|---------|-------------|
| `quickDiscovery` | Fast site probe | 10 pages |
| `siteExplorer` | Thorough exploration | 500 pages |
| `hubRefresh` | Update known hubs | 50 pages |
| `fullCrawl` | Complete site crawl | 10000 pages |

### Operation Config

```javascript
// src/crawler/operations/siteExplorer.js
module.exports = {
  name: 'siteExplorer',
  maxPages: 500,
  maxDepth: 3,
  respectRobots: true,
  followExternalLinks: false,
  priorityRules: [
    { pattern: /\/news\//, boost: 2.0 },
    { pattern: /\/article\//, boost: 1.5 },
    { pattern: /\/archive\//, penalty: 0.5 }
  ]
};
```

---

## Event System

The crawler emits events via `CrawlerEvents`:

### Event Types

| Event | Frequency | Data |
|-------|-----------|------|
| `QUEUE` | Per URL | url, action (add/drop/pop) |
| `PAGE` | Per fetch | url, status, bytes, timing |
| `PROGRESS` | Every 10 pages | visited, queued, rate |
| `TELEMETRY` | Every 30s | timing, memory, queue size |
| `MILESTONE` | Key points | phase, details |
| `ERROR` | On failure | url, error, retryable |

### Event Flow

```
Crawler ──▶ CrawlerEvents ──▶ Listeners
                  │
                  ├──▶ CrawlOperations (job registry)
                  ├──▶ CliLogger (console output)
                  ├──▶ TaskEventWriter (database)
                  └──▶ SSE stream (real-time UI)
```

### Quiet Mode

When `outputVerbosity: 'silent'`:

1. `CrawlerEvents._log()` filters based on verbosity
2. Early console filter catches direct console.log calls
3. Only critical errors and lifecycle events pass through

---

## Queue Management

### Priority Queue

URLs are scored and processed in priority order:

```
High Priority                              Low Priority
    │                                           │
    ▼                                           ▼
┌────────┬────────┬────────┬────────┬────────┬────────┐
│ /news/ │/latest/│/world/ │ /2024/ │/archive│ /old/  │
│ score  │ score  │ score  │ score  │ score  │ score  │
│  2.5   │  2.0   │  1.5   │  1.0   │  0.5   │  0.3   │
└────────┴────────┴────────┴────────┴────────┴────────┘
```

### Queue Events

```
ENQUEUE: url added to queue
DEQUEUE: url removed for processing
DROP:    url rejected (depth/pattern/seen)
```

---

## Error Handling

### Retry Strategy

```javascript
const retryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
  retryableStatuses: [429, 503, 504]
};
```

### Error Categories

| Category | Action | Example |
|----------|--------|---------|
| Transient | Retry | 503, timeout |
| Permanent | Skip | 404, 403 |
| Rate limit | Backoff | 429 |
| Parse error | Log, skip | Invalid HTML |

---

## Next Chapter

[Chapter 5: The Daemon in Detail →](05-daemon-detail.md)
