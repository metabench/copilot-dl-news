# Current State Analysis - Phase 0

**Generated**: 2026-01-02
**Goal**: Understand existing crawl infrastructure to build reliable 50-page download with evidence

## Evidence Model (What Exists Today)

### Database Tables

| Table | Purpose | Evidence Fields |
|-------|---------|-----------------|
| `urls` | URL registry | id, url, canonical_url, host |
| `http_responses` | Download records | url_id, http_status, bytes_downloaded, fetched_at, ttfb_ms, download_ms, content_type |
| `task_events` | Structured event log | task_id, event_type, severity, scope, target, payload, duration_ms, http_status, item_count |
| `crawl_jobs` | Job metadata | id, status, started_at, ended_at, pid |

### Current Database Stats

```
HTTP Responses: 62,769 total
  - 200 OK: 60,934 (97.1%)
  - Total bytes: 22.5 GB
```

### Key Files

| File | Purpose |
|------|---------|
| `tools/dev/mini-crawl.js` | CLI for test crawls |
| `src/db/TaskEventWriter.js` | Unified event logging |
| `src/db/sqlite/v1/schema-definitions.js` | All 93 tables |
| `src/crawler/NewsCrawler.js` | Main crawler engine |

## Instrumentation Status

### ✅ Already Exists
- **TaskEventWriter**: Comprehensive event logging with batch writes
- **http_responses table**: Records http_status, bytes, timings
- **task_events table**: Structured logs with categories/severity

### ⚠️ Gaps Identified
1. **No unified "download completed" proof**: Must join urls + http_responses + verify bytes > 0
2. **No progress broadcast**: No real-time signal for UI progress bar
3. **Cache vs network ambiguity**: Hard to distinguish "fetched from network" vs "from cache"
4. **No hash verification**: Content hashes not computed/stored

## Evidence Query

To prove a download happened:

```sql
SELECT 
  u.url,
  r.http_status,
  r.bytes_downloaded,
  r.fetched_at,
  r.ttfb_ms,
  r.download_ms
FROM http_responses r
JOIN urls u ON r.url_id = u.id
WHERE r.http_status = 200 
  AND r.bytes_downloaded > 0
ORDER BY r.fetched_at DESC
LIMIT 50;
```

## Rate Limiting Reality

- The Guardian enforces ~2s between requests
- 50 pages × 2s = **100+ seconds minimum**
- Default mini-crawl timeout: 30s (insufficient!)
- Required timeout: 600000ms (10 minutes)

## Previous Crawl Evidence

Crawl v6 (`tmp/guardian-crawl-50-v6.log`):
- Started: 2026-01-02T23:40:43
- Got: 36 pages (25 from network, 11 from cache)
- Stopped: mid-fetch (unknown reason)

## Next Steps

1. **Phase 1**: Define state machine (queued → fetching → fetched → verified)
2. **Phase 2**: Add proof-grade instrumentation (content hashes, download proofs)
3. **Phase 3**: Fix reliability (why did v6 stop at 36?)
4. **Phase 4-5**: Build stats API and Electron UI
