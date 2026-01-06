# Chapter 13: Error Recovery

> **Implementation Status**: ✅ Core patterns implemented in crawler and analysis systems.

## Codebase Quick Reference

| Pattern | Implementation | Status |
|---------|----------------|--------|
| Exponential backoff | `src/crawler/core/Crawler.js` | ✅ Built-in |
| Circuit breaker | `src/crawler/core/RequestHandler.js` | 🔄 Partial |
| Rate limiting | `src/crawler/core/RequestHandler.js` | ✅ Complete |
| Graceful shutdown | `src/cli/crawl/daemon.js` SIGTERM handling | ✅ Complete |
| Transaction recovery | `src/db/sqlite/v1/` transaction handling | ✅ Complete |
| Health check | `/health` endpoint in daemon | ✅ Complete |

## Error Categories

### Transient Errors

Temporary failures that typically resolve:

| Error | Cause | Recovery |
|-------|-------|----------|
| `ETIMEDOUT` | Network timeout | Retry with backoff |
| `ECONNRESET` | Connection dropped | Retry immediately |
| `ECONNREFUSED` | Service unavailable | Wait, retry |
| HTTP 429 | Rate limited | Backoff, retry |
| HTTP 503 | Service overloaded | Backoff, retry |
| HTTP 504 | Gateway timeout | Retry |

### Permanent Errors

Failures that won't resolve with retry:

| Error | Cause | Recovery |
|-------|-------|----------|
| HTTP 404 | Page not found | Skip, log |
| HTTP 403 | Access denied | Skip, log |
| HTTP 410 | Gone permanently | Skip, mark dead |
| Parse error | Malformed HTML | Skip, log |
| Validation error | Bad data | Skip, log |

### Systemic Errors

Infrastructure failures:

| Error | Cause | Recovery |
|-------|-------|----------|
| OOM | Memory exhausted | Reduce batch, restart |
| Disk full | No space | Alert, wait |
| DB locked | Concurrent access | Retry with backoff |
| Port in use | Service conflict | Find/kill conflict |

---

## Retry Strategies

### Exponential Backoff

```javascript
async function retryWithBackoff(operation, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    factor = 2
  } = options;
  
  let delay = initialDelay;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryable(error) || attempt === maxRetries) {
        throw error;
      }
      
      console.log(JSON.stringify({
        type: 'retry',
        attempt,
        maxRetries,
        error: error.message,
        delay
      }));
      
      await sleep(delay);
      delay = Math.min(delay * factor, maxDelay);
    }
  }
}
```

### Circuit Breaker

```javascript
class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000;
    this.failures = 0;
    this.state = 'closed';  // closed, open, half-open
    this.lastFailure = null;
  }
  
  async call(operation) {
    // Check if circuit is open
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > this.resetTimeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }
    
    try {
      const result = await operation();
      
      // Success - reset on half-open
      if (this.state === 'half-open') {
        this.state = 'closed';
        this.failures = 0;
      }
      
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailure = Date.now();
      
      if (this.failures >= this.failureThreshold) {
        this.state = 'open';
        console.log(JSON.stringify({
          type: 'circuit-breaker',
          action: 'opened',
          failures: this.failures,
          resetIn: this.resetTimeout
        }));
      }
      
      throw error;
    }
  }
}
```

### Rate Limiting

```javascript
class RateLimiter {
  constructor(options = {}) {
    this.maxRequests = options.maxRequests || 10;
    this.windowMs = options.windowMs || 1000;
    this.queue = [];
  }
  
  async throttle(operation) {
    const now = Date.now();
    
    // Remove old entries
    this.queue = this.queue.filter(t => now - t < this.windowMs);
    
    // Check limit
    if (this.queue.length >= this.maxRequests) {
      const waitTime = this.windowMs - (now - this.queue[0]);
      console.log(JSON.stringify({
        type: 'rate-limit',
        action: 'waiting',
        waitMs: waitTime
      }));
      await sleep(waitTime);
      return this.throttle(operation);
    }
    
    // Execute
    this.queue.push(now);
    return operation();
  }
}
```

---

## Error Recovery Flows

### Crawl Error Recovery

```
Page Fetch Error
        │
        ▼
┌─────────────────────┐
│ Is error retryable? │
└─────────────────────┘
    │yes         │no
    ▼            ▼
┌─────────────┐  ┌─────────────┐
│ Retry count │  │ Log & skip  │
│ < max?      │  │             │
└─────────────┘  └─────────────┘
    │yes    │no
    ▼       ▼
┌───────┐  ┌─────────────┐
│ Retry │  │ Mark failed │
│       │  │ Continue    │
└───────┘  └─────────────┘
```

### Analysis Error Recovery

```javascript
async function analyzeWithRecovery(page) {
  // Stage 1: Decompression
  let html;
  try {
    html = await decompress(page.compressed_html);
  } catch (error) {
    return {
      url: page.url,
      failed: true,
      stage: 'decompression',
      error: error.message
    };
  }
  
  // Stage 2: Extraction (with fallback)
  let article;
  try {
    article = await extractWithXPath(html, page.url);
  } catch (xpathError) {
    console.log(JSON.stringify({
      type: 'fallback',
      stage: 'extraction',
      from: 'xpath',
      to: 'readability',
      reason: xpathError.message
    }));
    
    try {
      article = await extractWithReadability(html, page.url);
    } catch (readabilityError) {
      return {
        url: page.url,
        failed: true,
        stage: 'extraction',
        error: readabilityError.message
      };
    }
  }
  
  // Stage 3: Classification (non-fatal)
  let categories = [];
  try {
    categories = await classify(article);
  } catch (error) {
    console.log(JSON.stringify({
      type: 'warning',
      stage: 'classification',
      error: error.message,
      action: 'continuing with empty categories'
    }));
  }
  
  // Stage 4: Database write
  try {
    await saveAnalysis(page.url, { article, categories });
    return { url: page.url, success: true };
  } catch (error) {
    return {
      url: page.url,
      failed: true,
      stage: 'database',
      error: error.message
    };
  }
}
```

---

## Daemon Recovery

### Daemon Health Check

```javascript
async function healthCheck() {
  const checks = {
    daemon: false,
    database: false,
    memory: false,
    disk: false
  };
  
  // Check daemon
  try {
    const response = await fetch('http://localhost:3099/health');
    checks.daemon = response.ok;
  } catch {
    checks.daemon = false;
  }
  
  // Check database
  try {
    await db.query('SELECT 1');
    checks.database = true;
  } catch {
    checks.database = false;
  }
  
  // Check memory
  const memory = process.memoryUsage();
  checks.memory = memory.heapUsed / memory.heapTotal < 0.9;
  
  // Check disk
  const diskSpace = await checkDiskSpace('.');
  checks.disk = diskSpace.free > 1024 * 1024 * 100;  // 100MB
  
  return {
    healthy: Object.values(checks).every(v => v),
    checks
  };
}
```

### Daemon Auto-Recovery

```javascript
class DaemonWatchdog {
  constructor(options = {}) {
    this.checkInterval = options.checkInterval || 30000;
    this.maxRestarts = options.maxRestarts || 3;
    this.restarts = 0;
    this.running = false;
  }
  
  start() {
    this.running = true;
    this.watch();
  }
  
  async watch() {
    while (this.running) {
      const health = await healthCheck();
      
      if (!health.healthy) {
        console.log(JSON.stringify({
          type: 'watchdog',
          action: 'unhealthy',
          checks: health.checks
        }));
        
        if (this.restarts < this.maxRestarts) {
          await this.recover(health);
        } else {
          console.log(JSON.stringify({
            type: 'watchdog',
            action: 'max-restarts',
            message: 'Manual intervention required'
          }));
          this.running = false;
        }
      }
      
      await sleep(this.checkInterval);
    }
  }
  
  async recover(health) {
    if (!health.checks.daemon) {
      console.log(JSON.stringify({
        type: 'watchdog',
        action: 'restart-daemon'
      }));
      
      await stopDaemon();
      await sleep(2000);
      await startDaemon();
      this.restarts++;
    }
    
    if (!health.checks.memory) {
      console.log(JSON.stringify({
        type: 'watchdog',
        action: 'force-gc'
      }));
      
      if (global.gc) {
        global.gc();
      }
    }
  }
  
  stop() {
    this.running = false;
  }
}
```

---

## Database Recovery

### Connection Pool Recovery

```javascript
class DatabasePool {
  constructor(options) {
    this.options = options;
    this.pool = null;
    this.healthyConnections = 0;
  }
  
  async getConnection() {
    if (!this.pool) {
      await this.createPool();
    }
    
    try {
      const conn = await this.pool.acquire();
      
      // Verify connection
      await conn.query('SELECT 1');
      return conn;
    } catch (error) {
      console.log(JSON.stringify({
        type: 'db-recovery',
        action: 'connection-failed',
        error: error.message
      }));
      
      // Recreate pool
      await this.recreatePool();
      return this.getConnection();
    }
  }
  
  async recreatePool() {
    console.log(JSON.stringify({
      type: 'db-recovery',
      action: 'recreating-pool'
    }));
    
    if (this.pool) {
      await this.pool.close();
    }
    
    await this.createPool();
  }
}
```

### Transaction Recovery

```javascript
async function withTransaction(db, operation) {
  const maxRetries = 3;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const trx = await db.beginTransaction();
    
    try {
      const result = await operation(trx);
      await trx.commit();
      return result;
    } catch (error) {
      await trx.rollback();
      
      if (error.code === 'SQLITE_BUSY' && attempt < maxRetries) {
        console.log(JSON.stringify({
          type: 'db-recovery',
          action: 'transaction-retry',
          attempt,
          error: error.message
        }));
        await sleep(100 * attempt);
        continue;
      }
      
      throw error;
    }
  }
}
```

---

## Process Recovery

### Graceful Shutdown

```javascript
async function gracefulShutdown(signal) {
  console.log(JSON.stringify({
    type: 'shutdown',
    signal,
    status: 'starting'
  }));
  
  // Stop accepting new work
  isShuttingDown = true;
  
  // Wait for current work to complete (with timeout)
  const timeout = 30000;
  const startTime = Date.now();
  
  while (activeJobs.size > 0 && Date.now() - startTime < timeout) {
    console.log(JSON.stringify({
      type: 'shutdown',
      status: 'waiting',
      activeJobs: activeJobs.size
    }));
    await sleep(1000);
  }
  
  // Force cleanup if timeout
  if (activeJobs.size > 0) {
    console.log(JSON.stringify({
      type: 'shutdown',
      status: 'force-cleanup',
      remainingJobs: activeJobs.size
    }));
  }
  
  // Close database
  await db.close();
  
  // Write state for recovery
  await saveRecoveryState();
  
  console.log(JSON.stringify({
    type: 'shutdown',
    status: 'complete'
  }));
  
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```

### State Recovery on Startup

```javascript
async function recoverFromCrash() {
  const state = await loadRecoveryState();
  
  if (!state) {
    return { recovered: false };
  }
  
  console.log(JSON.stringify({
    type: 'recovery',
    action: 'found-state',
    interruptedJobs: state.jobs.length
  }));
  
  const recoveredJobs = [];
  
  for (const job of state.jobs) {
    if (job.status === 'running') {
      console.log(JSON.stringify({
        type: 'recovery',
        action: 'resuming-job',
        jobId: job.id,
        progress: job.progress
      }));
      
      // Mark as interrupted for potential resume
      await markJobInterrupted(job.id);
      recoveredJobs.push(job.id);
    }
  }
  
  // Clear recovery state
  await clearRecoveryState();
  
  return {
    recovered: true,
    jobs: recoveredJobs
  };
}
```

---

## Monitoring & Alerts

### Error Rate Monitoring

```javascript
class ErrorMonitor {
  constructor(options = {}) {
    this.window = options.window || 60000;  // 1 minute
    this.threshold = options.threshold || 0.1;  // 10%
    this.errors = [];
    this.total = 0;
  }
  
  record(success) {
    const now = Date.now();
    
    if (!success) {
      this.errors.push(now);
    }
    this.total++;
    
    // Clean old entries
    this.errors = this.errors.filter(t => now - t < this.window);
    
    // Check threshold
    const errorRate = this.errors.length / this.total;
    
    if (errorRate > this.threshold) {
      console.log(JSON.stringify({
        type: 'alert',
        level: 'warning',
        metric: 'error_rate',
        value: errorRate,
        threshold: this.threshold,
        message: `Error rate ${(errorRate * 100).toFixed(1)}% exceeds threshold`
      }));
    }
  }
}
```

---

## Next Chapter

[Chapter 14: Development Roadmap →](14-roadmap.md)
