# Chapter 12: AI Agent Patterns

> **Implementation Status**: ✅ Patterns implemented across CLI tools.

## Codebase Quick Reference

| Pattern | Implementation | Status |
|---------|----------------|--------|
| JSON output | All `tools/dev/*.js` with `--json` flag | ✅ Consistent |
| Pre-flight checks | `crawl-api.js status`, `mcp-check.js` | ✅ Complete |
| Progress polling | `crawl-api.js jobs get`, `crawl-live.js` | ✅ Complete |
| Graceful stop | `crawl-api.js jobs stop`, SSE `/stop` | ✅ Complete |
| Retry patterns | `src/crawler/core/Crawler.js` retry logic | ✅ Built-in |
| Idempotent ops | Analysis version tracking | ✅ Complete |

## Key CLI Tools for Agents

| Tool | Purpose | Key Flags |
|------|---------|-----------|
| `tools/dev/crawl-daemon.js` | Daemon lifecycle | `start`, `stop`, `status` |
| `tools/dev/crawl-api.js` | HTTP API client | `--json`, `jobs start/get/stop` |
| `tools/dev/crawl-live.js` | SSE progress monitor | `--task`, `--json` |
| `tools/dev/task-events.js` | Query task DB | `--summary`, `--problems` |
| `tools/dev/mcp-check.js` | MCP server health | `--quick`, `--json` |

## Design Philosophy

The system is designed for **AI agent operation**:

- **JSON everywhere** — Machine-readable output
- **Quiet modes** — No noise by default
- **Idempotent operations** — Safe to retry
- **Progress visibility** — Know what's happening
- **Graceful degradation** — Errors don't crash

---

## Core Patterns

### 1. Pre-Flight Checks

Before any operation, verify prerequisites:

```powershell
# Check daemon status
$status = node tools/dev/crawl-api.js status --json | ConvertFrom-Json

if (-not $status.running) {
    node tools/dev/crawl-daemon.js start
    Start-Sleep -Seconds 2
}

# Verify daemon is responsive
$health = Invoke-RestMethod http://localhost:3099/health
if ($health.status -ne 'ok') {
    throw "Daemon not healthy"
}
```

### 2. JSON-First Communication

Always use `--json` for machine parsing:

```powershell
# Start a job
$result = node tools/dev/crawl-api.js jobs start siteExplorer https://example.com `
  --max-pages 50 --json | ConvertFrom-Json

$jobId = $result.jobId

# Poll for status
do {
    $status = node tools/dev/crawl-api.js jobs get $jobId --json | ConvertFrom-Json
    Start-Sleep -Seconds 5
} while ($status.status -eq 'running')

# Check outcome
if ($status.status -eq 'completed') {
    Write-Host "Success: $($status.progress.pagesVisited) pages"
} else {
    Write-Host "Failed: $($status.error)"
}
```

### 3. Progress Polling Pattern

```javascript
async function waitForCompletion(jobId, { pollInterval = 5000, timeout = 3600000 } = {}) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const status = await getJobStatus(jobId);
    
    // Emit progress for observability
    console.log(JSON.stringify({
      type: 'poll',
      jobId,
      status: status.status,
      progress: status.progress,
      elapsed: Date.now() - startTime
    }));
    
    if (status.status === 'completed') {
      return { success: true, result: status };
    }
    
    if (status.status === 'failed' || status.status === 'stopped') {
      return { success: false, error: status.error || status.exitReason };
    }
    
    await sleep(pollInterval);
  }
  
  return { success: false, error: 'timeout' };
}
```

### 4. Error Recovery Pattern

```javascript
async function runWithRetry(operation, { maxRetries = 3, backoff = 1000 } = {}) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      // Log attempt
      console.log(JSON.stringify({
        type: 'retry',
        attempt,
        maxRetries,
        error: error.message,
        nextRetryIn: backoff * attempt
      }));
      
      // Check if retryable
      if (!isRetryable(error)) {
        throw error;
      }
      
      await sleep(backoff * attempt);
    }
  }
  
  throw lastError;
}

function isRetryable(error) {
  const retryablePatterns = [
    /ECONNREFUSED/,
    /ETIMEDOUT/,
    /ECONNRESET/,
    /rate limit/i,
    /503/,
    /504/
  ];
  return retryablePatterns.some(p => p.test(error.message));
}
```

---

## Agent Workflows

### Full Crawl + Analysis Workflow

```javascript
async function fullPipelineWorkflow(seedUrl, options = {}) {
  const log = (type, data) => console.log(JSON.stringify({ type, ...data }));
  
  // Phase 1: Pre-flight
  log('phase', { phase: 'preflight', status: 'starting' });
  
  const daemonOk = await ensureDaemonRunning();
  if (!daemonOk) {
    log('error', { message: 'Failed to start daemon' });
    return { success: false, error: 'daemon_failed' };
  }
  
  // Phase 2: Crawl
  log('phase', { phase: 'crawl', status: 'starting' });
  
  const crawlResult = await runWithRetry(async () => {
    const job = await startCrawlJob(seedUrl, options);
    return await waitForCompletion(job.jobId);
  });
  
  if (!crawlResult.success) {
    log('error', { phase: 'crawl', error: crawlResult.error });
    return { success: false, error: 'crawl_failed', details: crawlResult };
  }
  
  log('phase', { phase: 'crawl', status: 'complete', pages: crawlResult.result.progress.pagesVisited });
  
  // Phase 3: Analysis
  log('phase', { phase: 'analysis', status: 'starting' });
  
  const analysisResult = await runAnalysis({
    limit: crawlResult.result.progress.pagesVisited,
    analysisVersion: options.analysisVersion
  });
  
  log('phase', { phase: 'analysis', status: 'complete', analyzed: analysisResult.processed });
  
  // Phase 4: Summary
  return {
    success: true,
    crawl: {
      pages: crawlResult.result.progress.pagesVisited,
      bytes: crawlResult.result.progress.bytesDownloaded
    },
    analysis: {
      processed: analysisResult.processed,
      succeeded: analysisResult.succeeded
    }
  };
}
```

### Incremental Update Workflow

```javascript
async function incrementalUpdateWorkflow(hubUrl, options = {}) {
  const log = (type, data) => console.log(JSON.stringify({ type, ...data }));
  
  // Use hub refresh operation (shallow crawl)
  const job = await startCrawlJob(hubUrl, {
    operation: 'hubRefresh',
    maxPages: 50,
    maxDepth: 1
  });
  
  const crawlResult = await waitForCompletion(job.jobId);
  
  // Only analyze newly downloaded pages
  const newPages = await getNewPagesSince(crawlResult.startTime);
  
  if (newPages.length === 0) {
    log('info', { message: 'No new pages to analyze' });
    return { success: true, newPages: 0 };
  }
  
  log('info', { message: `Analyzing ${newPages.length} new pages` });
  
  const analysisResult = await runAnalysis({
    urls: newPages.map(p => p.url),
    analysisVersion: options.analysisVersion
  });
  
  return {
    success: true,
    newPages: newPages.length,
    analyzed: analysisResult.processed
  };
}
```

---

## Status Reporting

### Progress Event Format

```javascript
{
  "type": "progress",
  "timestamp": "2026-01-05T10:00:00.000Z",
  "phase": "crawl",
  "current": 45,
  "total": 100,
  "rate": 2.3,
  "eta": 24,
  "memory": {
    "heapUsed": 125000000,
    "rss": 250000000
  }
}
```

### Completion Event Format

```javascript
{
  "type": "complete",
  "timestamp": "2026-01-05T10:05:00.000Z",
  "success": true,
  "duration": 300000,
  "results": {
    "crawl": {
      "pages": 100,
      "bytes": 4500000,
      "errors": 3
    },
    "analysis": {
      "processed": 97,
      "succeeded": 95,
      "failed": 2
    }
  }
}
```

### Error Event Format

```javascript
{
  "type": "error",
  "timestamp": "2026-01-05T10:03:00.000Z",
  "phase": "crawl",
  "recoverable": true,
  "error": {
    "code": "ETIMEDOUT",
    "message": "Connection timeout after 30000ms",
    "url": "https://example.com/slow-page"
  },
  "action": "skipped"  // or "retried", "aborted"
}
```

---

## Decision Patterns

### Operation Selection

```javascript
function selectOperation(goal, context) {
  const decisions = {
    'discover_site': 'siteExplorer',
    'quick_check': 'quickDiscovery',
    'refresh_hubs': 'hubRefresh',
    'find_news': 'newsDiscovery',
    'full_archive': 'fullCrawl'
  };
  
  const operation = decisions[goal] || 'quickDiscovery';
  
  console.log(JSON.stringify({
    type: 'decision',
    category: 'operation',
    input: { goal, context },
    output: operation,
    reasoning: `Goal "${goal}" maps to operation "${operation}"`
  }));
  
  return operation;
}
```

### Analysis Strategy Selection

```javascript
function selectAnalysisStrategy(context) {
  // Few pages → inline analysis
  if (context.newPages < 10) {
    return { mode: 'inline', async: false };
  }
  
  // Many pages → background with UI
  if (context.newPages > 100) {
    return { mode: 'background', ui: 'electron' };
  }
  
  // Medium → headless background
  return { mode: 'background', ui: 'headless' };
}
```

---

## Resource Management

### Daemon Lifecycle

```javascript
async function manageDaemonLifecycle() {
  // Check if daemon is needed
  const hasWork = await checkPendingWork();
  const daemonStatus = await getDaemonStatus();
  
  if (hasWork && !daemonStatus.running) {
    // Start daemon for work
    await startDaemon();
    return { action: 'started' };
  }
  
  if (!hasWork && daemonStatus.running && daemonStatus.idleTime > 3600) {
    // Stop daemon if idle for 1 hour
    await stopDaemon();
    return { action: 'stopped', reason: 'idle_timeout' };
  }
  
  return { action: 'none', status: daemonStatus };
}
```

### Memory Monitoring

```javascript
function checkMemoryPressure() {
  const usage = process.memoryUsage();
  const heapPercent = usage.heapUsed / usage.heapTotal;
  
  if (heapPercent > 0.9) {
    return {
      pressure: 'critical',
      action: 'reduce_batch_size',
      heapPercent
    };
  }
  
  if (heapPercent > 0.7) {
    return {
      pressure: 'warning',
      action: 'monitor',
      heapPercent
    };
  }
  
  return { pressure: 'ok', heapPercent };
}
```

---

## Best Practices

### 1. Always Use JSON Output

```powershell
# Good
node tool.js --json | ConvertFrom-Json

# Bad (fragile parsing)
node tool.js | Select-String "pages: (\d+)"
```

### 2. Implement Timeout Everywhere

```javascript
// Good
const result = await Promise.race([
  operation(),
  timeout(30000, 'Operation timed out')
]);

// Bad
const result = await operation();  // May hang forever
```

### 3. Log Decisions

```javascript
// Good - explain the decision
console.log(JSON.stringify({
  type: 'decision',
  category: 'retry',
  input: { error: err.message, attempt: 2 },
  output: 'retry',
  reasoning: 'Error is transient (ETIMEDOUT), attempt 2 of 3'
}));

// Bad - silent behavior
if (isRetryable(err)) await retry();
```

### 4. Graceful Degradation

```javascript
// Good - degrade gracefully
try {
  await runFullAnalysis();
} catch (error) {
  console.log(JSON.stringify({ type: 'warning', message: 'Full analysis failed, running basic' }));
  await runBasicAnalysis();
}

// Bad - fail completely
await runFullAnalysis();  // If this fails, nothing works
```

### 5. Idempotent Operations

```javascript
// Good - safe to retry
async function ensureAnalyzed(url) {
  const existing = await getAnalysis(url);
  if (existing && existing.version >= CURRENT_VERSION) {
    return existing;  // Already done
  }
  return await analyze(url);
}

// Bad - duplicates on retry
async function analyze(url) {
  await insertAnalysis(url, result);  // Duplicate if retried
}
```

---

## Next Chapter

[Chapter 13: Error Recovery →](13-error-recovery.md)
