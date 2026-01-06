# Working Notes – Reliable 50-Page Crawl with Evidence System

- 2026-01-02 — Session created via CLI. Add incremental notes here.

## Phase 0: Database Discovery

Queried database schema and found key tables:

```
http_responses: 62,769 total records
  - 60,934 with HTTP 200 (verified downloads)
  - 22.5 GB total bytes
  - Last download: 2026-01-02T23:44:43.144Z
```

Key insight: `http_responses` is the source of truth, not in-memory counters.

## Phase 1: State Machine

Created state machine diagram in `data_contract.md`:
- QUEUED → FETCHING → FETCHED → VERIFIED
- Failure states: SKIPPED, FAILED, INVALID

Evidence contract: Never claim "downloaded" without `http_response_id + bytes_downloaded > 0`.

## Phase 2: Evidence Queries

Created `src/db/queries/downloadEvidence.js` with:
- `getDownloadStats(db, start, end)` - Verified/failed counts
- `getDownloadEvidence(db, start, end, limit)` - Full evidence bundle
- `verifyDownloadClaim(db, start, end, claimed)` - Anti-hallucination check
- `getDownloadTimeline(db, start, end)` - Progress visualization
- `getGlobalStats(db)` - All-time stats

Check script: `node checks/download-evidence.check.js`

## Phase 2b: Verified Crawl Runner

Created `tools/dev/verified-crawl.js`:
1. Captures baseline download count
2. Runs mini-crawl with proper timeout
3. Queries DB for actual new downloads
4. Generates verification report

Usage:
```bash
node tools/dev/verified-crawl.js https://www.theguardian.com --target 50
```

## Commands to Test

```bash
# Verify evidence queries work
node checks/download-evidence.check.js

# Run verified 50-page crawl
node tools/dev/verified-crawl.js https://www.theguardian.com --target 50 --timeout 600000

# Check task events after crawl
node tools/dev/task-events.js --list
node tools/dev/task-events.js --summary <jobId>
```

## Next Steps

1. Test verified-crawl.js with 50-page target
2. Build stats API endpoint for download graph
3. Create Electron UI with progress bar
