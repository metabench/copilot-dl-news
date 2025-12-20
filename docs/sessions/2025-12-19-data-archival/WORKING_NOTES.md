# Working Notes – Data consolidation + archival tooling

- 2025-12-19 — Session created via CLI. Add incremental notes here.

- 2025-12-19 — DB consolidation (single production DB)
	- Inventory: `node tools/dev/dir-sizes.js --dir data --top 20 --json`
		- `data/news.db` ~5.38GB (production)
		- Extra DB artifacts found: `news_crawls.db`, `tmp-ui-metrics.db`, `urls.db`, `urls.sqlite`, `db.sqlite`, plus `gazetteer.db.backup-*` and assorted `*-wal/*-shm`.
	- Ran WAL consolidation for production DB (no VACUUM): `node tools/db-maintenance.js --checkpoint-only`
		- Confirmed `data/news.db-wal` and `data/news.db-shm` are gone afterwards.
	- Removed non-production DB artifacts in `data/` via Node one-liner (deleted 19 files).
	- Post-clean inventory: `data/` is now basically `news.db` + `gazetteer.db` + small JSON/fixtures (~5.38GB total).
