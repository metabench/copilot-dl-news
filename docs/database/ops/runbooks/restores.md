# Restores Runbook

_Last verified: 2025-11-04_

## Scope
Covers restoring `data/news.db` from a previously captured backup within `data/backups/`.

## Preconditions
- Identify the target backup (`news-backup-YYYY-MM-DD-HHmmss.db`).
- Communicate the downtime window to crawler/background-task stakeholders.
- Ensure no application process is writing to the database (stop servers, workers, scheduled jobs).

## Restore Procedure
1. **Archive current database**
   ```powershell
   $timestamp = Get-Date -Format "yyyy-MM-dd-HHmmss"
   Copy-Item data\news.db data\backups\news-pre-restore-$timestamp.db -Force
   ```
2. **Copy backup into place**
   ```powershell
   Copy-Item data\backups\news-backup-YYYY-MM-DD-HHmmss.db data\news.db -Force
   ```
3. **Verify integrity**
   ```powershell
   node -e "const Database=require('better-sqlite3'); const db=new Database('data/news.db'); const result=db.pragma('integrity_check', { simple: true }); console.log(result); db.close();"
   ```
   - Expected output: `ok`.
4. **Warm-up checkpoint (optional)**
   ```powershell
   node tools/db-maintenance.js
   ```
5. **Smoke test**
   - Run focused Jest tests touching critical tables: `npm run test:file "src/db/**"`.
   - Start crawler in staging mode if available and fetch a single URL to confirm reads/writes succeed.

## Post-Restore Actions
- Update incident/ticket with restoration timestamp, source backup, validation results.
- Monitor log volume and `query_telemetry` for anomalies during the first hour post-restore.
- Schedule a fresh backup after confirming system stability.

## Rollback
- If restoration fails, revert using the `news-pre-restore-*` snapshot created in step 1.

## Related References
- `docs/database/ops/runbooks/backups.md`
- `docs/database/migrations/policy.md`
