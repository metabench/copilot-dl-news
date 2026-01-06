# Chapter 9: Operations Runbook

## Overview

This runbook provides practical guidance for running, monitoring, and troubleshooting crawls.

## Starting a Crawl

### CLI Quick Start

```bash
# Basic crawl
node src/tools/crawl.js https://www.theguardian.com --max-downloads 1000

# Intelligent crawl with database
node src/tools/crawl.js https://www.theguardian.com \
  --type intelligent \
  --max-downloads 10000 \
  --db ./data/news.db

# Gazetteer crawl
node src/tools/crawl.js https://www.theguardian.com \
  --type gazetteer \
  --gazetteer ./data/gazetteer.db \
  --max-downloads 50000
```

### Programmatic Start

```javascript
const { NewsCrawler } = require('./src/crawler/NewsCrawler');

async function runCrawl() {
  const crawler = new NewsCrawler('https://www.theguardian.com', {
    crawlType: 'intelligent',
    maxDownloads: 10000,
    dbPath: './data/news.db',
    outputVerbosity: 2
  });

  // Initialize
  await crawler.init();

  // Attach listeners
  crawler.on('progress', (stats) => {
    console.log(`Progress: ${stats.pagesDownloaded}/${stats.pagesVisited}`);
  });

  crawler.on('error', (error) => {
    console.error('Crawl error:', error);
  });

  // Run
  const result = await crawler.crawl();
  console.log('Crawl complete:', result);
}
```

### With Telemetry

```javascript
const { TelemetryIntegration } = require('./src/crawler/telemetry');
const express = require('express');

const app = express();
const telemetry = new TelemetryIntegration({ historyLimit: 500 });

// Mount SSE endpoint
telemetry.mountSSE(app, '/api/crawl-events');

// Create and connect crawler
const crawler = new NewsCrawler(url, options);
telemetry.connectCrawler(crawler);

// Start server and crawl
app.listen(3000);
await crawler.init();
await crawler.crawl();
```

## Monitoring

### Console Output

Set verbosity level for console output:

```javascript
{
  outputVerbosity: 0,  // Errors only
  outputVerbosity: 1,  // Progress + errors (default)
  outputVerbosity: 2,  // Detailed progress
  outputVerbosity: 3   // Debug (very verbose)
}
```

### SSE Dashboard

Open browser to SSE endpoint for real-time monitoring:

```
http://localhost:3000/api/crawl-events
```

Or use the unified app:

```
http://localhost:3000/crawl-observer
```

### Key Metrics to Watch

| Metric | Healthy Range | Action if Outside |
|--------|--------------|-------------------|
| Requests/sec | 1-10 | Check rate limits |
| Error rate | < 5% | Investigate errors |
| Queue size | 100-10000 | Adjust maxQueue |
| Cache hit rate | > 30% | Normal for repeat crawls |
| 429 responses | < 1% | Increase rate limit delay |

### Progress Events

```javascript
crawler.on('progress', (stats) => {
  const {
    pagesVisited,      // Total pages visited
    pagesDownloaded,   // Successful downloads
    articlesFound,     // Articles identified
    articlesSaved,     // Articles saved to DB
    errors,            // Error count
    queueSize,         // Current queue size
    bytesDownloaded    // Total bytes
  } = stats;

  // Calculate metrics
  const successRate = pagesDownloaded / pagesVisited;
  const articleRate = articlesFound / pagesDownloaded;
});
```

## Troubleshooting

### High Error Rate

**Symptoms:** > 10% of requests failing

**Diagnosis:**
```javascript
crawler.on('url:error', ({ url, error }) => {
  console.log(`Error: ${url} - ${error.code || error.message}`);
});
```

**Common Causes:**

| Error Code | Cause | Solution |
|------------|-------|----------|
| ECONNRESET | TLS fingerprinting | Enable Puppeteer fallback |
| ETIMEDOUT | Slow server | Increase timeout |
| 429 | Rate limited | Increase rateLimitMs |
| 403 | Bot blocked | Use proxy rotation |

**Solutions:**

```javascript
// Enable Puppeteer fallback
{
  puppeteerFallbackOnEconnreset: true
}

// Increase rate limit
{
  rateLimitMs: 2000  // 2 seconds between requests
}

// Enable proxy rotation
{
  proxyManager: new ProxyManager({
    enabled: true,
    providers: [
      { url: 'http://proxy1:8080', name: 'proxy1' },
      { url: 'http://proxy2:8080', name: 'proxy2' }
    ],
    strategy: 'round-robin'
  })
}
```

### Stalled Crawl

**Symptoms:** No progress for > 60 seconds

**Diagnosis:**
```javascript
crawler.on('stalled', (info) => {
  console.log('Crawl stalled:', info);
});
```

**Common Causes:**

1. **All hosts rate limited**
   - Check: `crawler.state.domainLimits`
   - Solution: Wait for backoff to expire

2. **Queue empty but not finished**
   - Check: `crawler.queue.size()`
   - Solution: May be normal completion

3. **Workers blocked**
   - Check: `crawler.state.currentDownloads`
   - Solution: Check for hung requests

**Recovery:**

```javascript
// Force resume if paused
if (crawler.isPaused()) {
  crawler.resume();
}

// Check for hung requests
const downloads = crawler.state.currentDownloads;
for (const [url, info] of downloads) {
  if (Date.now() - info.startedAt > 60000) {
    console.log('Hung request:', url);
    // Consider aborting
  }
}
```

### Memory Issues

**Symptoms:** Node.js process consuming > 2GB RAM

**Diagnosis:**
```javascript
setInterval(() => {
  const used = process.memoryUsage();
  console.log(`Memory: ${Math.round(used.heapUsed / 1024 / 1024)}MB`);
}, 30000);
```

**Common Causes:**

1. **Queue too large**
   - Solution: Reduce `maxQueue`

2. **Cache accumulation**
   - Solution: Enable LRU eviction

3. **History accumulation**
   - Solution: Reduce `historyLimit`

**Solutions:**

```javascript
{
  maxQueue: 10000,            // Limit queue size
  cacheMaxSize: 1000,         // Limit cache entries
  historyLimit: 200           // Limit telemetry history
}

// Force garbage collection (if --expose-gc)
if (global.gc) {
  setInterval(() => global.gc(), 60000);
}
```

### Database Issues

**Symptoms:** Slow writes, lock timeouts

**Diagnosis:**
```javascript
// Check database size
const stats = fs.statSync(dbPath);
console.log(`DB size: ${Math.round(stats.size / 1024 / 1024)}MB`);

// Check WAL size
const walPath = dbPath + '-wal';
if (fs.existsSync(walPath)) {
  const walStats = fs.statSync(walPath);
  console.log(`WAL size: ${Math.round(walStats.size / 1024 / 1024)}MB`);
}
```

**Solutions:**

```javascript
// Force WAL checkpoint
db.pragma('wal_checkpoint(TRUNCATE)');

// Optimize database
db.pragma('optimize');

// Vacuum (offline only)
db.exec('VACUUM');
```

## Stopping a Crawl

### Graceful Stop

```javascript
// Request stop
crawler.requestAbort();

// Wait for completion
crawler.on('stopped', (result) => {
  console.log('Crawl stopped:', result);
});
```

### Force Stop

```javascript
// Immediate abort
await crawler.dispose();
```

### Pause and Resume

```javascript
// Pause
crawler.pause();

// Resume later
crawler.resume();
```

## Checkpointing

### Save Checkpoint

```javascript
// Automatic checkpointing (every 1000 downloads)
{
  checkpointInterval: 1000,
  checkpointPath: './data/checkpoint.json'
}

// Manual checkpoint
crawler.on('checkpoint', (checkpoint) => {
  fs.writeFileSync('./checkpoint.json', JSON.stringify(checkpoint));
});
```

### Restore from Checkpoint

```javascript
const checkpoint = JSON.parse(fs.readFileSync('./checkpoint.json'));

const crawler = new NewsCrawler(url, {
  ...options,
  resumeFromCheckpoint: checkpoint
});
```

## Best Practices

### 1. Start Small

```javascript
// Test with small limits first
{
  maxDownloads: 100,
  maxDepth: 3
}
```

### 2. Monitor Rate Limits

```javascript
crawler.on('rate:limited', ({ host, retryAfterMs }) => {
  console.log(`Rate limited: ${host} for ${retryAfterMs}ms`);
});
```

### 3. Use Incremental Crawls

```javascript
// Skip already-crawled URLs
{
  preferCache: true,
  skipVisited: true
}
```

### 4. Set Resource Limits

```javascript
// Prevent runaway crawls
{
  maxDownloads: 10000,
  maxQueue: 50000,
  maxDepth: 10,
  timeoutMs: 3600000  // 1 hour
}
```

### 5. Log to File

```javascript
const fs = require('fs');
const logStream = fs.createWriteStream('./crawl.log', { flags: 'a' });

crawler.on('progress', (stats) => {
  logStream.write(`${new Date().toISOString()} ${JSON.stringify(stats)}\n`);
});
```

### 6. Handle Signals

```javascript
// Graceful shutdown on Ctrl+C
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT, stopping crawl...');
  crawler.requestAbort();

  setTimeout(() => {
    console.log('Force stopping...');
    process.exit(1);
  }, 30000);
});
```

## Common Crawl Patterns

### Daily Crawl

```bash
#!/bin/bash
DATE=$(date +%Y-%m-%d)
node src/tools/crawl.js https://example.com \
  --type intelligent \
  --max-downloads 5000 \
  --db "./data/news-${DATE}.db" \
  --prefer-cache \
  2>&1 | tee "./logs/crawl-${DATE}.log"
```

### Multi-Site Crawl

```javascript
const sites = [
  'https://www.theguardian.com',
  'https://www.bbc.com',
  'https://www.nytimes.com'
];

for (const site of sites) {
  const crawler = new NewsCrawler(site, {
    maxDownloads: 1000,
    dbPath: './data/news.db'
  });

  await crawler.init();
  await crawler.crawl();
  await crawler.dispose();
}
```

### Monitoring Dashboard

```javascript
const express = require('express');
const app = express();

// Serve static dashboard
app.use(express.static('./public'));

// Mount telemetry
telemetry.mountSSE(app, '/api/events');

// Stats endpoint
app.get('/api/stats', (req, res) => {
  res.json({
    state: telemetry.bridge.getState(),
    history: telemetry.bridge.getHistory(50)
  });
});

app.listen(3000);
```

## Quick Reference

### CLI Options

| Option | Default | Description |
|--------|---------|-------------|
| `--type` | basic | Crawl mode |
| `--max-downloads` | 1000 | Download limit |
| `--max-depth` | 10 | Depth limit |
| `--rate-limit` | 500 | Rate limit (ms) |
| `--db` | - | Database path |
| `--verbose` | 1 | Verbosity level |
| `--prefer-cache` | false | Use cached content |

### Key Events

| Event | When | Data |
|-------|------|------|
| `started` | Crawl begins | `{ jobId, startUrl }` |
| `progress` | Periodic updates | `{ pagesVisited, ... }` |
| `url:visited` | URL fetched | `{ url, status, ... }` |
| `url:error` | Fetch failed | `{ url, error }` |
| `milestone` | Achievement | `{ type, value }` |
| `stalled` | No progress | `{ reason }` |
| `stopped` | Crawl ended | `{ reason, stats }` |

### Health Checks

```bash
# Check if crawler is responding
curl http://localhost:3000/api/health

# Get current stats
curl http://localhost:3000/api/stats

# Get queue status
curl http://localhost:3000/api/queue/status
```

---

## Appendix: Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CRAWL_DB_PATH` | ./data/news.db | Default database path |
| `CRAWL_DATA_DIR` | ./data | Data directory |
| `CRAWL_LOG_LEVEL` | info | Logging level |
| `CRAWL_MAX_MEMORY` | 2048 | Max memory (MB) |
| `PUPPETEER_EXECUTABLE` | - | Chrome path |

---

**End of Crawler Architecture & Operations Guide**

For analysis and classification details, see the companion book: [Content Analysis & Classification Handbook](../content-analysis-classification-handbook/README.md).
