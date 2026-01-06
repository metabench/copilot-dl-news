# Chapter 7: Telemetry & Events

> **Implementation Status**: ✅ Fully implemented with 6 event types and database persistence.

## Codebase Quick Reference

| Component | File Location | Status |
|-----------|---------------|--------|
| Event emitter | `src/crawler/CrawlerEvents.js` | ✅ 521 lines |
| TaskEventWriter | `src/db/TaskEventWriter.js` | ✅ DB persistence |
| Telemetry integration | `src/crawler/telemetry/TelemetryIntegration.js` | ✅ Bridge layer |
| CLI query tool | `tools/dev/task-events.js` | ✅ Complete |
| Live monitor | `tools/dev/crawl-live.js` | ✅ SSE streaming |

## Event Types Implemented

| Event | Emitter Method | Status |
|-------|----------------|--------|
| QUEUE | `emitQueueEvent()` | ✅ |
| PAGE | `emitPageEvent()` | ✅ |
| PROGRESS | `emitProgress()` | ✅ |
| TELEMETRY | `emitTelemetry()` | ✅ |
| MILESTONE | `emitMilestone()` | ✅ |
| PROBLEM | `emitProblem()` | ✅ |

## Event-Driven Architecture

The crawler emits events at every significant point:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          EVENT SOURCES                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────────────┐  │
│  │  Queue   │    │  Fetch   │    │ Planner  │    │ CrawlFinalizer   │  │
│  │          │    │          │    │          │    │                  │  │
│  │ QUEUE    │    │ PAGE     │    │ PRIORITY │    │ MILESTONE        │  │
│  │ events   │    │ events   │    │ events   │    │ SUMMARY          │  │
│  └────┬─────┘    └────┬─────┘    └────┬─────┘    └────────┬─────────┘  │
│       │               │               │                   │            │
│       └───────────────┴───────────────┴───────────────────┘            │
│                                   │                                     │
│                                   ▼                                     │
│                          ┌───────────────┐                             │
│                          │ CrawlerEvents │                             │
│                          │               │                             │
│                          │ • emit()      │                             │
│                          │ • filter()    │                             │
│                          │ • broadcast() │                             │
│                          └───────┬───────┘                             │
│                                  │                                      │
└──────────────────────────────────┼──────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          EVENT CONSUMERS                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌────────────┐ │
│  │ CliLogger   │   │TaskEventDB  │   │ SSE Stream  │   │ Progress   │ │
│  │             │   │             │   │             │   │ Callback   │ │
│  │ console     │   │ task_events │   │ /events     │   │ (custom)   │ │
│  │ output      │   │ table       │   │ endpoint    │   │            │ │
│  └─────────────┘   └─────────────┘   └─────────────┘   └────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Event Types

### QUEUE Events

Emitted when URLs enter/leave the queue.

```javascript
{
  type: 'QUEUE',
  action: 'enqueue',  // or 'dequeue', 'drop'
  url: 'https://example.com/page',
  depth: 2,
  priority: 1.5,
  reason: 'discovered from /index.html',
  timestamp: '2026-01-05T10:00:00.000Z'
}
```

| Action | Meaning |
|--------|---------|
| `enqueue` | URL added to queue |
| `dequeue` | URL taken for processing |
| `drop` | URL rejected (depth, pattern, seen) |

### PAGE Events

Emitted after fetching a page.

```javascript
{
  type: 'PAGE',
  url: 'https://example.com/article',
  status: 'success',  // or 'error', 'skip'
  httpStatus: 200,
  bytes: 45000,
  compressedBytes: 8200,
  timing: {
    fetchMs: 234,
    parseMs: 45,
    totalMs: 279
  },
  linksDiscovered: 15,
  timestamp: '2026-01-05T10:00:01.234Z'
}
```

### PROGRESS Events

Periodic summary of crawl state.

```javascript
{
  type: 'PROGRESS',
  visited: 45,
  queued: 123,
  dropped: 12,
  bytesTotal: 4500000,
  rate: 2.3,  // pages per second
  elapsed: 120,  // seconds
  eta: 180,  // seconds remaining (estimated)
  timestamp: '2026-01-05T10:02:00.000Z'
}
```

### TELEMETRY Events

System health metrics.

```javascript
{
  type: 'TELEMETRY',
  memory: {
    heapUsed: 125000000,
    heapTotal: 200000000,
    external: 5000000,
    rss: 250000000
  },
  queue: {
    size: 123,
    maxSeen: 500
  },
  timing: {
    avgFetchMs: 245,
    avgParseMs: 32,
    p95FetchMs: 890
  },
  timestamp: '2026-01-05T10:02:30.000Z'
}
```

### MILESTONE Events

Significant lifecycle points.

```javascript
{
  type: 'MILESTONE',
  phase: 'started',  // or 'completed', 'error'
  details: {
    operation: 'siteExplorer',
    seedUrl: 'https://example.com',
    maxPages: 500
  },
  timestamp: '2026-01-05T10:00:00.000Z'
}
```

### ERROR Events

Problems during crawl.

```javascript
{
  type: 'ERROR',
  url: 'https://example.com/broken',
  error: 'ETIMEDOUT',
  message: 'Connection timeout after 30000ms',
  retryable: true,
  retryCount: 2,
  timestamp: '2026-01-05T10:01:45.000Z'
}
```

---

## CrawlerEvents Class

The central event hub:

```javascript
// src/crawler/CrawlerEvents.js

class CrawlerEvents {
  constructor(options = {}) {
    this.listeners = new Map();
    this.verbosity = options.verbosity || 'normal';
    this.filters = options.filters || [];
  }
  
  emit(type, data) {
    const event = {
      type,
      ...data,
      timestamp: new Date().toISOString()
    };
    
    // Apply verbosity filter
    if (!this._shouldEmit(type)) {
      return;
    }
    
    // Broadcast to listeners
    const handlers = this.listeners.get(type) || [];
    handlers.forEach(handler => handler(event));
    
    // Broadcast to 'all' listeners
    const allHandlers = this.listeners.get('all') || [];
    allHandlers.forEach(handler => handler(event));
  }
  
  on(type, handler) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(handler);
  }
  
  _shouldEmit(type) {
    if (this.verbosity === 'silent') {
      return ['MILESTONE', 'ERROR'].includes(type);
    }
    if (this.verbosity === 'minimal') {
      return ['MILESTONE', 'ERROR', 'PROGRESS'].includes(type);
    }
    return true;
  }
}
```

---

## Event Persistence

### TaskEventWriter

Writes events to database for later analysis:

```javascript
// src/crawler/TaskEventWriter.js

class TaskEventWriter {
  constructor(db, taskId) {
    this.db = db;
    this.taskId = taskId;
    this.batch = [];
    this.batchSize = 100;
  }
  
  async write(event) {
    this.batch.push({
      task_id: this.taskId,
      event_type: event.type,
      category: this._categorize(event.type),
      severity: this._severity(event),
      scope: this._scope(event),
      data: JSON.stringify(event),
      created_at: event.timestamp
    });
    
    if (this.batch.length >= this.batchSize) {
      await this.flush();
    }
  }
  
  async flush() {
    if (this.batch.length === 0) return;
    
    await this.db.insertMany('task_events', this.batch);
    this.batch = [];
  }
  
  _categorize(type) {
    const map = {
      QUEUE: 'work',
      PAGE: 'work',
      PROGRESS: 'metric',
      TELEMETRY: 'metric',
      MILESTONE: 'lifecycle',
      ERROR: 'error'
    };
    return map[type] || 'other';
  }
}
```

### Querying Events

```powershell
# Recent events for a task
node tools/dev/task-events.js --get crawl-2026-01-05-001

# Errors only
node tools/dev/task-events.js --problems crawl-2026-01-05-001

# Summary statistics
node tools/dev/task-events.js --summary crawl-2026-01-05-001 --json
```

---

## Real-Time Streaming

### SSE Endpoint

```javascript
// Express route for SSE
app.get('/api/v1/events/:jobId', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const job = registry.getJob(req.params.jobId);
  if (!job) {
    res.status(404).end();
    return;
  }
  
  const handler = (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  
  job.events.on('all', handler);
  
  req.on('close', () => {
    job.events.off('all', handler);
  });
});
```

### Client Connection

```javascript
// Browser or Electron
const eventSource = new EventSource('/api/v1/events/job-123');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(`[${data.type}]`, data);
  updateUI(data);
};

eventSource.onerror = () => {
  console.log('Connection lost, reconnecting...');
};
```

---

## Verbosity Levels

| Level | Events Shown |
|-------|-------------|
| `silent` | MILESTONE, ERROR only |
| `minimal` | + PROGRESS |
| `normal` | + PAGE |
| `verbose` | + QUEUE, TELEMETRY |
| `debug` | Everything + internal |

### Setting Verbosity

```javascript
// Via options
const crawler = new NewsCrawler({
  outputVerbosity: 'silent'
});

// Via environment
process.env.CRAWL_VERBOSITY = 'minimal';

// Via API
node tools/dev/crawl-api.js jobs start op url --verbosity silent
```

---

## Telemetry Aggregation

### Metrics Collection

```javascript
class TelemetryAggregator {
  constructor() {
    this.metrics = {
      fetchTimings: [],
      parseTimings: [],
      bytesPerPage: [],
      errorsPerHour: []
    };
  }
  
  record(event) {
    if (event.type === 'PAGE') {
      this.metrics.fetchTimings.push(event.timing.fetchMs);
      this.metrics.parseTimings.push(event.timing.parseMs);
      this.metrics.bytesPerPage.push(event.bytes);
    }
    if (event.type === 'ERROR') {
      this.metrics.errorsPerHour.push(Date.now());
    }
  }
  
  summarize() {
    return {
      fetch: {
        avg: mean(this.metrics.fetchTimings),
        p50: percentile(this.metrics.fetchTimings, 50),
        p95: percentile(this.metrics.fetchTimings, 95)
      },
      parse: {
        avg: mean(this.metrics.parseTimings),
        p50: percentile(this.metrics.parseTimings, 50)
      },
      bytes: {
        total: sum(this.metrics.bytesPerPage),
        avg: mean(this.metrics.bytesPerPage)
      },
      errors: {
        total: this.metrics.errorsPerHour.length,
        rate: this._errorRate()
      }
    };
  }
}
```

---

## Debugging with Events

### Event Tracing

```powershell
# Watch all events in real-time
node tools/dev/crawl-live.js --task crawl-2026-01-05-001

# Filter to specific types
node tools/dev/crawl-live.js --task crawl-2026-01-05-001 --types PAGE,ERROR

# Save to file
node tools/dev/crawl-live.js --task crawl-2026-01-05-001 --output events.ndjson
```

### Post-Crawl Analysis

```powershell
# Timeline of events
node tools/dev/task-events.js --timeline crawl-2026-01-05-001

# Find slowest pages
node tools/dev/task-events.js --get crawl-2026-01-05-001 --category work --json |
  jq '.events | sort_by(.data.timing.totalMs) | reverse | .[0:10]'

# Error patterns
node tools/dev/task-events.js --problems crawl-2026-01-05-001 --json |
  jq '.events | group_by(.data.error) | map({error: .[0].data.error, count: length})'
```

---

## Next Chapter

[Chapter 8: Analysis Pipeline →](08-analysis-pipeline.md)
