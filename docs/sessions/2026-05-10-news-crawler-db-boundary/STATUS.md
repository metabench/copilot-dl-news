# Current Status: News Crawler DB Boundary

Last checked: 2026-05-11.

## Short Answer

Not absolutely complete, because copilot still contains historical SQL migration artifacts, generated/static bundles, docs/examples, and non-DB query-string false positives. Active runtime/check/tool DB ownership is now largely moved behind `news-crawler-db` APIs.

Substantial active slices have been migrated into `news-crawler-db`. The remaining work is now mostly active tool/script classification and migration/generated/test-only exceptions rather than active `src/core` runtime ownership, Postgres parity runtime ownership, or SQLite v1 query-wrapper ownership.

## What Is Already Migrated

`news-crawler-db` now owns explicit access surfaces or compatibility exports for:

- DB opening/compatibility through `openNewsCrawlerDb` and `createDbAdapter`.
- Maintenance/schema inspection helpers.
- URL listing/data-explorer reads.
- Task event persistence and telemetry readers.
- Remote crawler v2 runtime/export/sync access.
- Synchronous article search adapter.
- Guardian/place-hub diagnostics.
- User, topic, alert, and workspace legacy adapters.
- Schedule, API key, healing, template review, and push legacy adapters.
- Admin, billing, tag, trust, recommendation, sentiment, summary, similarity, coverage, and integration legacy adapters.
- Enhanced queue, planner, coverage, and crawl helper classes.
- SQLiteNewsDatabase compatibility facade and direct collaborators.
- Gazetteer v1/classic query modules, standalone GazetteerDatabase, schema helpers, and place-page mappings.
- Place-hub guessing UI queries and place-hub backfill DB writes.
- Core URL queue adapters (`IUrlQueue`, SQLite, and Postgres stub-compatible adapters).
- Active UI query modules for quality metrics, analytics, gazetteer country/place views, queues, UI themes, crawl observer, domain listing/counts/details, recent domains, storage totals, article viewer DB reads/counts, cloud crawl status, configuration, crawl types/events/listings, error summaries, and cached metrics.
- Postgres v1 parity compatibility runtime: pool factory, schema ensure/seed, `PostgresNewsDatabase`, analyse-pages-core queries, article XPath pattern queries, and common helper contracts.
- SQLite/Postgres v1 generated schema definition contracts and SQLite v1 schema initializer wrappers.
- Active query modules for domain crawl behavior, analysis runs, REST article reads, rate limits, classification type UI reads, schema inspection, pattern sharing, page export, download evidence, multi-language places, topic keywords, crawl skip terms, non-geo topic slugs, layout signatures/templates/masks/adapter, place-hub UI reads, URL details, and domain summary counts.
- Top-level SQLite v1 query wrappers for analysis display, article date backfill, background tasks, compression stats, maintenance helpers, place-hub crawl tooling, place-hub country candidates, telemetry stats, and topic-hub guessing UI reads.
- Gazetteer QA validation/repair helpers, gazetteer schema migration, hub-discovery diagnostic/verification tooling reads and writes, and the active remote crawl tools' queue/run/log/status/export/merge DB operations.
- Electron crawler app URL diagnostics, DB stats, cache clearing, and content lookup.
- DSPL analysis read models for place metadata, country-hub candidate articles, and place-hub pattern rows.
- SQLite/Postgres database table exporter infrastructure with a copilot compatibility wrapper.
- SQLite FTS5 article-search migration executable logic.
- URL-normalization schema application, backfill migration, validation, remaining-batch inspection, and old-URL-column cleanup tooling.
- Normalized-table phase 1 schema migration and phase 2 dual-write prerequisite/version tooling.
- PostGIS explorer connection/config and query contracts, with copilot retaining CLI presentation and GeoJSON file output.
- Classification type schema/seed/discovery migration, URL-classification table migration, and background-task status constraint migration tooling.
- URL-normalization migration schema smoke-test helpers, place-hub backup table copy helpers, and article-place relation foreign-key repair tooling.
- Gazetteer duplicate-cluster inspection/merge tooling and historical-name place lookup/link/create/name ingestion tooling.
- Active download verification and admin dashboard checks' in-memory DB fixtures.
- Active cloud-crawl e2e validation DB snapshot/evidence reads and downloads dev CLI/bar-chart read models.
- Schema-sync database schema extraction, row-count inspection, generated schema-definition text, stats generation, and drift hashing.
- Compression backfill planning/item updates and compression benchmark DB snapshot/sample/current-settings reads.
- Data migration primitives: `DatabaseImporter`, `DataValidator`, and `SchemaVersionManager`.
- Side-by-side SQLite/Postgres `DualDatabaseFacade` export/dual-write orchestration.
- Article-search service diagnostics used by `checks/search-service.check.js`.
- Place-hub candidate store.
- Gazetteer/database introspection used by the geo import UI.
- Place-hub URL pattern store.
- Active service/runtime persistence for URL pattern learning/classification consumers, hub-gap analyzers, site pattern analysis, GeoNames import, news website discovery, country-hub matching, hub task generation, intelligent crawl archive stats, crawler quick-win schema migrations, URL eligibility checks, domain registry reads, crawler URL status updates, place-hub seed persistence, country-hub planner status checks, resilience DB health checks, strategy templates, adaptive exploration, multi-goal optimization, and known hub seed reads.
- Previously remaining active core runtime DB calls in `HierarchicalPlanner`, `RemoteCrawlerAdapter`, gazetteer ingestors/scheduler, `runLegacyCommand`, and `StorageServices`.
- Active tool/runtime cluster for topic/skip-term seeding, URL-classification export, `crawl-remote` local sync verification, remote sync ingest, place-hub discovery, gazetteer clone, and intelligent-crawl experiment DB setup.
- Smaller active tool/check clusters for content-storage duplicate diagnostics, maintainDb place-name cleanup, template-teacher layout-template reads/signature creation, place-hub pattern-learning in-memory fixture setup, `place_exclusions` migration, and HTTP cache field/index migration.
- Schema metadata/fingerprint helpers, redacted export snapshot preparation, visual-diff review reads, query telemetry/instrumentation, document-count/gazetteer/compression diagnostic reports, and rate-limit analysis read models.
- Analytics dashboard in-memory fixtures, gazetteer country canonical-name normalization, analysis maintenance/current-analysis-version snapshots, compression cleanup row selection/update contracts, deprecated legacy content migration stub, and FTS backfill candidate/update contracts.
- Postgres schema-sync translation/generation, the legacy NDJSON migration exporter, and the basic maintenance DB check snapshot.
- Place-hub active-probe and discovered-hub ingest country/mapping reads and mapping upserts.
- Webhook dashboard SQLite-handle adapter bridge, storage failure debug diagnostics, layout template/mask schema migration, and regional news-source migration planning/insertion.
- Maintenance compatibility view creation and content-storage schema diagnostics.
- GeoImport alternate-name in-memory check schema/fixture writes, batch import writes, and verification reads.
- Gazetteer listing read models for regions, cities, capitals, country names, and place hubs.
- Missing content-storage debug snapshot reads.
- Small schema/maintenance operations for performance indexes, article-place relation foreign-key repair, places Wikidata columns, and place-hub-candidates reset.
- Gazetteer canonical-name correction preview/update reads.
- Gazetteer NDJSON export table validation, SQLite export setup, and table reads.
- Generic JSON/CSV/RSS/Atom article/domain export read model used by `export-data`.
- Page-export source reads, output schema creation, compression metadata insertion, and output article batch inserts.
- Enhanced database adapter compatibility bridge, feature-table status, health probe, and old-cluster cleanup SQL.
- Analysis-data debug snapshot reads for `http_responses`, `content_analysis`, optional `fetches`, and latest URL analysis JSON.
- Analysis-status domain eligibility snapshots and confidence-backfill candidate/update contracts.
- Debug URL/page/export inspection snapshots used by `debug-query`, `debug-analyze-page`, and `check-export`.
- Place-extraction matcher, hierarchy, domain-locale, and place-hub detector planet-override reads used by active analysis runtime helpers.
- Unified app recent-download/search-section option reads and place-hub guessing UI/check mapping diagnostics.
- Place-hub utility listing/verification writes and hub-validation cached article reads.
- SQLite helper compatibility for bootstrap seeding, URL-id resolution, and root topic-term reads.
- Active check-only fixture setup and DB health probes.
- DB table-size diagnostic tooling and worker `dbstat` reads.
- Telemetry cleanup utility delete/compaction DB operations.
- Postgres container health checks, SQLite migration utility scripts, snapshot verification, gazetteer export iterators, maintenance wrappers, URL-classification samples, site-pattern listing, crawl-site threshold checks, benchmark probes, locale seeding, analytics download-history reads, unified-app dashboard counts, topic-hub cell samples, and remaining active DB smoke probes.

The migrated copilot files are compatibility wrappers or callers; focused scans show no `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, or common SQL statement patterns in those migrated slices.

## Current Evidence

Latest static inventory command:

```bash
rg -n "\.prepare\(|\.exec\(|\.pragma\(|sqlite_master|CREATE TABLE|INSERT INTO|SELECT\s|UPDATE\s|DELETE FROM|client\.query|pool\.query|require\('pg'\)" src/data/db src/core src/services src/ui scripts deploy checks tools --glob '!node_modules/**' --glob '!data/**' --glob '!docs/**' --glob '!**/__tests__/**' --glob '!**/*.test.js' --glob '!**/*.test.ts' --glob '!wip/**' --glob '!public/**' | wc -l
```

Result: `189` matches.

This count is intentionally broad. The remaining matches are now dominated by generated/schema artifacts, migration-only files, docs/examples, non-DB parser/query strings, and generated/static UI output.

Largest current match buckets:

- Generated/deploy/migration SQL artifacts: `deploy/scripts/init-db.sql`, SQLite v1 migration files, `src/data/db/migrations/*`, and the JS migration string `src/data/db/sqlite/v1/migrations/029_domain_crawl_behaviors.js`.
- Documentation/example text: `tools/corrections/README.md`, `deploy/README.md`, debug README content, and `src/data/db/AGENT.md`.
- Source-analysis/dev tooling false positives: JS/SVG/Markdown scanners, edit tools, docs bridge scripts, knowledge-graph tools, and test-hang/source-string utilities that inspect code/text rather than databases.
- Generated/static browser output: built client bundles and source maps under `src/ui/server/**/public`, plus demo/art playground bundles.
- Non-DB query strings and parser loops: SPARQL query builders in Wikidata/geography modules and `.exec` regex loops in sitemap/archive/hub-validator/remote-crawler parsing code.

Supplementary scan outside the broad active-path command should still be treated conservatively before deletion or relocation, but the latest active-path sweep no longer shows meaningful active copilot-owned DB operations outside migration/generated/docs/non-DB-string categories. Remaining migration artifacts should be moved or superseded by `news-crawler-db` migration packaging when that repo's migration distribution story is formalized.

## Remaining Work

Recommended priority order:

1. Move or retire remaining SQL migration/deploy artifacts (`deploy/scripts/init-db.sql`, `src/data/db/migrations/*`, SQLite v1 `.sql` migrations) once `news-crawler-db` has the agreed migration packaging/export/import workflow for both SQLite and Postgres.
2. Keep generated/static bundles, docs/examples, dev source scanners, SPARQL query builders, and regex parser loops classified as non-DB-boundary exceptions in scans.
3. As Postgres evolves, expose new parity behavior through named `news-crawler-db` APIs first; avoid reintroducing Postgres driver calls or SQLite-specific SQL into `copilot-dl-news`.

## Postgres Target State

Postgres is a first-class, work-in-progress backend. The goal is backend parity: callers should depend on explicit `news-crawler-db` APIs, not SQLite-specific or Postgres-specific runtime classes in `copilot-dl-news`. SQLite remains the local/default backend, Postgres remains the scalable/server backend, and the DB package should support both interchangeable access and deliberate side-by-side workflows for migration, export, import, comparison, and verification.

## Analysis Repo Boundary

`news-db-pure-analysis` should stay pure: no DB imports, no drivers, no filesystem assumptions. `news-db-analysis` should bridge `news-crawler-db` and `news-db-pure-analysis`: it loads read models through named DB APIs, calls pure analysis functions, then persists outputs through DB APIs where needed. `news-crawler-db` should not import either analysis repo.

## Definition Of Done

The migration is done when:

- Active runtime, UI, checks, and operational tools in `copilot-dl-news` do not prepare SQL, execute schema migrations, inspect `sqlite_master`, or define local DB schema/query contracts.
- All meaningful DB operations are exposed by well-named `news-crawler-db` APIs.
- Copilot compatibility files are thin delegators only.
- Remaining SQL matches are either inside generated/test-only/deprecated/migration-only files with explicit documentation, or are removed.
- Validation evidence is recorded with in-memory DB tests, `news-crawler-db` builds, `node --check` on changed copilot files, and focused static scans.

## Safety Rule

Do not run validation against `copilot-dl-news/data/news.db` for this migration. Use static analysis, syntax checks, TypeScript builds, and focused in-memory tests in `news-crawler-db`.
