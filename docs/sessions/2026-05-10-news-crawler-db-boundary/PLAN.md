# Plan: News Crawler DB Boundary

Objective: Remove copilot-dl-news direct DB/adapter ownership by routing applicable DB access through news-crawler-db after confirming the target package is fit for the needed contracts.

Done when:
- news-crawler-db exports and tests are reviewed for the required DB adapter/API capabilities.
- copilot-dl-news direct DB access paths are inventoried and prioritized.
- Runtime call sites that can be migrated in this pass depend on news-crawler-db.
- Any unmigrated archive-only or blocked paths are documented with rationale.
- Focused checks prove module loading and changed behavior without unsafe production DB writes.

Current continuation status:
- Direct copilot-side `better-sqlite3` constructors/imports are migrated; remaining direct DB boundary work is now mostly SQL/query ownership.
- `news-crawler-db` now owns major access surfaces for maintenance, URL listing, task events, remote crawler v2, article search, Guardian/place-hub diagnostics, legacy adapters, enhanced queue/planner/coverage/crawl helpers, SQLiteNewsDatabase compatibility, gazetteer/place-hub/query/UI compatibility modules, active content query utilities, schema contracts, place-hub candidate persistence, database introspection, place-hub URL patterns, active service/runtime hub-gap and GeoNames import access, quick-win schema migrations, crawler strategy templates, adaptive exploration, and goal optimization persistence.
- Latest broad active-path static scan reports 1,586 raw SQL/driver-pattern matches in `copilot-dl-news` after excluding docs, tests, WIP, public assets, `node_modules`, and data files.
- Remaining work must proceed as staged contract migration rather than a single mechanical rewrite. The highest-value active clusters are now core runtime modules: `HierarchicalPlanner`, legacy `RemoteCrawlerAdapter`, gazetteer ingestors/schedulers, and `runLegacyCommand`, followed by legacy Postgres runtime decisions and tool/script classification.
- See `STATUS.md` for the current inventory, priority order, and definition of done.

Change set:
- copilot-dl-news code paths that currently import local DB adapters or open SQLite directly.
- package/dependency metadata if news-crawler-db must be referenced by path/workspace dependency.
- news-crawler-db only if a small missing export is required for safe consumption.

Risks/assumptions:
- Production `data/news.db` is read-only for this migration unless explicitly guarded by dry-run tooling.
- Do not move analysis/reporting logic into news-crawler-db; analysis belongs in news-db-analysis.
- Some copilot-dl-news files may be historical archive scripts and should be documented rather than aggressively rewritten.

Tests:
- Use focused Node/package checks first.
- Run changed-package tests if dependency installation and test selection allow it.
- Avoid long crawl loops.

Docs to update:
- This session index, plan, status, and working notes.
- Any usage docs affected by the final dependency boundary.
