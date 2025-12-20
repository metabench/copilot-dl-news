# Working Notes – Prune saved database backups

- 2025-12-19 — Session created via CLI. Add incremental notes here.

## Baseline

- Total workspace size (file sum): ~48.531 GB
- Biggest culprits:
	- `data/backups/` (~24.446 GB)
	- `migration-export/` (~8.3 GB)
	- `migration-temp/` (dominated by `db-view-test.db`, ~4.6 GB)
	- `data/perf-snapshots/baseline/news.db` (~4.7 GB)

## Actions

- Deleted large generated artifacts:
	- `data/backups/`
	- `migration-export/`
	- `migration-temp/`
	- `data/perf-snapshots/baseline/`
- Kept `data/news.db` (main DB).

## Result

- Total workspace size after cleanup: ~6.586 GB
- Largest remaining DB file: `data/news.db` (~5.0 GB)

## Repeatable tool

- Node tool entrypoint: `tools/prune-large-artifacts.js`
- Dry-run (recommended first): `npm run prune:large`
- Apply deletes: `npm run prune:large:apply`
- Notes:
	- Skips git-tracked files by default (so it won't nuke tracked fixtures under `migration-temp/`).
	- Keeps `data/news.db` and `data/gazetteer.db` by default (configurable via `--keep-db`).
