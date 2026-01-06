# Chapter 7: Telemetry & Monitoring

## Overview

The telemetry system provides real-time event streaming via Server-Sent Events (SSE). It enables monitoring dashboards, progress tracking, and debugging.

## Architecture

```
┌─────────────┐      ┌─────────────────────┐      ┌─────────────┐
│   Crawler   │──────│ CrawlTelemetryBridge │──────│ SSE Clients │
│  (events)   │      │  (batching/history)  │      │ (browsers)  │
└─────────────┘      └─────────────────────┘      └─────────────┘
                               │
                               ▼
                     ┌─────────────────────┐
                     │ TelemetryIntegration │
                     │ (Express/SSE mount)  │
                     └─────────────────────┘
```

## Key Files

- [src/crawler/telemetry/CrawlTelemetrySchema.js](../../../src/crawler/telemetry/CrawlTelemetrySchema.js)
- [src/crawler/telemetry/CrawlTelemetryBridge.js](../../../src/crawler/telemetry/CrawlTelemetryBridge.js)
- [src/crawler/telemetry/TelemetryIntegration.js](../../../src/crawler/telemetry/TelemetryIntegration.js)

## Event Schema

### Crawl Phases

```javascript
const CRAWL_PHASES = {
  IDLE: 'idle',
  INITIALIZING: 'initializing',
  PLANNING: 'planning',
  DISCOVERING: 'discovering',
  CRAWLING: 'crawling',
  PROCESSING: 'processing',
  FINALIZING: 'finalizing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  PAUSED: 'paused',
  STOPPED: 'stopped'
};
```

### Event Types

| Category | Event Type | Description |
|----------|------------|-------------|
| Lifecycle | `crawl:started` | Crawl began |
| | `crawl:stopped` | Crawl stopped by user |
| | `crawl:paused` | Crawl paused |
| | `crawl:resumed` | Crawl resumed |
| | `crawl:completed` | Crawl finished successfully |
| | `crawl:failed` | Crawl failed with error |
| Phase | `crawl:phase:changed` | Phase transition |
| Progress | `crawl:progress` | Progress update |
| | `crawl:url:visited` | URL was fetched |
| | `crawl:url:queued` | URL was queued |
| | `crawl:url:error` | URL fetch failed |
| | `crawl:url:skipped` | URL was skipped |
| Goals | `crawl:goal:satisfied` | Goal reached |
| | `crawl:goal:progress` | Goal progress |
| | `crawl:budget:updated` | Budget changed |
| | `crawl:budget:exhausted` | Budget depleted |
| Workers | `crawl:worker:spawned` | Worker started |
| | `crawl:worker:stopped` | Worker stopped |
| | `crawl:worker:scaled` | Workers scaled |
| Checkpoints | `crawl:checkpoint:saved` | State saved |
| | `crawl:checkpoint:restored` | State restored |
| Metrics | `crawl:metrics:snapshot` | Metrics snapshot |
| | `crawl:rate:limited` | Rate limit hit |
| | `crawl:stalled` | Crawl stalled |

### Event Factory Functions

```javascript
// Progress event
const event = createProgressEvent({
  visited: 1500,
  queued: 3000,
  errors: 25,
  downloaded: 1200,
  articles: 450,
  requestsPerSec: 2.5,
  percentComplete: 33,
  currentUrl: 'https://example.com/article',
  phase: 'crawling'
}, {
  jobId: 'job-12345',
  crawlType: 'intelligent'
});

// Phase change event
const event = createPhaseChangeEvent('crawling', 'discovering', {
  jobId: 'job-12345'
});

// Goal satisfied event
const event = createGoalSatisfiedEvent({
  goalId: 'articles-target',
  goalType: 'count',
  target: 1000,
  current: 1000
});
```

### Event Envelope

All events share a common envelope:

```javascript
{
  schemaVersion: 1,
  id: 'crawl:progress-1704499200000-abc123',
  type: 'crawl:progress',
  topic: 'progress',
  tags: [],
  timestamp: '2024-01-06T00:00:00.000Z',
  timestampMs: 1704499200000,
  jobId: 'job-12345',
  crawlType: 'intelligent',
  severity: 'info',
  message: 'Progress: 1500 visited, 3000 queued, 25 errors',
  source: 'crawler',
  data: { ... }
}
```

## CrawlTelemetryBridge

### Configuration

```javascript
new CrawlTelemetryBridge({
  broadcast: (event) => {},          // Required: broadcast function
  historyLimit: 200,                  // Max events in history
  progressBatchInterval: 500,         // Progress batch delay (ms)
  urlEventBatchInterval: 200,         // URL event batch delay (ms)
  urlEventBatchSize: 50,              // Max URL events per batch
  broadcastUrlEvents: false,          // Include URL-level events
  defaultJobId: null,
  defaultCrawlType: 'standard'
});
```

### Event Batching

Progress events are batched to reduce SSE traffic:

```javascript
emitProgress(stats) {
  // Normalize stats
  const normalized = this._normalizeProgressStats(stats);

  // Update current state
  this._currentState.progress = normalized;
  this._currentState.lastProgressAt = Date.now();

  // Store pending progress
  this._pendingProgress = normalized;

  // Start batch timer if not running
  if (!this._progressTimer) {
    this._progressTimer = setTimeout(() => {
      this._flushProgress();
    }, this._progressBatchInterval);
  }
}

_flushProgress() {
  clearTimeout(this._progressTimer);
  this._progressTimer = null;

  if (this._pendingProgress) {
    const event = createProgressEvent(this._pendingProgress, this._defaultOptions);
    this._recordAndBroadcast(event);
    this._pendingProgress = null;
  }
}
```

URL events are also batched:

```javascript
_batchUrlEvent(event) {
  this._pendingUrlEvents.push(event);

  // Flush immediately if size threshold reached
  if (this._pendingUrlEvents.length >= this._urlEventBatchSize) {
    this._flushUrlEvents();
    return;
  }

  // Start batch timer
  if (!this._urlEventTimer) {
    this._urlEventTimer = setTimeout(() => {
      this._flushUrlEvents();
    }, this._urlEventBatchInterval);
  }
}

_flushUrlEvents() {
  clearTimeout(this._urlEventTimer);
  this._urlEventTimer = null;

  if (this._pendingUrlEvents.length > 0) {
    const batchEvent = {
      type: 'crawl:url:batch',
      data: {
        count: this._pendingUrlEvents.length,
        events: this._pendingUrlEvents
      }
    };
    this._recordAndBroadcast(batchEvent);
    this._pendingUrlEvents = [];
  }
}
```

### Crawler Connection

```javascript
connectCrawler(crawler, options = {}) {
  const { jobId, crawlType } = options;

  // Map crawler events to telemetry events
  const handlers = {
    'started': () => this.emitStarted(),
    'stopped': () => this.emitStopped(),
    'paused': () => this.emitPaused(),
    'resumed': () => this.emitResumed(),
    'phase:changed': (phase) => this.emitPhaseChange(phase),
    'progress': (stats) => this.emitProgress(stats),
    'goal:satisfied': (goal) => this.emitGoalSatisfied(goal),
    'url:visited': (info) => this.emitUrlVisited(info),
    'url:error': (info) => this.emitUrlError(info),
    'finished': (result) => {
      if (result.success) this.emitCompleted(result);
      else if (result.stopped) this.emitStopped(result);
      else this.emitFailed(result);
    }
  };

  // Attach handlers
  for (const [event, handler] of Object.entries(handlers)) {
    crawler.on(event, handler);
  }

  // Store disconnect function
  this._connectedCrawlers.set(crawler, () => {
    for (const [event, handler] of Object.entries(handlers)) {
      crawler.off(event, handler);
    }
  });

  return () => this._disconnectCrawler(crawler);
}
```

### Observable Stream

```javascript
// Get observable for in-process subscriptions
const observable = bridge.getObservable();

// Subscribe with history replay
const unsubscribe = bridge.subscribe((event) => {
  console.log('Telemetry:', event.type, event.data);
}, { replayHistory: true });

// Later: unsubscribe
unsubscribe();
```

## TelemetryIntegration

### Express/SSE Setup

```javascript
const integration = new TelemetryIntegration({
  historyLimit: 500,
  heartbeatInterval: 30000,       // 30s heartbeat
  allowOrigin: '*',               // CORS
  db: sqliteDb                    // Optional: persist to DB
});

// Mount SSE endpoint
integration.mountSSE(app, '/api/crawl-events');

// Mount remote observable endpoint
integration.mountRemoteObservable(app, '/api/crawl-telemetry/remote-obs');

// JSON history endpoint
app.get('/api/crawl-telemetry/history', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const history = integration.bridge.getHistory(limit);
  res.json({ status: 'ok', items: history });
});
```

### SSE Endpoint Implementation

```javascript
mountSSE(app, path = '/api/crawl-events') {
  app.get(path, (req, res) => {
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    // Send initial OK
    res.write(':ok\n\n');

    // Replay history
    const history = this.bridge.getHistory();
    for (const event of history) {
      const payload = JSON.stringify({ type: 'crawl:telemetry', data: event });
      res.write(`data: ${payload}\n\n`);
    }

    // Add to client set
    this.sseClients.add(res);

    // Handle disconnect
    req.on('close', () => {
      this.sseClients.delete(res);
    });
  });
}
```

### Heartbeat

```javascript
_startHeartbeat() {
  this.heartbeatTimer = setInterval(() => {
    const message = `:heartbeat ${Date.now()}\n\n`;

    // Send to all SSE clients
    for (const client of this.sseClients) {
      try {
        client.write(message);
      } catch (e) {
        this.sseClients.delete(client);
      }
    }
  }, this.heartbeatInterval);

  this.heartbeatTimer.unref();
}
```

## Client Integration

### Browser EventSource

```javascript
const eventSource = new EventSource('/api/crawl-events');

eventSource.onmessage = (event) => {
  const payload = JSON.parse(event.data);

  if (payload.type === 'crawl:telemetry') {
    const telemetry = payload.data;
    handleTelemetryEvent(telemetry);
  }
};

eventSource.onerror = (error) => {
  console.error('SSE error:', error);
  // EventSource auto-reconnects
};

function handleTelemetryEvent(event) {
  switch (event.type) {
    case 'crawl:progress':
      updateProgressUI(event.data);
      break;
    case 'crawl:phase:changed':
      updatePhaseUI(event.data.phase);
      break;
    case 'crawl:completed':
      showCompletionUI(event.data);
      break;
    case 'crawl:failed':
      showErrorUI(event.data);
      break;
  }
}
```

### React Integration

```jsx
function CrawlMonitor({ jobId }) {
  const [progress, setProgress] = useState(null);
  const [phase, setPhase] = useState('idle');

  useEffect(() => {
    const eventSource = new EventSource('/api/crawl-events');

    eventSource.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type !== 'crawl:telemetry') return;

      const { type, data } = payload.data;

      if (type === 'crawl:progress') {
        setProgress(data);
      } else if (type === 'crawl:phase:changed') {
        setPhase(data.phase);
      }
    };

    return () => eventSource.close();
  }, [jobId]);

  return (
    <div>
      <PhaseIndicator phase={phase} />
      {progress && <ProgressBar progress={progress} />}
    </div>
  );
}
```

## Client Reconnection

### History Replay

When clients reconnect, they receive full history:

```javascript
// Server side (in mountSSE)
const history = this.bridge.getHistory();
for (const event of history) {
  const payload = JSON.stringify({ type: 'crawl:telemetry', data: event });
  res.write(`data: ${payload}\n\n`);
}
```

### State Reconstruction

```javascript
// Client side
function reconstructState(history) {
  let currentPhase = 'idle';
  let latestProgress = null;
  let startedAt = null;

  for (const event of history) {
    switch (event.type) {
      case 'crawl:started':
        startedAt = event.timestamp;
        break;
      case 'crawl:phase:changed':
        currentPhase = event.data.phase;
        break;
      case 'crawl:progress':
        latestProgress = event.data;
        break;
    }
  }

  return { currentPhase, latestProgress, startedAt };
}
```

## Key Method Signatures

| Class | Method | Signature |
|-------|--------|-----------|
| CrawlTelemetryBridge | emitProgress | `emitProgress(stats, options)` |
| CrawlTelemetryBridge | emitPhaseChange | `emitPhaseChange(phase, options)` |
| CrawlTelemetryBridge | connectCrawler | `connectCrawler(crawler, options)` |
| CrawlTelemetryBridge | subscribe | `subscribe(onNext, options)` |
| CrawlTelemetryBridge | getHistory | `getHistory(limit)` |
| CrawlTelemetryBridge | getState | `getState()` |
| TelemetryIntegration | mountSSE | `mountSSE(app, path)` |
| TelemetryIntegration | getClientCount | `getClientCount()` |
| TelemetryIntegration | destroy | `destroy()` |

## Next Chapter

Continue to [Chapter 8: Crawl Modes](./08-crawl-modes.md) to learn about different crawl strategies.
