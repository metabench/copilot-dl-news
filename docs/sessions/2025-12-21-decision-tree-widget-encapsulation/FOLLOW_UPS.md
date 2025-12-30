# Follow Ups – Decision Tree access in crawl-widget + SQL encapsulation

- Owner: 🔧 CLI Tool Singularity — Add a CI-friendly check that rejects new `db.prepare`/`db.exec` usage in `src/ui/**` and `crawl-widget/**` (allow-list tests/tools).
- Owner: DB Modular — Decide the canonical home for DB-adjacent “repository-like utils” (`src/utils/*` that accept `better-sqlite3` handles): move under `src/db/**` vs wrap behind adapters.
- Owner: UI Singularity — Migrate `src/ui/server/services/themeService.js` DB access behind a DB adapter/repository (stop using raw `better-sqlite3` handle in service).
- Owner: UI Singularity — Migrate `src/ui/server/geoImportServer.js` DB access behind adapters (or explicitly document as a tooling exception).

Implementation notes:
- Guard script should be a small Node CLI (suggested home: `tools/dev/` or `checks/`) with an allow-list JSON (path + reason) so exceptions are explicit and reviewable.
- For `geoImportServer.js`, consult `docs/sessions/2025-11-28-css-js-separation/` first to avoid redoing CSS/asset wiring.
