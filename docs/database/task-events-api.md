# Task Events API

The `task_events` table provides unified event storage for crawls, background tasks, and other long-running operations. Events are stored in a format optimized for AI querying and replay analysis.

## CLI Tool (Recommended for Agents)

```bash
# List all tasks
node tools/dev/task-events.js --list
node tools/dev/task-events.js --list --type crawl

# Get summary of a specific crawl
node tools/dev/task-events.js --summary crawl-2025-01-01-001

# Find errors and warnings
node tools/dev/task-events.js --problems crawl-2025-01-01-001

# Search across all events
node tools/dev/task-events.js --search example.com --json

# Storage statistics
node tools/dev/task-events.js --stats
```

See [tools/dev/README.md](../../tools/dev/README.md#task-events--crawl--task-event-query-tool) for full CLI documentation.

## Table Schema

```sql
CREATE TABLE task_events (
  id INTEGER PRIMARY KEY,
  task_type TEXT NOT NULL,      -- 'crawl', 'analysis', 'compression', etc.
  task_id TEXT NOT NULL,        -- unique identifier for the task
  seq INTEGER NOT NULL,         -- sequence number within task (for ordering)
  ts TEXT NOT NULL,             -- ISO timestamp
  event_type TEXT NOT NULL,     -- e.g. 'crawl:start', 'url:fetched', 'error'
  event_category TEXT,          -- 'lifecycle', 'work', 'metric', 'error'
  severity TEXT,                -- 'info', 'warn', 'error'
  scope TEXT,                   -- domain:example.com, phase:discovery, etc.
  target TEXT,                  -- URL or specific target
  payload TEXT,                 -- JSON data
  duration_ms INTEGER,          -- denormalized for common queries
  http_status INTEGER,          -- denormalized for HTTP events
  item_count INTEGER            -- denormalized for batch events
);
```

### Indexes

- `idx_task_events_task_id_seq` - Primary query path
- `idx_task_events_task_type` - Filter by task type
- `idx_task_events_event_type` - Filter by event type
- `idx_task_events_severity` - Find problems quickly
- `idx_task_events_ts` - Time-based queries
- `idx_task_events_scope` - Filter by domain/phase
- `idx_task_events_target` - Find events for specific URL

## TaskEventWriter API

```javascript
const { TaskEventWriter } = require('../../src/db/TaskEventWriter');

const writer = new TaskEventWriter(db, {
  batchWrites: true,   // Buffer writes for efficiency (default: true)
  batchSize: 100,      // Flush after N events (default: 100)
  batchMs: 1000        // Flush after N ms (default: 1000)
});
```

### Writing Events

```javascript
// Direct write
writer.write({
  taskType: 'crawl',
  taskId: 'crawl-2025-01-01-001',
  eventType: 'url:fetched',
  data: {
    url: 'https://example.com/page',
    status: 200,
    durationMs: 150
  }
});

// From telemetry event (crawl events)
writer.writeTelemetryEvent(telemetryEvent);

// From background task manager
writer.writeBackgroundTaskEvent(taskEntry);
```

### Query Helpers

```javascript
// Get events for a task
const events = writer.getEvents('crawl-001', {
  eventType: 'url:fetched',  // optional filter
  category: 'work',           // optional filter
  severity: 'error',          // optional filter
  sinceSeq: 100,              // cursor for pagination
  limit: 50                   // max results
});

// Get summary statistics
const summary = writer.getSummary('crawl-001');
// Returns: { total_events, max_seq, first_ts, last_ts, error_count, warn_count, event_types[] }

// Get errors and warnings only
const problems = writer.getProblems('crawl-001');

// Get lifecycle timeline
const timeline = writer.getTimeline('crawl-001');

// List all tasks
const tasks = writer.listTasks({ taskType: 'crawl', limit: 20 });
```

### Pruning

```javascript
// Delete events older than N days
writer.pruneOlderThan(30);

// Delete all events for completed tasks
writer.pruneCompletedTasks();

// Delete specific task
writer.deleteTask('crawl-001');

// Get storage statistics
const stats = writer.getStorageStats();
// Returns: { totalEvents, totalTasks, estimatedPayloadBytes, eventsByType, oldestEvent, newestEvent }
```

## REST API Endpoints

All endpoints are under `/api/task-events`.

### GET /api/task-events/list

List all tasks with event counts.

Query parameters:
- `taskType` - Filter by task type
- `limit` - Max results (default: 50)

Response:
```json
[
  {
    "task_type": "crawl",
    "task_id": "crawl-001",
    "event_count": 150,
    "first_ts": "2025-01-01T00:00:00.000Z",
    "last_ts": "2025-01-01T00:05:00.000Z",
    "has_errors": 1,
    "has_warnings": 0
  }
]
```

### GET /api/task-events/:taskId

Get events for a specific task.

Query parameters:
- `eventType` - Filter by event type
- `category` - Filter by category
- `severity` - Filter by severity
- `sinceSeq` - Cursor for pagination
- `limit` - Max results (default: 100)

### GET /api/task-events/:taskId/summary

Get summary statistics for a task.

### GET /api/task-events/:taskId/problems

Get only errors and warnings for a task.

### GET /api/task-events/:taskId/timeline

Get lifecycle events (start, phase changes, end) for a task.

### DELETE /api/task-events/:taskId

Delete all events for a task.

### POST /api/task-events/prune

Prune old events.

Request body:
```json
{ "olderThanDays": 30 }
```

### GET /api/task-events/stats

Get storage statistics.

## Event Type Metadata

The system automatically categorizes events based on type:

| Event Pattern | Category | Severity |
|--------------|----------|----------|
| `*:start`, `*:end`, `started`, `stopped` | lifecycle | info |
| `url:*`, `page:*`, `fetch:*` | work | info |
| `*progress*`, `*metric*`, `*stats*` | metric | info |
| `error`, `*:error`, `fail*` | error | error |
| `warn*`, `*:warn*` | error | warn |

## Example: AI Query Patterns

```sql
-- Find all failed fetches for a crawl
SELECT target, payload
FROM task_events
WHERE task_id = ? AND event_type = 'url:error'
ORDER BY seq;

-- Get per-domain fetch counts
SELECT 
  scope,
  COUNT(*) as fetch_count,
  AVG(duration_ms) as avg_duration
FROM task_events
WHERE task_id = ? AND event_type = 'url:fetched'
GROUP BY scope;

-- Timeline of a crawl
SELECT seq, ts, event_type, scope
FROM task_events
WHERE task_id = ? AND event_category = 'lifecycle'
ORDER BY seq;

-- Find slowest fetches
SELECT target, duration_ms, http_status
FROM task_events
WHERE task_id = ? AND event_type = 'url:fetched'
ORDER BY duration_ms DESC
LIMIT 20;
```

## Integration Points

### Crawl Events

When a crawl runs, `TelemetryIntegration` automatically persists events via `TaskEventWriter`. The writer is created when you pass a `db` to TelemetryIntegration:

```javascript
const telemetry = new TelemetryIntegration({
  db: sqliteDb,
  eventWriterOptions: { batchSize: 100 }
});
```

### Background Tasks

Background tasks (compression, exports, etc.) emit events via `BackgroundTaskManager`. When configured with a TaskEventWriter:

```javascript
const emitter = backgroundTaskEventWriter.createBackgroundTaskEmitter();
const manager = new BackgroundTaskManager({
  emitTelemetry: emitter
});
```

## Cleanup Strategy

Recommended pruning schedule:

1. **Daily**: Prune events older than 30 days for completed tasks
2. **Weekly**: Prune events older than 7 days for failed/abandoned tasks
3. **On demand**: Delete specific task events when no longer needed

The `/api/task-events/prune` endpoint or `writer.pruneOlderThan()` handles cleanup.
