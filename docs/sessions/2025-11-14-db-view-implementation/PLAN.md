# Plan – Db View Implementation

## Objective
Add articles and place hub views

## Done When
- [ ] `place_hubs_with_urls` and `articles_view` exist via repeatable migrations.
- [ ] Session docs capture SQL/test notes and follow-ups (PLAN → summary pipeline complete).
- [ ] Manual validation confirms the views project the expected columns.

## Change Set (initial sketch)
- `src/db/migrations/009-place-hubs-with-urls-view.sql` (ensure up-to-date + referenced by runner).
- `src/db/migrations/010-articles-view.sql` (new view migration + schema_migrations insert).
- `docs/sessions/2025-11-14-db-view-implementation/*` (PLAN, WORKING_NOTES, SUMMARY, FOLLOW_UPS).

## Risks & Mitigations
- Legacy consumers may expect denormalized column names → mirror old schema exactly (`html`, `text`, etc.) and comment deviations.
- Views could mask missing indexes and become slow → document optional indexes / follow-ups for optimisation.
- Running migrations on stale DB may fail if tables missing → test against local `data/news.db` snapshot, wrap in transaction where possible.

## Tests / Validation
- Run `node tools/migration-cli.js status` before/after to capture version deltas.
- Connect via `better-sqlite3` REPL to `SELECT 1 FROM place_hubs_with_urls LIMIT 1` and `PRAGMA table_info(articles_view)` to verify columns.
- Spot-check `COUNT(*)` from both views to ensure they respond quickly.
