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
- `news-crawler-db` now owns major access surfaces for maintenance, URL listing, task events, remote crawler v2, article search and search-service diagnostics, Guardian/place-hub diagnostics, legacy adapters, enhanced queue/planner/coverage/crawl helpers, SQLiteNewsDatabase compatibility, gazetteer/place-hub/query/UI compatibility modules, active content query utilities, schema contracts, place-hub candidate persistence, database introspection, place-hub URL patterns, active service/runtime hub-gap and GeoNames import access, quick-win schema migrations, crawler strategy templates, adaptive exploration, goal optimization persistence, the remaining active `src/core` runtime DB calls, Postgres v1 parity compatibility runtime, the non-test SQLite UI query wrappers, top-level SQLite v1 query wrappers, gazetteer QA/schema migration, gazetteer dedupe and historical-name ingestion tooling, active download/admin check fixtures, cloud-crawl e2e DB validation reads, downloads dev CLI/bar-chart read models, SQLite and Postgres schema-sync extraction/generation/drift contracts, hub-discovery diagnostics/verification tooling, active remote crawl server/merge/queue tooling, Electron crawler app diagnostics, DSPL analysis read models, exporter/importer/validator/schema-version infrastructure plus the legacy NDJSON exporter, FTS5 article-search migration logic, URL-normalization schema/migration/validation/cleanup tooling and smoke tests, normalized-table phase 1/phase 2 migration tooling, place-hub backup/fix utilities, compression backfill/benchmark/cleanup DB access, PostGIS explorer query contracts, classification migration tooling, URL-classification table migration tooling, background-task status constraint migration tooling, `DualDatabaseFacade` side-by-side export orchestration, active tool cluster covering seeders/URL-classification export/`crawl-remote`/place-hub discovery/gazetteer clone/intelligent-crawl experiment DB setup, content-storage duplicate/failure diagnostics, maintainDb cleanup, template-teacher DB reads/signature creation, place-hub pattern-learning and analytics dashboard check fixtures, small `place_exclusions`/HTTP-cache/layout-template schema migrations, schema metadata/fingerprint helpers, redacted export snapshot prep, visual-diff review reads, query telemetry/instrumentation, diagnostic report helpers, rate-limit analysis read models, country-name normalization, analysis maintenance/current-version reports, FTS backfill candidate/update contracts, the basic maintenance DB check snapshot, place-hub active-probe/discovered-hub ingest DB reads/upserts, webhook dashboard SQLite-handle bridge, regional news-source migration planning/insertion, maintenance compatibility view/schema diagnostics, GeoImport alternate-name check DB operations, gazetteer listing read models, missing content-storage debug snapshots, small schema maintenance scripts, gazetteer canonical-name correction, gazetteer NDJSON export, generic data-export reads, page-export source/output operations, enhanced-adapter utility SQL, analysis-data debug snapshots, analysis-status/confidence-backfill tooling, debug URL/page/export/predict inspection snapshots, dev download inspection/chart read models, hub-depth probe read/update contracts, query telemetry recent-read contract, place-extraction/place-hub runtime read helpers, unified-app/place-hub UI check read helpers, place-source maintenance, place-hub utility/validator-cache reads, SQLite bootstrap/url/topic helper compatibility, active check-only fixture/health probes, DB table-size diagnostic tooling, and telemetry cleanup DB operations.
- Latest additions include Postgres health checks, SQLite migration utility scripts, remaining debug/check utility read models, gazetteer export iterators, snapshot verification, URL-classification sampling, site-pattern listing, crawl-site threshold counts, benchmark probes, locale seeding, analytics download-history reads, unified-app dashboard counts, topic-hub cell samples, remaining DB smoke probes, the domain crawl behaviors JS migration artifact, the query time-budget helper, relocation of 24 legacy SQLite `.sql` migration artifacts into `news-crawler-db`, relocation of the archived manual SQL snippet, relocation of Postgres Docker bootstrap SQL, and migration of the final UI scenario/country-coverage fixtures.
- Latest broad active-path static scan reports 125 broad SQL/driver-pattern matches in `copilot-dl-news` after excluding docs, tests, WIP, public assets, `node_modules`, and data files.
- Remaining broad-scan paths are classified in `config/db-boundary-residual-classifications.json` as generated/static bundles, docs/examples, dev source scanners, SPARQL query builders, regex parser loops, UI lab/check fixtures, or one deprecated source mutator.
- Analysis layering rule: `news-db-pure-analysis` remains pure and DB-free; `news-db-analysis` bridges `news-crawler-db` read/write APIs to pure analysis functions; `news-crawler-db` must not depend on either analysis package.
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
