# Partitioning & Large Table Management

_Last verified: 2025-11-04_

## Overview
SQLite lacks native table partitioning; we rely on **logical partitioning** through archival tables and export/import workflows. The largest tables (`links`, `queue_events`, `place_names`) require periodic trimming to keep `news.db` under the 5 GB SLO.

## Strategy
1. **Hot vs. Cold Separation**
   - Keep "hot" operational data in primary tables.
   - Move "cold" historical rows into auxiliary tables under `archive_*` namespaces or NDJSON exports in `data/exports/`.
2. **Use Migration CLI**
   - `node tools/migration-cli.js export --table queue_events --before 2024-01-01` (example) writes to `migration-export/` with metadata for re-import.
   - Follow with delete/backfill migrations guarded by foreign-key constraints.
3. **Batch Deletes**
   - Perform deletes in 10k row chunks to avoid long-running locks.
   - Wrap batches in transactions and checkpoint between batches.
4. **Verification**
   - After archival, run `node tools/db-schema.js stats` to confirm row count drop.
   - Update `docs/database/_artifacts/news_db_stats.json` with new totals.

## Archive Table Pattern
```sql
CREATE TABLE IF NOT EXISTS archive_queue_events AS
SELECT * FROM queue_events WHERE 0;

INSERT INTO archive_queue_events
SELECT * FROM queue_events WHERE job_id = :jobId AND created_at < :cutoff;

DELETE FROM queue_events
WHERE job_id = :jobId AND created_at < :cutoff;
```
- Apply using migrations with explicit parameters or via `migration-cli` scripting.

## Triggers & Constraints
- Ensure triggers that maintain derived tables (`latest_fetch`, `place_names` guards) are either replicated on the archive table or documented as intentionally missing.
- For `queue_events`, no triggers exist; safe to copy.

## Scheduling
- Review table growth monthly using `news_db_stats.json`.
- Prioritize `queue_events` (>1.6M rows) and `links` (>4.8M rows).

## Documentation
- Record each archival run in `CHANGE_PLAN.md` with row counts moved and location of exported files.
- Update this runbook when new archival helpers or destination stores (e.g., Parquet, Postgres) are introduced.
