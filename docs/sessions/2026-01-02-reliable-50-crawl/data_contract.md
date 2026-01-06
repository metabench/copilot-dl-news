# Download State Machine & Evidence Contract

**Phase 1 Deliverable** — 2026-01-02

## State Machine

```
┌─────────┐     ┌──────────┐     ┌─────────┐     ┌──────────┐
│ QUEUED  │────▶│ FETCHING │────▶│ FETCHED │────▶│ VERIFIED │
└─────────┘     └──────────┘     └─────────┘     └──────────┘
     │               │                │
     │               │                │
     ▼               ▼                ▼
┌─────────┐     ┌──────────┐     ┌─────────┐
│ SKIPPED │     │  FAILED  │     │ INVALID │
└─────────┘     └──────────┘     └─────────┘
```

### State Definitions

| State | Meaning | Evidence Required |
|-------|---------|-------------------|
| QUEUED | URL added to crawl queue | queue_events record |
| FETCHING | HTTP request in flight | task_event with `event_type=work`, `scope=url:<url>` |
| FETCHED | Response received | http_responses record with `fetched_at` |
| VERIFIED | Content validated | `bytes_downloaded > 0`, `http_status = 200` |
| SKIPPED | Intentionally not fetched | task_event with reason (cache/duplicate/robots) |
| FAILED | Fetch failed | http_responses with `http_status != 200` OR error event |
| INVALID | Content validation failed | bytes mismatch, empty response, etc. |

## Evidence Contract

### To claim "1 page downloaded", you MUST have:

```typescript
interface DownloadProof {
  // REQUIRED - Database evidence
  url_id: number;              // urls.id
  http_response_id: number;    // http_responses.id
  
  // REQUIRED - Success indicators  
  http_status: 200;            // Must be exactly 200
  bytes_downloaded: number;    // Must be > 0
  fetched_at: string;          // ISO timestamp
  
  // RECOMMENDED - Timing evidence
  ttfb_ms?: number;            // Time to first byte
  download_ms?: number;        // Download duration
  
  // FUTURE - Hash verification
  content_sha256?: string;     // Hash of downloaded content
}
```

### Evidence Query (Proof of Download)

```sql
-- Count verified downloads for a crawl job
SELECT COUNT(*) as verified_downloads
FROM http_responses r
JOIN urls u ON r.url_id = u.id  
JOIN task_events e ON e.target = u.url AND e.task_id = ?
WHERE r.http_status = 200
  AND r.bytes_downloaded > 0
  AND r.fetched_at IS NOT NULL;
```

### Evidence Query (Full Proof Bundle)

```sql
-- Get complete evidence for a job
SELECT 
  u.id as url_id,
  u.url,
  r.id as http_response_id,
  r.http_status,
  r.bytes_downloaded,
  r.fetched_at,
  r.ttfb_ms,
  r.download_ms,
  r.content_type
FROM http_responses r
JOIN urls u ON r.url_id = u.id
WHERE r.fetched_at BETWEEN ? AND ?  -- job start/end times
  AND r.http_status = 200
  AND r.bytes_downloaded > 0
ORDER BY r.fetched_at;
```

## Progress Events

For UI progress bar, emit these task_events:

| Event Type | Payload | When |
|------------|---------|------|
| `crawl_started` | `{ target: 50, job_id }` | Job begins |
| `page_fetched` | `{ current: n, target: 50, url, bytes }` | Each download |
| `crawl_completed` | `{ actual: n, target: 50, elapsed_ms }` | Job ends |
| `crawl_failed` | `{ actual: n, target: 50, error }` | Job fails |

## Anti-Hallucination Rules

1. **Never say "downloaded" without `http_response_id`**
2. **Never claim success without `bytes_downloaded > 0`**
3. **Always query DB, never trust in-memory counters alone**
4. **Cache hits are NOT downloads** - log them separately
5. **Progress = verified_downloads / target**, not queue size

## File Locations

| Artifact | Path |
|----------|------|
| State machine | `docs/sessions/2026-01-02-reliable-50-crawl/data_contract.md` |
| Current state | `docs/sessions/2026-01-02-reliable-50-crawl/current_state.md` |
| Evidence queries | `src/db/queries/downloadEvidence.js` (to create) |
| Progress emitter | `src/crawler/telemetry/progressEmitter.js` (to create) |
