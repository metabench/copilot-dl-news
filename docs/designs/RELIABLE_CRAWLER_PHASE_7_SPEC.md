# Phase 7: Production Hardening & Intelligent Orchestration

> **Goal**: Transform the crawler from a capable tool into a self-improving production system that learns, heals, and scales autonomously.

## Overview

Phase 7 focuses on closing the loop between crawling, analysis, and improvement. The crawler should:
1. **Learn** optimal timing and methods for each domain
2. **Diagnose** and recover from failures without human intervention
3. **Surface** quality metrics through actionable dashboards
4. **Deploy** reliably with proper containerization

## Item 1: Intelligent Crawl Scheduler (8h)

### Objective
Schedule crawls based on learned update patterns rather than fixed intervals.

### Components

```
src/crawler/scheduler/
├── CrawlScheduler.js          # Main scheduler orchestration
├── UpdatePatternAnalyzer.js   # Learns domain update frequencies
├── OptimalTimePredictor.js    # Predicts best crawl times
└── ScheduleStore.js           # Persists schedules to DB
```

### Key Features
- **Update Pattern Learning**: Track when domains publish new content (hourly, daily, weekly patterns)
- **Freshness Optimization**: Prioritize domains due for updates over stale ones
- **Resource Balancing**: Spread crawls to avoid bandwidth spikes
- **Adaptive Intervals**: Increase/decrease crawl frequency based on hit rate

### Database Schema
```sql
CREATE TABLE crawl_schedules (
  domain TEXT PRIMARY KEY,
  last_crawl_at TEXT,
  next_crawl_at TEXT,
  avg_update_interval_hours REAL,
  update_pattern TEXT,  -- JSON: {hourly: [...], daily: [...]}
  crawl_success_rate REAL,
  priority_score REAL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### API
```javascript
const scheduler = new CrawlScheduler({ db, analyzer, predictor });

// Get next batch of domains to crawl
const batch = await scheduler.getNextBatch({ limit: 50, maxAgeHours: 24 });

// Record crawl completion
await scheduler.recordCrawl(domain, { newArticles: 5, success: true });

// Get schedule stats
const stats = await scheduler.getStats();
// { domainsTracked: 150, avgUpdateInterval: 6.2, overdueCount: 12 }
```

---

## Item 2: Domain Learning Pipeline (10h)

### Objective
Automatically learn extraction templates for new domains with human review queue.

### Components

```
src/crawler/learning/
├── DomainLearningPipeline.js  # Orchestrates learning flow
├── TemplateGenerator.js       # Creates extraction rules from samples
├── ReviewQueue.js             # Manages human review queue
└── TemplateTester.js          # Validates templates against samples
```

### Flow
```
New Domain Crawled
       │
       ▼
┌─────────────────┐
│ Collect Samples │ (10-20 pages)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Run StructureMiner │ (cluster by L2 hash)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Generate Template │ (extract common selectors)
└────────┬────────┘
         │
         ▼
┌─────────────────────┐
│ Test Against Samples │ (calculate accuracy)
└────────┬────────────┘
         │
    ┌────┴────┐
    │         │
 >90%      <90%
    │         │
    ▼         ▼
Auto-Apply  Queue for Review
```

### Database Schema
```sql
CREATE TABLE template_review_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL,
  template_json TEXT NOT NULL,
  accuracy_score REAL,
  sample_count INTEGER,
  status TEXT DEFAULT 'pending',  -- pending, approved, rejected
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### API
```javascript
const pipeline = new DomainLearningPipeline({ db, miner, generator });

// Process a new domain
const result = await pipeline.learnDomain('example.com', { sampleCount: 20 });
// { accuracy: 0.87, status: 'queued_for_review', templateId: 42 }

// Review queue operations
const pending = await pipeline.getReviewQueue({ limit: 10 });
await pipeline.approveTemplate(templateId);
await pipeline.rejectTemplate(templateId, { reason: 'Wrong content selector' });
```

---

## Item 3: Extraction Quality Dashboard (8h)

### Objective
Unified dashboard showing extraction quality metrics across all domains.

### Components

```
src/ui/server/qualityDashboard/
├── server.js                  # Express server (port 3100)
├── QualityMetricsService.js   # Aggregates quality data
└── controls/
    ├── DomainQualityTable.js  # Per-domain quality scores
    ├── ConfidenceHistogram.js # Distribution of confidence scores
    ├── ExtractionComparison.js # Method comparison chart
    └── RegressionAlerts.js    # Quality degradation alerts
```

### Metrics Displayed
- **Domain Quality Table**: Per-domain confidence scores, extraction method, template age
- **Confidence Distribution**: Histogram of article confidence scores
- **Method Comparison**: Readability vs Template vs Cheerio success rates
- **Regression Alerts**: Domains where quality has dropped below threshold
- **Template Coverage**: % of domains with learned templates vs fallback extraction

### API Endpoints
```
GET /api/quality/summary        # Overall quality metrics
GET /api/quality/domains        # Per-domain breakdown
GET /api/quality/regressions    # Recent quality drops
GET /api/quality/histogram      # Confidence score distribution
GET /api/quality/methods        # Extraction method comparison
```

---

## Item 4: Self-Healing Error Recovery (10h)

### Objective
Automatically diagnose and recover from common failure modes.

### Components

```
src/crawler/healing/
├── SelfHealingService.js      # Main healing orchestration
├── DiagnosticEngine.js        # Classifies failure types
├── RemediationStrategies.js   # Per-failure-type fixes
└── HealingReport.js           # Tracks healing actions
```

### Failure Modes & Remediation

| Failure Mode | Detection | Remediation |
|--------------|-----------|-------------|
| Stale Proxy | 5+ consecutive 403/timeout | Rotate to next proxy, mark current as unhealthy |
| Layout Change | Confidence drop >30% | Queue for template re-learning |
| Rate Limited | 429 response | Increase domain delay, use backoff |
| DNS Failure | ENOTFOUND | Check domain health, pause if down |
| Content Block | "Enable JavaScript" | Upgrade to Puppeteer fetch |
| Soft Block | CAPTCHA detected | Route through proxy, flag for review |

### Database Schema
```sql
CREATE TABLE healing_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL,
  failure_type TEXT NOT NULL,
  diagnosis TEXT,
  remediation TEXT,
  success INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### API
```javascript
const healer = new SelfHealingService({ db, diagnostics, strategies });

// Process a failure
const result = await healer.handleFailure(domain, error, context);
// { diagnosed: 'layout_change', remediation: 'queued_for_relearning', success: true }

// Get healing stats
const stats = await healer.getStats();
// { totalHealed: 156, successRate: 0.89, topFailures: [...] }
```

---

## Item 5: Crawl Performance Profiler (6h)

### Objective
Detailed timing breakdown per crawl phase with bottleneck detection.

### Components

```
src/crawler/profiler/
├── CrawlProfiler.js           # Timing instrumentation
├── BottleneckDetector.js      # Identifies slow phases
└── ProfileReporter.js         # Generates reports
```

### Timing Phases
```
CRAWL TIMELINE
══════════════════════════════════════════════════════════════

 DNS Lookup ▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 45ms
 TCP Connect ▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 62ms
 TLS Handshake ▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 98ms
 First Byte ▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 38ms
 Download ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░ 312ms
 Parse HTML ▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 67ms
 Extract Content ▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 145ms
 DB Write ▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 23ms
                                                    ────────
                                                    790ms total
```

### API
```javascript
const profiler = new CrawlProfiler();

// Instrument a crawl
profiler.start('dns');
await dns.lookup(domain);
profiler.end('dns');

profiler.start('fetch');
const html = await fetch(url);
profiler.end('fetch');

// Get profile
const profile = profiler.getProfile();
// { phases: { dns: 45, fetch: 312, ... }, total: 790, bottleneck: 'fetch' }

// Aggregate stats
const stats = await profiler.getAggregateStats({ domain: 'example.com' });
// { avgTotal: 850, p95: 1200, bottlenecks: { fetch: 45%, extract: 30% } }
```

---

## Item 6: Production Config & Deployment (8h)

### Objective
Docker compose setup with proper health checks and graceful shutdown.

### Components

```
deploy/
├── docker-compose.yml         # Full stack composition
├── docker-compose.dev.yml     # Development overrides
├── Dockerfile                 # Crawler image
├── Dockerfile.dashboard       # Dashboard image
├── config/
│   ├── production.json        # Production settings
│   └── staging.json           # Staging settings
└── scripts/
    ├── health-check.sh        # Container health probe
    ├── backup-db.sh           # Database backup script
    └── rotate-logs.sh         # Log rotation
```

### Docker Compose Structure
```yaml
version: '3.8'
services:
  crawler:
    build: .
    environment:
      - NODE_ENV=production
      - POSTGRES_URL=${POSTGRES_URL}
    healthcheck:
      test: ["CMD", "node", "deploy/scripts/health-check.js"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      replicas: 3
      
  dashboard:
    build:
      context: .
      dockerfile: Dockerfile.dashboard
    ports:
      - "3099:3099"   # Monitor
      - "3100:3100"   # Quality
      
  postgres:
    image: postgres:15
    volumes:
      - pgdata:/var/lib/postgresql/data
      
volumes:
  pgdata:
```

### Graceful Shutdown
```javascript
// In crawler main process
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, starting graceful shutdown...');
  
  // Stop accepting new work
  await queue.pause();
  
  // Wait for in-flight work to complete (max 30s)
  await crawler.drain({ timeout: 30000 });
  
  // Close connections
  await db.close();
  await queue.close();
  
  logger.info('Graceful shutdown complete');
  process.exit(0);
});
```

---

## Success Criteria

| Item | Metric | Target |
|------|--------|--------|
| Scheduler | Reduces redundant crawls | -40% crawl volume, same coverage |
| Learning Pipeline | Auto-approves templates | >70% accuracy for auto-approval |
| Quality Dashboard | Page load time | <2s with 100k articles |
| Self-Healing | Auto-recovery rate | >85% of failures auto-healed |
| Profiler | Overhead | <5% additional latency |
| Deployment | Container startup | <30s to healthy |

## Implementation Order

1. **Crawl Profiler** (6h) - Foundation for optimization
2. **Self-Healing** (10h) - Critical for production reliability
3. **Intelligent Scheduler** (8h) - Efficiency gains
4. **Quality Dashboard** (8h) - Visibility into system health
5. **Learning Pipeline** (10h) - Automation of template creation
6. **Production Deployment** (8h) - Final production readiness

**Total: 50 hours**
