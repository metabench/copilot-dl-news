# Reindex Runbook

_Last verified: 2025-11-04_

## Purpose
Handle corruption or planner regressions by rebuilding indexes in `news.db`. Useful after disk errors, bulk migrations, or when `PRAGMA integrity_check` flags index issues.

## Detection Signals
- `SELECT * FROM pragma_index_info(...)` errors.
- `PRAGMA integrity_check;` returns messages mentioning `malformed` indexes.
- Query latency spikes isolated to specific tables despite fresh ANALYZE stats.

## Safety Requirements
- Take a backup (`backups.md`) before issuing `REINDEX`.
- Stop all writers; reindexing holds exclusive locks.

## Procedure
1. **Targeted reindex by table** (preferred)
   ```powershell
   node -e "const Database=require('better-sqlite3'); const db=new Database('data/news.db'); db.exec('REINDEX links;'); db.close();"
   ```
   - Rebuilds all indexes associated with the `links` table (replace with target table name).
2. **Specific index**
   ```powershell
   node -e "const Database=require('better-sqlite3'); const db=new Database('data/news.db'); db.exec('REINDEX idx_queue_events_job_ts;'); db.close();"
   ```
3. **Full database reindex** (last resort)
   ```powershell
   node -e "const Database=require('better-sqlite3'); const db=new Database('data/news.db'); db.exec('REINDEX;'); db.close();"
   ```
   - Rebuilds every index; expect multi-minute downtime on large tables like `links`.

## Validation
- Run `PRAGMA integrity_check;` to confirm success.
- Sample problematic queries (e.g., crawler dashboard view) and compare timings.
- Regenerate planner stats via `ANALYZE` if full reindex performed.

## Post-Operation
- Update maintenance record with indexes touched and durations.
- Monitor `query_telemetry` for 24 hours to ensure stability.

## Troubleshooting
- **Command not found:** ensure `tools/db-schema.js` recent version; install dependencies via `npm install`.
- **Lock timeout:** indicates lingering connections; stop services and retry.
- **Reindex all too slow:** fall back to targeted reindex in batches (links, queue_events, gazetteer) with pauses for availability.
