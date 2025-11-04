# Backups Runbook

_Last verified: 2025-11-04_

## Scope
Covers creation of safe backups for the primary SQLite database `data/news.db` before migrations, bulk imports, or releases.

## Prerequisites
- No long-running processes should hold write connections (stop crawlers, background tasks, tests).
- Ensure at least 10 GB free disk space under `data/backups/`.
- Confirm the WAL file is checkpointed to keep backup copies small (`node tools/db-maintenance.js`).

## Standard Backup Procedure
1. **Checkpoint / vacuum (optional but recommended)**
   ```powershell
   node tools/db-maintenance.js
   ```
2. **Create timestamped copy**
   ```powershell
   $timestamp = Get-Date -Format "yyyy-MM-dd-HHmmss"
   Copy-Item data\news.db data\backups\news-backup-$timestamp.db -Force
   ```
3. **Verify file hash** (ensures copy integrity)
   ```powershell
   Get-FileHash data\backups\news-backup-$timestamp.db -Algorithm SHA256
   ```
4. **Log the backup**
   - Append entry to `CHANGE_PLAN.md` or ops log with timestamp, operator, reason.
   - Update `docs/database/db_docs_status.json` `artifacts` section if the backup accompanies schema docs.

## Automated Nightly Pattern (Optional)
- Schedule the PowerShell commands above via Task Scheduler.
- Keep only the most recent 3 nightly backups to respect the repository policy (one recent copy checked in).

## Verification Checklist
- [ ] Backup file exists under `data/backups/` with correct timestamp.
- [ ] SHA256 hash recorded.
- [ ] Original `data/news.db` unchanged (size and hash stable).
- [ ] Entry logged in ops documentation or ticket.

## Troubleshooting
- **Copy fails with lock error:** Another process has the DB open. Stop the Express server, CLI tools, or tests; rerun checkpoint then copy.
- **Backup size unexpectedly large:** Run `node tools/db-maintenance.js` first. Large WAL files inflate backups.
- **Insufficient disk space:** Clear older backups, compress archive to external storage, or coordinate with infra for additional space.

## Related Docs
- `docs/database/migrations/policy.md` (migration prerequisites)
- `docs/database/overview.md` (backup SLO)
