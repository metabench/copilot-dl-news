# Working Notes – Db View Implementation

- 2025-11-14 — Session created via CLI. Add incremental notes here.
- 2025-11-14 — Authored `src/db/migrations/010-articles-view.sql` from the Phase 4 compatibility spec so analytics tooling can continue reading a denormalized `articles` projection.
- 2025-11-14 — Copied `data/news.db` to `migration-temp/db-view-test.db` and applied the view migrations via:
	- `node -e "const fs=require('fs');const Database=require('better-sqlite3');const path=require('path');const db=new Database('migration-temp/db-view-test.db');const migrations=['009-place-hubs-with-urls-view.sql','010-articles-view.sql'];for (const name of migrations) { const sql=fs.readFileSync(path.join('src','db','migrations',name),'utf8');db.exec(sql); }"`
	- Verified created views with `node -e "const Database=require('better-sqlite3');const db=new Database('migration-temp/db-view-test.db');const pragma=db.prepare('PRAGMA table_info(\'articles_view\')').all();console.log(pragma.map(c=>c.name));"`
	- `place_hubs_with_urls` columns validated via `PRAGMA table_info('place_hubs_with_urls')` (same pattern as above).
- 2025-11-14 — Noted that `http_responses` lacks `content_length`; exposed it as `NULL` in the view to keep column parity with the old table without misrepresenting data.
- 2025-11-14 — Applied migrations 009/010 to the canonical `data/news.db` (backed up via `Copy-Item data\news.db data\backups\news-<ts>.db`) and verified `schema_migrations` now lists versions `[1,2,3,8,9,10]` alongside the `articles_view` and `place_hubs_with_urls` entries in `sqlite_master`.
- 2025-11-14 — Authored `src/db/migrations/011-articles-view-no-html.sql` to drop raw/compressed HTML exposure. Updated docs (phase 4 spec, schema reference, inventory) and reran the migration against `data/news.db` (with a fresh backup) so `schema_migrations` now reports `[1,2,3,8,9,10,11]` and `PRAGMA table_info('articles_view')` shows metadata-only columns.
- 2025-11-14 — Re-reviewed `src/tools/analyse-pages-core.js` to confirm it already instantiates `DecompressionWorkerPool` and inflates blobs before analysis, which satisfies the requirement that analysis uncompress content rather than relying on view-provided HTML.
