---
status: canonical
source: AGENTS.md
last_migrated: 2025-11-04
owner: operations
---

# Database Backup Checklist

Use this checklist before running schema migrations, large imports, or data correction tools.

## Pre-Backup

- [ ] Confirm target database: `news.db`.
- [ ] If present/needed, include `gazetteer.db` (optional tooling scratch DB).
- [ ] Verify sufficient disk space in `data/backups/`.

## Backup Commands

```powershell
$timestamp = Get-Date -Format "yyyy-MM-dd-HHmmss"
Copy-Item -Path "data\news.db" -Destination "data\backups\news-backup-$timestamp.db" -Force
Copy-Item -Path "data\gazetteer.db" -Destination "data\backups\gazetteer-backup-$timestamp.db" -Force
```

## Post-Backup

- [ ] Keep only the most recent backup for each database (remove older ones).
- [ ] Confirm compressed exports (NDJSON) for gazetteer data when required.
- [ ] Document the backup timestamp in the change log or task tracker.
