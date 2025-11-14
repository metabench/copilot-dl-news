# Follow Ups – Db View Implementation

- ✅ 2025-11-14 — Applied migrations 009 + 010 directly to `data/news.db` (backed up first via `Copy-Item data\news.db data\backups\news-<timestamp>.db`; executed SQL with `node -e "... db.exec(sql) ..."`) so `schema_migrations` now lists versions 1,2,3,8,9,10 and both compatibility views are live.
- ✅ 2025-11-14 — Applied migration 011 after trimming the view definition; the canonical database now reports versions 1,2,3,8,9,10,11 and `articles_view` no longer exposes `html`/`text`/`compressed_html` columns.
