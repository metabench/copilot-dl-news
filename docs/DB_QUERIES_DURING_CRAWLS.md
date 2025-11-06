# Database Queries Used During Crawls

This document details the database queries and operations performed during web crawling operations in the news crawler system.

## Overview

The crawler uses SQLite with better-sqlite3 for data persistence. Database operations are organized through several layers:

- **dbClient.js**: Main crawler interface to database operations
- **SQLiteNewsDatabase.js**: Core database class with prepared statements
- **ArticleOperations.js**: Article-specific operations
- **NewsWebsiteService.js**: Website management with caching

> ✅ **Update (2025-11-05):** The earlier circular dependency warning between `ArticleOperations.js` and the v1 module index has been removed by dropping the unused `ensureDatabase` import. Legacy CLI entry points load cleanly with no Node circular dependency warnings.

## Key Database Tables Involved in Crawling

### Core Crawl Tables
- `urls` - URL registry with metadata
- `http_responses` - HTTP response data and timing
- `content_storage` - Article content (potentially compressed)
- `content_analysis` - Extracted article metadata (title, date, etc.)
- `discovery_events` - When/how URLs were discovered
- `crawl_jobs` - Crawl job tracking
- `queue_events` - Crawl queue state changes
- `fetches` - Legacy fetch records (triggers latest_fetch updates)
- `latest_fetch` - Latest fetch status per URL (maintained by triggers)

### Supporting Tables
- `domains` - Domain metadata and rate limiting
- `errors` - Error logging
- `links` - Discovered links between pages

## Main Database Operations During Crawls

### 1. Article Storage (`upsertArticle`)

**Purpose**: Store complete article data including content, metadata, and analysis.

**Location**: `ArticleOperations.js` → `_writeToNormalizedSchema()`

**Tables Modified**:
- `urls` (ensure URL exists)
- `http_responses` (HTTP metadata)
- `content_storage` (article content, potentially compressed)
- `content_analysis` (extracted metadata)
- `discovery_events` (discovery tracking)
- `domains` (domain statistics)

**Key Queries**:

```sql
-- Ensure URL exists
INSERT OR IGNORE INTO urls(url, canonical_url, created_at, last_seen_at, analysis) 
VALUES (?, ?, ?, ?, ?);

-- Insert HTTP response
INSERT INTO http_responses (
  url_id, request_started_at, fetched_at, http_status, content_type,
  content_encoding, etag, last_modified, redirect_chain,
  ttfb_ms, download_ms, total_ms, bytes_downloaded, transfer_kbps
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);

-- Store content (potentially compressed)
INSERT INTO content_storage (
  http_response_id, storage_type, compression_type_id, compression_bucket_id,
  bucket_entry_key, content_blob, content_sha256, uncompressed_size,
  compressed_size, compression_ratio
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);

-- Insert content analysis
INSERT INTO content_analysis (
  content_id, analysis_version, classification, title, date, section,
  word_count, language, article_xpath, nav_links_count, article_links_count,
  analysis_json, analyzed_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'));

-- Insert discovery event
INSERT INTO discovery_events (
  url_id, discovered_at, referrer_url, crawl_depth, discovery_method, crawl_job_id
) VALUES (?, ?, ?, ?, ?, ?);

-- Update domain statistics
INSERT OR IGNORE INTO domains(host, tld, created_at, last_seen_at, analysis)
VALUES (?, ?, ?, ?, ?);
UPDATE domains SET last_seen_at=? WHERE host=?;
UPDATE domains SET analysis=COALESCE(?, analysis) WHERE host=?;
```

**Called By**:
- `src/crawler/dbClient.js` → `upsertArticle()`
- `src/crawler/ArticleProcessor.js` → Article processing pipeline

### 2. Fetch Record Insertion (`insertFetch`)

**Purpose**: Record fetch attempts and results for telemetry and deduplication.

**Location**: Should be in `ArticleOperations.js` but currently delegates from `SQLiteNewsDatabase.js`

**Tables Modified**:
- `fetches` (legacy table)
- `latest_fetch` (updated via trigger `trg_latest_fetch_upsert`)

**Expected Query** (based on test usage):
```sql
INSERT INTO fetches (
  request_started_at, fetched_at, http_status, content_type, content_length,
  content_encoding, bytes_downloaded, transfer_kbps, ttfb_ms, download_ms, 
  total_ms, saved_to_db, saved_to_file, file_path, file_size, classification,
  nav_links_count, article_links_count, word_count, analysis, host, url_id
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
```

**Trigger Updates**:
```sql
-- trg_latest_fetch_upsert trigger
INSERT INTO latest_fetch(url, ts, http_status, classification, word_count)
SELECT u.url, COALESCE(NEW.fetched_at, NEW.request_started_at), 
       NEW.http_status, NEW.classification, NEW.word_count
FROM urls u WHERE u.id = NEW.url_id
ON CONFLICT(url) DO UPDATE SET
  ts = CASE WHEN excluded.ts > COALESCE(latest_fetch.ts, '') THEN excluded.ts ELSE latest_fetch.ts END,
  http_status = CASE WHEN excluded.ts >= COALESCE(latest_fetch.ts, '') THEN excluded.http_status ELSE latest_fetch.http_status END,
  classification = CASE WHEN excluded.ts >= COALESCE(latest_fetch.ts, '') THEN excluded.classification ELSE latest_fetch.classification END,
  word_count = CASE WHEN excluded.ts >= COALESCE(latest_fetch.ts, '') THEN excluded.word_count ELSE latest_fetch.word_count END;
```

**Called By**:
- `src/crawler/dbClient.js` → `insertFetch()`
- `src/crawler/ArticleProcessor.js` → `_insertFetchRecord()`
- `src/utils/fetch/fetchRecorder.js` → Fetch recording
- `src/crawler/PageExecutionService.js` → Page processing
- `src/crawler/RobotsAndSitemapCoordinator.js` → Robots.txt processing

### 3. Link Discovery (`insertLink`)

**Purpose**: Record links discovered between pages for crawl planning.

**Location**: Not yet analyzed in detail

**Tables Modified**:
- `links` - Link relationships

**Called By**:
- `src/crawler/dbClient.js` → `insertLink()`
- Various crawler components during HTML parsing

### 4. Crawl Job Management

**Purpose**: Track crawl job lifecycle and progress.

**Location**: `SQLiteNewsDatabase.js` → `recordCrawlJobStart()`, `markCrawlJobStatus()`

**Tables Modified**:
- `crawl_jobs` - Job metadata

**Queries**:
```sql
-- Start crawl job
INSERT INTO crawl_jobs(id, url_id, args, pid, started_at, status) 
VALUES (?, ?, ?, ?, ?, ?);

-- Update job status
UPDATE crawl_jobs SET ended_at=?, status=? WHERE id=?;
```

**Called By**:
- `src/crawler/CrawlOrchestrationService.js` → Job lifecycle management

### 5. Queue Event Logging

**Purpose**: Track crawl queue state changes for debugging and analytics.

**Location**: `SQLiteNewsDatabase.js` → `insertQueueEvent()`

**Tables Modified**:
- `queue_events` - Queue state changes

**Query**:
```sql
INSERT INTO queue_events(
  job_id, ts, action, url_id, depth, host, reason, queue_size, 
  alias, queue_origin, queue_role, queue_depth_bucket
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
```

**Called By**:
- `src/crawler/QueueManager.js` → Queue operations
- `src/crawler/CrawlOrchestrationService.js` → Queue monitoring

### 6. Error Logging

**Purpose**: Record errors encountered during crawling.

**Location**: `SQLiteNewsDatabase.js` → `insertError()`

**Tables Modified**:
- `errors` - Error records

**Query**:
```sql
INSERT INTO errors(url_id, host, kind, code, message, details, at) 
VALUES (?, ?, ?, ?, ?, ?, ?);
```

**Called By**:
- Various crawler components when HTTP errors or processing errors occur

## Codebase Usage Patterns

### Database Client Layer (`src/crawler/dbClient.js`)

The main interface for crawler components:

```javascript
// Article storage
await dbClient.upsertArticle(articleData);

// Fetch recording
await dbClient.insertFetch(fetchData);

// Link discovery
await dbClient.insertLink(linkData);
```

### Article Processing (`src/crawler/ArticleProcessor.js`)

Handles article extraction and storage:

```javascript
// Store complete article
const result = await this._dbClient.upsertArticle({
  url, html, title, date, section, word_count, language, analysis
});

// Record fetch metadata
await this._insertFetchRecord({ url, fetchMeta, classification, ... });
```

### Content Acquisition (`src/crawler/ContentAcquisitionService.js`)

Manages HTTP fetching and response processing:

```javascript
// Record fetch results
await dbAdapter.insertFetch({
  url, http_status, content_type, bytes_downloaded, total_ms, ...
});
```

### Queue Management (`src/crawler/QueueManager.js`)

Tracks URL discovery and processing:

```javascript
// Log queue events
await dbAdapter.insertQueueEvent({
  jobId, action: 'added', url, depth, reason, queueSize
});
```

## Performance Considerations

### Prepared Statements
Most operations use prepared statements for efficiency:
- `this.insertUrlMinimalStmt`
- `this._insertHttpResponseStmt`
- `this._insertCrawlJobStmt`

### Batch Operations
Some operations support batching:
- Multiple article upserts in a single transaction
- Bulk queue event logging

### Indexing Strategy
Key indexes support crawl operations:
- `urls(url)` - URL lookups
- `http_responses(url_id, fetched_at)` - Fetch history
- `queue_events(job_id, ts)` - Queue analytics
- `latest_fetch(url)` - Deduplication

## Error Handling

Database operations include error handling:
- Silent failures for non-critical operations (logging only)
- Transaction rollbacks on failures
- Graceful degradation when optional features fail

## Data Flow Summary

1. **URL Discovery** → `insertQueueEvent()` → `queue_events`
2. **HTTP Fetch** → `insertFetch()` → `fetches` → trigger → `latest_fetch`
3. **Content Processing** → `upsertArticle()` → normalized schema tables
4. **Link Extraction** → `insertLink()` → `links`
5. **Error Handling** → `insertError()` → `errors`

## Instrumentation and Telemetry Queries

Beyond core crawl operations, the system performs extensive instrumentation for monitoring, analytics, and telemetry. These queries track crawl progress, background task status, coverage analytics, and performance metrics.

### 7. Background Task Management

**Purpose**: Track long-running background tasks (including crawls) with persistence, progress monitoring, and status updates.

**Location**: `BackgroundTaskManager.js` → Various methods

**Tables Modified**:
- `background_tasks` - Task lifecycle and progress tracking

**Key Queries**:

```sql
-- Create new background task
INSERT INTO background_tasks (
  task_type, status, config, created_at, updated_at
) VALUES (?, ?, ?, ?, ?);

-- Update task status
UPDATE background_tasks SET status = ?, updated_at = ? WHERE id = ?;

-- Update task progress
UPDATE background_tasks 
SET progress_current = ?, progress_total = ?, progress_message = ?, 
    metadata = ?, updated_at = ?
WHERE id = ?;

-- Get task by ID
SELECT * FROM background_tasks WHERE id = ?;

-- List tasks with filters
SELECT * FROM background_tasks WHERE 1=1 
AND status = ? AND task_type = ? 
ORDER BY created_at DESC LIMIT ? OFFSET ?;
```

**Called By**:
- `src/background/BackgroundTaskManager.js` → All task lifecycle operations
- `src/crawler/CrawlOrchestrationService.js` → When crawls run as background tasks

### 8. Coverage Analytics and Telemetry

**Purpose**: Real-time monitoring of crawl coverage, gap analysis, milestone tracking, and dashboard metrics.

**Location**: `CoverageDatabase.js` → Various analytics methods

**Tables Modified**:
- `coverage_snapshots` - Periodic coverage snapshots
- `hub_discoveries` - Hub discovery events
- `coverage_gaps` - Identified coverage gaps
- `milestone_achievements` - Achievement tracking
- `dashboard_metrics` - Real-time metrics

**Key Queries**:

```sql
-- Record coverage snapshot
INSERT INTO coverage_snapshots (
  job_id, snapshot_time, domain, total_hubs_expected, total_hubs_discovered,
  coverage_percentage, gap_count, active_problems, milestone_count, telemetry_data
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);

-- Record hub discovery
INSERT OR IGNORE INTO hub_discoveries (
  job_id, discovered_at, hub_url_id, hub_type, discovery_method,
  confidence_score, classification_reason, gap_filled, coverage_impact, metadata
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);

-- Record coverage gap
INSERT OR REPLACE INTO coverage_gaps (
  job_id, gap_type, gap_identifier, gap_description, priority_score,
  first_detected, last_updated, resolution_status, attempts_count, metadata
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);

-- Record milestone achievement
INSERT INTO milestone_achievements (
  job_id, milestone_type, achieved_at, threshold_value, actual_value,
  improvement_percentage, context_data, celebration_level
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);

-- Record dashboard metric
INSERT OR REPLACE INTO dashboard_metrics (
  job_id, metric_name, metric_value, metric_unit, timestamp, aggregation_period, metadata
) VALUES (?, ?, ?, ?, ?, ?, ?, ?);

-- Get latest coverage snapshot
SELECT * FROM coverage_snapshots 
WHERE job_id = ? 
ORDER BY snapshot_time DESC 
LIMIT 1;

-- Get active gaps
SELECT * FROM coverage_gaps 
WHERE job_id = ? AND resolution_status = 'open'
ORDER BY priority_score DESC, first_detected ASC;

-- Get recent milestones
SELECT * FROM milestone_achievements 
WHERE job_id = ? 
ORDER BY achieved_at DESC 
LIMIT ?;

-- Get latest metrics
SELECT DISTINCT metric_name, metric_value, metric_unit, timestamp, metadata
FROM dashboard_metrics m1
WHERE job_id = ? AND timestamp = (
  SELECT MAX(timestamp) FROM dashboard_metrics m2 
  WHERE m2.job_id = m1.job_id AND m2.metric_name = m1.metric_name
)
ORDER BY metric_name;
```

**Called By**:
- `src/db/EnhancedDatabaseAdapter.js` → Coverage API endpoints (`/api/coverage/*`)
- `src/crawler/CrawlOrchestrationService.js` → Real-time crawl monitoring
- `src/background/BackgroundTaskManager.js` → Task progress telemetry

### 9. Analysis Run Tracking

**Purpose**: Track analysis operations and link them to background tasks for comprehensive workflow monitoring.

**Location**: Schema definitions and analysis services

**Tables Modified**:
- `analysis_runs` - Analysis operation tracking

**Key Queries**:

```sql
-- Record analysis run (with background task linkage)
INSERT INTO analysis_runs (
  started_at, status, config, background_task_id, background_task_status
) VALUES (?, ?, ?, ?, ?);

-- Update analysis run status
UPDATE analysis_runs SET status = ?, completed_at = ? WHERE id = ?;

-- Query analysis runs by background task
SELECT * FROM analysis_runs WHERE background_task_id = ?;
```

**Called By**:
- `src/deprecated-ui/express/services/analysisRuns.js` → Analysis operations
- Background tasks that perform analysis (compression, etc.)

## Instrumentation Data Flow

1. **Task Creation** → `background_tasks` (task metadata)
2. **Progress Updates** → `background_tasks` (current/total/message)
3. **Coverage Snapshots** → `coverage_snapshots` (periodic coverage data)
4. **Hub Discoveries** → `hub_discoveries` (discovery events)
5. **Gap Detection** → `coverage_gaps` (missing coverage tracking)
6. **Milestones** → `milestone_achievements` (progress celebrations)
7. **Metrics** → `dashboard_metrics` (real-time KPIs)
8. **Analysis Runs** → `analysis_runs` (linked to background tasks)

## Performance Considerations for Instrumentation

### Optimized Queries
- Prepared statements for all instrumentation operations
- Efficient indexes on job_id, timestamp, and status columns
- Batch operations for bulk metric recording

### Retention Policies
- Automatic cleanup of old telemetry data (configurable retention periods)
- Aggregation of historical data to reduce storage requirements

### Real-time vs Batch
- Real-time metrics for active monitoring
- Batch aggregation for historical analysis
- Configurable sampling rates to balance performance and detail

## Integration with Core Crawling

Instrumentation queries run alongside core crawl operations:
- **Queue events** track URL discovery and processing
- **Coverage snapshots** provide real-time progress monitoring  
- **Background tasks** enable long-running crawl persistence
- **Error logging** captures failures for debugging
- **Metrics collection** supports performance analysis

This comprehensive instrumentation enables detailed monitoring, debugging, and optimization of crawl operations while maintaining performance through efficient database design and prepared statements.</content>
<parameter name="filePath">c:\Users\james\Documents\repos\copilot-dl-news\docs\DB_QUERIES_DURING_CRAWLS.md