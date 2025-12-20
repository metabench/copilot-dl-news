# VACUUM & ANALYZE Runbook

_Last verified: 2025-11-04_

## Objective
Keep `news.db` performant by reclaiming free space and refreshing SQLite statistics used by the query planner.

## When to Run
- After large delete/backfill operations (>100k rows).
- Monthly maintenance window (align with backup cadence).
- Before creating long-lived backups to minimize file size.

## Preparation Checklist
- [ ] Confirm no long-running jobs are writing to the database.
- [ ] Ensure at least 5 GB free space for the temporary copy SQLite builds during `VACUUM`.
- [ ] Capture a fresh backup prior to maintenance (see backups runbook).

## Execution
1. **Single command maintenance**
   ```powershell
   node tools/db-maintenance.js
   ```
   - Performs `wal_checkpoint(TRUNCATE)` followed by `VACUUM`.
   - If you only need to consolidate/truncate the WAL (no VACUUM), run:
     ```powershell
     node tools/db-maintenance.js --checkpoint-only
     ```
2. **Refresh statistics**
   ```powershell
   node -e "const Database=require('better-sqlite3'); const db=new Database('data/news.db'); db.exec('ANALYZE;'); db.close();"
   ```
   - Issues `ANALYZE` across all tables to refresh planner statistics.
3. **Record results**
   - Compare `docs/database/_artifacts/news_db_stats.json` before/after.
   - Log maintenance date, duration, and file size delta.

## Validation
- Inspect output from `db-maintenance` script for `✅` success markers.
- Run sample read queries via `node tools/db-schema.js query "SELECT COUNT(*) FROM links"` to confirm responsiveness.
- Re-run targeted tests if schema-critical (crawler smoke, analytics summary).

## Troubleshooting
- **Checkpoint warning:** indicates open connections. Stop the server/tests and retry.
- **VACUUM failure due to disk space:** clear temp files or mount the database on a larger volume.
- **ANALYZE errors:** ensure PRAGMA `analysis_limit` not overridden; rerun command.

## Follow-up
- Update maintenance log/ticket.
- Schedule next review in 30 days or sooner if `news_db_stats.json` shows rapid growth.
