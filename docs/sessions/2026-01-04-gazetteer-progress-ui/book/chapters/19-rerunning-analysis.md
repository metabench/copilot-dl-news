# Chapter 19: Rerunning Analysis for Place Data

*Reading time: 10 minutes*

---

## Why Rerun Analysis?

Place disambiguation is an evolving system. As you improve:
- Feature weights
- Candidate generation rules
- Coherence algorithms
- Publisher priors
- Gazetteer data quality

...you'll want to reanalyze existing articles to apply these improvements retroactively.

**This chapter documents the canonical workflow for AI agents and humans to safely rerun analysis across the entire corpus.**

---

## The Analysis Observable Lab

The preferred method for rerunning analysis is the observable-wrapped lab:

```bash
# Location
labs/analysis-observable/

# Run with browser UI
node labs/analysis-observable/run-lab.js --limit 100

# Run with Electron app for desktop monitoring
node labs/analysis-observable/run-lab.js --limit 100 --electron

# Run headless (CLI only)
node labs/analysis-observable/run-lab.js --limit 100 --headless
```

---

## Pre-Flight Checklist for Full Reanalysis

Before rerunning analysis on the entire corpus:

### 1. Abandon Old Analysis Tasks

```javascript
// Query existing analysis tasks
const tasks = db.prepare(`
  SELECT task_id, status, created_at 
  FROM background_tasks 
  WHERE task_type = 'analysis-run'
  AND status NOT IN ('completed', 'abandoned')
`).all();

// Abandon with clear reason
for (const task of tasks) {
  db.prepare(`
    UPDATE background_tasks 
    SET status = 'abandoned', 
        abandoned_reason = 'obsolete_analysis_version',
        abandoned_at = datetime('now')
    WHERE task_id = ?
  `).run(task.task_id);
}
```

### 2. Verify Gazetteer State

Ensure your local SQLite gazetteer is up to date with the source of truth (PostGIS).

```bash
# Run the sync pipeline (see Chapter 10)
# This ensures places, place_names, and place_hierarchy are current
node tools/gazetteer/sync-pipeline.js --check
```

If the sync tool is not yet built, verify the table counts manually:

```sql
SELECT 'places', COUNT(*) FROM places
UNION ALL
SELECT 'place_names', COUNT(*) FROM place_names;
```

### 3. Estimate Workload

```sql
-- Count pages needing analysis
SELECT COUNT(*) as pending_pages
FROM urls 
WHERE analysis_version < :current_version
  AND is_html = 1
  AND downloaded = 1;
```

---

## Running the Observable Lab

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          Electron App                            │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Progress: 1,234 / 10,000 (12.3%)                           ││
│  │  ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░          ││
│  │                                                              ││
│  │  Updated: 1,180    Bytes: 45.2 MB    Elapsed: 5:23          ││
│  │  Places: 3,456     Records/sec: 2.1   ETA: 37:42            ││
│  └─────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
                              ▲
                              │ SSE (Server-Sent Events)
                              │
┌─────────────────────────────┴────────────────────────────────────┐
│  Express Server (:3099)                                           │
│  /sse/analysis-progress → Observable events                      │
│  /api/analysis/start → POST to begin                             │
│  /api/analysis/stop → POST to halt                               │
└──────────────────────────────────────────────────────────────────┘
```

### Metrics Tracked

| Metric | Description | Why It Matters |
|--------|-------------|----------------|
| `processed` | Pages analyzed | Progress indicator |
| `updated` | Pages with DB changes | Actual work done |
| `bytesProcessed` | Compressed HTML bytes | I/O throughput |
| `bytesPerSecond` | Rolling throughput | Performance baseline |
| `recordsPerSecond` | Pages per second | Time estimation |
| `placesInserted` | New place mentions | Disambiguation activity |
| `hubsInserted` | New hub detections | Hub discovery activity |
| `etaMs` | Estimated completion | Planning |

---

## For AI Agents

### Canonical Workflow

1. **Check for stale tasks first**
```bash
# Find old analysis tasks
SELECT task_id, status, created_at 
FROM background_tasks 
WHERE task_type = 'analysis-run';
```

2. **Abandon if needed**
```javascript
// Use this exact reason for traceability
abandonReason = 'obsolete_analysis_version';
```

3. **Run with observable for visibility**
```bash
node labs/analysis-observable/run-lab.js --limit 5 --headless
```

4. **Verify results**
```sql
-- Check analysis version distribution
SELECT analysis_version, COUNT(*) as count
FROM urls
WHERE is_html = 1
GROUP BY analysis_version
ORDER BY analysis_version DESC;
```

### E2E Test Fixture

For automated testing, use the limit-5 fixture:

```bash
node labs/analysis-observable/e2e-test.js
```

This verifies:
- Observable events are emitted
- Bytes/records stats are tracked
- SSE streaming works
- Completion is signaled properly

---

## Electron Apps for Long-Running Processes

**Design principle**: Long-running processes (analysis, sync, crawl) should always have an Electron app option for visual monitoring.

Benefits:
- Users see live progress without terminal scrolling
- Charts show throughput trends
- Stop button for graceful termination
- Persists after terminal closes

### Creating New Electron Wrappers

The analysis-observable lab serves as a template:

```javascript
// electron-main.js pattern
const { app, BrowserWindow } = require('electron');
const { createServer } = require('./my-server');

app.whenReady().then(async () => {
  const server = createServer({ port: 3099 });
  await server.start();
  
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    title: 'My Process Monitor'
  });
  
  win.loadURL('http://localhost:3099');
  
  win.on('closed', async () => {
    await server.stop();
    app.quit();
  });
});
```

---

## Incremental vs Full Reanalysis

### Incremental (Recommended for Most Cases)

Only analyze pages that haven't been analyzed at the current version:

```javascript
const summary = await analysePages({
  dbPath: 'data/news.db',
  analysisVersion: 2,  // Only pages with version < 2
  limit: 1000,
  onProgress: (info) => console.log(info)
});
```

### Full Reanalysis

Force reanalysis of all pages (rarely needed):

```sql
-- Reset analysis version to force full reanalysis
UPDATE urls SET analysis_version = 0 WHERE is_html = 1;
```

Then run without limit:

```bash
node labs/analysis-observable/run-lab.js --electron
```

---

## Monitoring and Alerting

### Key Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| `recordsPerSecond` | < 0.5 | < 0.1 |
| `bytesPerSecond` | < 10KB | < 1KB |
| Error rate | > 5% | > 20% |

### Log Analysis

The observable emits structured events:

```javascript
observable.subscribe({
  next: (msg) => {
    if (msg.value.lastError) {
      console.warn('[analysis] Error:', msg.value.lastError);
    }
  }
});
```

---

## Summary

- **Use the observable lab** for all significant reanalysis work
- **Abandon stale tasks** with `obsolete_analysis_version` reason
- **Prefer Electron apps** for long-running visual monitoring
- **Test with limit 5** before running full corpus
- **Track metrics** to catch performance regressions

The goal is observable, interruptible, resumable analysis with full visibility into progress and performance.
