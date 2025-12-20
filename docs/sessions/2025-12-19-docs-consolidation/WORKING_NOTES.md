# Working Notes – Documentation Consolidation

- 2025-12-19 — Session created via CLI. Add incremental notes here.

- 2025-12-19 18:29 — 
## Consolidation pass (commands/testing) — 2025-12-19
- Made `docs/COMMAND_EXECUTION_GUIDE.md` canonical + updated outdated `replace_string_in_file` references to `apply_patch`.
- Converted `docs/agents/command-rules.md` into a thin pointer (no duplicated workflow).
- De-duplicated `docs/agents/testing-guidelines.md` by routing to `docs/TESTING_QUICK_REFERENCE.md` + deeper guides.
- Updated testing docs that referenced obsolete tools: `docs/TESTING_FOCUSED_WORKFLOW.md`, `docs/TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md`.
- Added `Quick References` section to `docs/INDEX.md` for commands/testing/DB.
- Reduced duplication in `AGENTS.md` by pointing server verification to the canonical Command Execution Guide section.
- Validation: `grep_search` for `replace_string_in_file|multi_replace_string_in_file` now only hits `docs/archives/*`.

- 2025-12-19 19:15 — Consolidation pass (database paths + maintenance + legacy DB drift)
	- Canonicalized “single production DB” policy in `docs/database/overview.md`.
	- Updated `docs/DATABASE_QUICK_REFERENCE.md`:
		- Examples now use `data/news.db` (not `/path/to/db.sqlite`).
		- Removed a duplicated second copy of large sections; kept one copy + kept the unique tail content.
		- WAL cleanup guidance now uses `<dbPath>[-wal|-shm]` rather than hardcoding `db.sqlite*`.
	- Updated stale docs that assumed `urls.db` or `db.sqlite`:
		- `docs/checklists/database_backup.md` (dropped `urls.db` from backups)
		- `docs/PHASE_123_PRODUCTION_MONITORING_GUIDE.md` (switched `sqlite3 urls.db` to `node tools/db-query.js`)
		- `docs/DATABASE_INITIALIZATION_ARCHITECTURE_ANALYSIS.md`, `docs/DATABASE_REFACTORING_COMPLETE.md` (examples now use `data/news.db`)
		- `docs/database/schema/main.md` (fixed `node tools/db-vacuum.js` → `node tools/vacuum-db.js`)
	- VS Code excludes tightened in `.vscode/settings.json`:
		- Added `docs/archives/**` + `docs/root-migration/**` to watcher/search (and Explorer) excludes.
		- Excluded common artifact filetypes repo-wide from watcher/search (`*.log`, `*.ndjson`, `*.zip`, `*.db-*/ *.sqlite-*`).
