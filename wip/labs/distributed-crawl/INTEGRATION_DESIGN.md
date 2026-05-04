# Distributed Crawl Integration Design

This document outlines how to integrate the distributed crawl worker into the core news crawler system.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          LOCAL (Windows)                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────┐     ┌───────────────────┐     ┌──────────────────┐│
│  │  CrawlPlanner    │────▶│ DistributedQueue  │────▶│  HTTPResponses   ││
│  │                  │     │                   │     │  (SQLite)        ││
│  │  - Priority URLs │     │  - Batch URLs     │     │                  ││
│  │  - Rate limits   │     │  - Send to worker │     │  - Store results ││
│  │  - Host buckets  │     │  - Handle results │     │  - Update status ││
│  └──────────────────┘     └─────────┬─────────┘     └──────────────────┘│
│                                     │                                    │
│                                     │ HTTP/JSON                          │
│                                     ▼                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                          NETWORK                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                     │                                    │
│                          REMOTE (OCI)                                    │
│                                     ▼                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                    Worker Server (8081)                              ││
│  │                                                                      ││
│  │  ┌─────────────────┐     ┌──────────────────┐     ┌───────────────┐ ││
│  │  │ Request Handler │────▶│ Fetch Pool       │────▶│ Response      │ ││
│  │  │                 │     │                  │     │ Aggregator    │ ││
│  │  │ - Parse batch   │     │ - Concurrent     │     │               │ ││
│  │  │ - Validate      │     │ - Timeout mgmt   │     │ - Compress    │ ││
│  │  │                 │     │ - Error handling │     │ - Return      │ ││
│  │  └─────────────────┘     └──────────────────┘     └───────────────┘ ││
│  └─────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. New Service: DistributedCrawlService

**Location**: `src/services/DistributedCrawlService.js`

```javascript
/**
 * DistributedCrawlService - Orchestrates distributed URL fetching
 * 
 * Uses optimal settings from lab results:
 * - Batch size: 50
 * - Concurrency: 20
 * - Gzip compression: enabled
 */
class DistributedCrawlService {
  constructor(options = {}) {
    this.workerUrl = options.workerUrl || 'http://144.21.42.149:8081';
    this.batchSize = options.batchSize || 50;
    this.maxConcurrency = options.maxConcurrency || 20;
    this.compress = options.compress || 'gzip';
    this.db = options.db;
  }

  /**
   * Fetch unfetched URLs from database in batches
   */
  async processBacklog(options = {}) {
    const { limit = 1000, onProgress, signal } = options;
    const results = { ok: 0, errors: 0, total: 0 };
    
    while (results.total < limit && !signal?.aborted) {
      const urls = this.getUnfetchedUrls(this.batchSize);
      if (urls.length === 0) break;
      
      const batchResult = await this.fetchBatch(urls);
      await this.saveBatchResults(batchResult);
      
      results.ok += batchResult.ok;
      results.errors += batchResult.errors;
      results.total += urls.length;
      
      onProgress?.(results);
    }
    
    return results;
  }

  /**
   * Send batch to remote worker
   */
  async fetchBatch(urls, method = 'HEAD') {
    const payload = {
      requests: urls.map(u => ({ url: u.url, method, urlId: u.id })),
      maxConcurrency: this.maxConcurrency,
      batchSize: this.batchSize,
      timeoutMs: 30000,
      compress: this.compress,
    };

    const resp = await fetch(`${this.workerUrl}/batch`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept-Encoding': 'gzip',
      },
      body: JSON.stringify(payload),
    });

    return resp.json();
  }

  /**
   * Get unfetched URLs prioritized by host
   */
  getUnfetchedUrls(limit) {
    return this.db.prepare(`
      SELECT u.id, u.url, u.host 
      FROM urls u 
      WHERE u.id NOT IN (SELECT url_id FROM http_responses WHERE url_id IS NOT NULL)
      ORDER BY u.priority DESC, u.created_at ASC
      LIMIT ?
    `).all(limit);
  }

  /**
   * Save batch results to http_responses
   */
  async saveBatchResults(batchResult) {
    const insert = this.db.prepare(`
      INSERT INTO http_responses (url_id, http_status, headers, fetched_at, duration_ms)
      VALUES (?, ?, ?, ?, ?)
    `);

    const tx = this.db.transaction((results) => {
      for (const r of results) {
        if (r.urlId) {
          insert.run(
            r.urlId,
            r.statusCode || 0,
            JSON.stringify(r.headers || {}),
            new Date().toISOString(),
            r.durationMs || 0
          );
        }
      }
    });

    tx(batchResult.results || []);
  }
}

module.exports = { DistributedCrawlService };
```

---

## 3. Integration Points

### 3.1 Crawler Module Integration

Add distributed option to existing crawler:

```javascript
// src/modules/crawler.js

const { DistributedCrawlService } = require('../services/DistributedCrawlService');

class Crawler {
  constructor(options) {
    // Existing code...
    
    // Add distributed crawl capability
    if (options.distributed) {
      this.distributedService = new DistributedCrawlService({
        workerUrl: options.workerUrl,
        db: this.db,
      });
    }
  }

  async crawl(options) {
    if (this.distributedService && options.useDistributed) {
      return this.distributedService.processBacklog(options);
    }
    // Existing local crawl logic...
  }
}
```

### 3.2 CLI Integration

Add distributed crawl command:

```javascript
// src/cli/commands/distributed-crawl.js

module.exports = {
  command: 'distributed-crawl',
  describe: 'Run distributed crawl using remote worker',
  builder: {
    limit: { type: 'number', default: 1000 },
    worker: { type: 'string', default: 'http://144.21.42.149:8081' },
  },
  async handler(argv) {
    const { DistributedCrawlService } = require('../../services/DistributedCrawlService');
    const db = require('better-sqlite3')('data/news.db');
    
    const service = new DistributedCrawlService({
      workerUrl: argv.worker,
      db,
    });

    console.log(`Starting distributed crawl (limit: ${argv.limit})`);
    
    const result = await service.processBacklog({
      limit: argv.limit,
      onProgress: (stats) => {
        console.log(`Progress: ${stats.total} processed, ${stats.ok} OK, ${stats.errors} errors`);
      },
    });

    console.log('Crawl complete:', result);
    db.close();
  },
};
```

---

## 4. Configuration

Add to `config.json`:

```json
{
  "distributed": {
    "enabled": true,
    "workers": [
      {
        "url": "http://144.21.42.149:8081",
        "region": "oci-us",
        "priority": 1
      }
    ],
    "defaults": {
      "batchSize": 50,
      "maxConcurrency": 20,
      "compress": "gzip",
      "timeoutMs": 30000
    },
    "rateLimits": {
      "globalPerSecond": 10,
      "perHostPerSecond": 2
    }
  }
}
```

---

## 5. Rate Limiting Strategy

To avoid being blocked by target sites:

```javascript
class RateLimiter {
  constructor() {
    this.hostTimestamps = new Map(); // host -> last request time
    this.minDelay = 500; // 500ms between requests to same host
  }

  async acquireSlot(host) {
    const lastTime = this.hostTimestamps.get(host) || 0;
    const elapsed = Date.now() - lastTime;
    
    if (elapsed < this.minDelay) {
      await sleep(this.minDelay - elapsed);
    }
    
    this.hostTimestamps.set(host, Date.now());
  }
}
```

---

## 6. Host-Based Batching

Group URLs by host for efficient rate-limited processing:

```javascript
function groupByHost(urls) {
  const groups = new Map();
  for (const url of urls) {
    const host = new URL(url.url).hostname;
    if (!groups.has(host)) groups.set(host, []);
    groups.get(host).push(url);
  }
  return groups;
}

async function processWithRateLimits(urls, worker) {
  const groups = groupByHost(urls);
  const results = [];
  
  for (const [host, hostUrls] of groups) {
    // Process one batch per host at a time
    const batch = hostUrls.slice(0, 10); // Max 10 per host per round
    const result = await worker.fetchBatch(batch);
    results.push(...result.results);
    
    // Rate limit: wait between hosts
    await sleep(100);
  }
  
  return results;
}
```

---

## 7. Monitoring & Observability

### 7.1 Metrics to Track

| Metric | Description |
|--------|-------------|
| `crawl.distributed.requests_total` | Total requests sent to workers |
| `crawl.distributed.requests_ok` | Successful responses |
| `crawl.distributed.requests_error` | Failed requests |
| `crawl.distributed.latency_ms` | Round-trip latency |
| `crawl.distributed.throughput` | URLs/second |
| `crawl.distributed.compression_ratio` | Transfer size savings |

### 7.2 Dashboard Integration

The speedometer web app can be integrated into the unified dashboard:

```javascript
// Add to unified app routes
router.get('/distributed-crawl', (req, res) => {
  res.redirect('http://localhost:3098');
});
```

---

## 8. Failure Handling

### 8.1 Worker Unavailable

```javascript
async function fetchWithFallback(urls, workers) {
  for (const worker of workers) {
    try {
      const health = await fetch(`${worker.url}/batch`, { 
        method: 'POST',
        body: JSON.stringify({ requests: [], ping: true }),
        timeout: 5000,
      });
      if (health.ok) {
        return fetchBatch(urls, worker);
      }
    } catch (e) {
      console.warn(`Worker ${worker.url} unavailable: ${e.message}`);
    }
  }
  
  // Fall back to local crawl
  console.log('All workers unavailable, using local crawl');
  return localCrawl(urls);
}
```

### 8.2 Retry Logic

```javascript
async function fetchWithRetry(urls, worker, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await worker.fetchBatch(urls);
    } catch (e) {
      if (attempt === maxRetries) throw e;
      const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
      await sleep(delay);
    }
  }
}
```

---

## 9. Implementation Phases

### Phase 1: Basic Integration (1 day)
- [ ] Create `DistributedCrawlService`
- [ ] Add CLI command for distributed crawl
- [ ] Test with 1000 URLs

### Phase 2: Rate Limiting (1 day)
- [ ] Implement host-based rate limiting
- [ ] Add per-host tracking
- [ ] Test with production URLs

### Phase 3: Monitoring (1 day)
- [ ] Integrate speedometer dashboard
- [ ] Add metrics collection
- [ ] Create alerts for worker failure

### Phase 4: Production Deployment (1 day)
- [ ] Deploy worker as systemd service
- [ ] Add health monitoring
- [ ] Document operational procedures

---

## 10. Security Considerations

1. **Worker Authentication**: Add API key to worker requests
2. **Network Security**: Use VPN or private network between local and worker
3. **Data Privacy**: Don't log URL bodies in worker
4. **Rate Limiting**: Respect robots.txt and site terms
