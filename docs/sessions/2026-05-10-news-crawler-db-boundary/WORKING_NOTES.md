# Working Notes: News Crawler DB Boundary

## 2026-05-10

- User request: review copilot-dl-news and news-crawler-db; first make sure news-crawler-db is up to the task, then make copilot-dl-news use a reference to news-crawler-db instead of local direct DB/adapter access.
- Boundary rule: news-crawler-db owns schema, migrations, CRUD, and API contracts; copilot-dl-news should consume those contracts.
- Safety rule: no casual direct writes to production database files during readiness checks or migration validation.

## Boundary Migration Evidence

- news-crawler-db readiness: added readonly/fileMustExist config support, better-sqlite3 compatibility methods on DbAdapter, open-state compatibility, lazy default adapter exports, and package root pointing at DB exports.
- copilot-dl-news central DB boundary: src/data/db/sqlite/v1/connection.js no longer requires better-sqlite3 directly; it creates handles through news-crawler-db createDbAdapter. The default sqlite registry now returns createNewsCrawlerDbCompat(), and facade instances expose usesNewsCrawlerDb=true.
- copilot-dl-news active runtime sweep: added src/db/openNewsCrawlerDb.js as a tracked opener and migrated active src runtime direct opens in queue, API routes, background task, place lookup, crawler sequence context, crawl daemon, crawl server, UI servers, Electron handlers, geo import, place hub guessing, src/tools/import-gazetteer, and active gazetteer/introspection helpers.
- Legacy schema compatibility: seeded compression_types in the schema fallback path so existing article insertion paths keep accepting brotli_6.
- Focused validation passed:
	- news-crawler-db: npm run build.
	- news-crawler-db: npx vitest run src/db/__tests__/integration/sqlite.integration.test.ts src/db/__tests__/unit/sqlite/repositories/urls.test.ts src/db/__tests__/unit/sqlite/repositories/websites.test.ts => 3 files, 15 tests passed.
	- copilot-dl-news: npm run test:by-path -- src/__tests__/db.adapters.test.js src/__tests__/db.latest_fetch.test.js src/__tests__/db.stream.test.js => 3 suites, 4 tests passed.
	- copilot-dl-news: node --check passed for touched runtime files.
	- copilot-dl-news: active src runtime direct better-sqlite3/new Database count is 0 when excluding __tests__, checks, and deprecated-ui.
- Remaining inventory: direct better-sqlite3 openings remain in tests, checks, deprecated UI, and many top-level tools. The active src runtime path is migrated; follow-up should decide whether test/check/tool direct opens should use a shared test helper or be documented as allowed operational scripts until moved into news-crawler-db.
- Repository hygiene note: copilot-dl-news .gitignore has a broad data/ rule that ignores src/data/**, so local facade edits under src/data/db are currently untracked by git. To commit this migration cleanly, the repo needs a narrow unignore rule or a source move out of an ignored path.
- Git ignore correction: changed the broad data/ rule to root-anchored /data/ and added explicit database artifact patterns (*.db, WAL/SHM/journal, sqlite/sqlite3 variants). Verification: data/news.db, data/news.db-wal, data/hub-test.db-journal, and data/exports/example.json remain ignored; src/data/db/index.js and src/data/db/sqlite/v1/connection.js are not ignored.

## 2026-05-11 Continuation: Migration, Compression, Backup, And Side-By-Side DB Boundaries

- Clarified the previously summarized remaining clusters:
	- Migration/import/validator modules: reusable migration primitives (`DatabaseImporter`, `DataValidator`, `SchemaVersionManager`) that create/read schema migration tables, import NDJSON rows, reset target tables, validate row counts, run integrity checks, and are used by migration CLI/orchestrator paths.
	- Compression tooling: operational tools that inspect and update `content_storage` rows, query compression types, sample article content for benchmarks, and summarize current compression settings.
	- `test-migration-schema`: a URL-normalization migration smoke harness that creates a temporary schema, applies URL-id columns/indexes, and validates foreign-key-safe table reads.
	- Backup/fix utility scripts: `backup-place-hubs` extracts table DDL and copies place-hub reference tables; `fix-article-place-relations` rebuilds a table to correct a foreign key.
	- `DualDatabaseFacade`: side-by-side SQLite/Postgres adapter orchestration for dual-write/export workflows; it enumerates tables, pages source rows, and inserts batches into the secondary DB.
	- Smaller active/dev utilities: remaining operational checks and tools such as `crawl-remote`, topic/skip-term seeders, URL-classification export, place-hub discovery, clone/export/debug utilities, and search checks.
- Added DB-owned APIs in `news-crawler-db`:
	- URL-normalization smoke helpers: `createUrlNormalizationMigrationTestBaseSchema` and `runUrlNormalizationMigrationSchemaSmoke`.
	- Article-place relation repair helpers: `getArticlePlaceRelationsSchemaSql`, `getArticlePlaceRelationsRowCount`, and `fixArticlePlaceRelationsForeignKey`.
	- Place-hub backup helpers: `PLACE_HUB_BACKUP_TABLES`, `getPlaceHubBackupTableSchemas`, `createPlaceHubBackupSchema`, `copyPlaceHubBackupDataFromSource`, and `backupPlaceHubTables`.
	- Compression tooling helpers: `getContentStorageCompressionBackfillPlan`, `processContentStorageCompressionBackfillItem`, benchmark article/snapshot/current-settings readers, and supporting compression-type/content-storage update helpers.
	- Migration primitives: `DatabaseImporter`, `DataValidator`, and `SchemaVersionManager`.
	- Side-by-side DB facade: `DualDatabaseFacade`, `createDualDatabase`, `loadConfigFromEnv`, and `MODES`/`DUAL_DATABASE_MODES`.
	- Search-service diagnostics: `getSqliteArticleSearchCheckSnapshot` and `getSqliteArticleSearchSampleBodyText`.
- Migrated these copilot files to no-SQL wrappers/callers:
	- `tools/migrations/test-migration-schema.js`
	- `tools/dev/backup-place-hubs.js`
	- `tools/corrections/fix-article-place-relations.js`
	- `tools/compression/backfill-compression.js`
	- `tools/compression/compression-benchmark.cjs`
	- `src/data/db/migration/importer.js`
	- `src/data/db/migration/validator.js`
	- `src/data/db/migration/schema-versions.js`
	- `src/data/db/DualDatabaseFacade.js`
	- `checks/search-service.check.js`
- Added focused `news-crawler-db` tests:
	- `src/db/__tests__/unit/sqlite/legacyMigrationMaintenanceUtilities.test.ts`
	- `src/db/__tests__/unit/sqlite/legacyCompressionTooling.test.ts`
	- `src/db/__tests__/unit/sqlite/legacyDataMigration.test.ts`
	- `src/db/__tests__/unit/sqlite/dualDatabaseFacade.test.ts`
	- Extended `src/db/__tests__/unit/sqlite/articleSearchAdapter.test.ts`.
- Validation evidence:
	- `npx vitest run src/db/__tests__/unit/sqlite/legacyMigrationMaintenanceUtilities.test.ts src/db/__tests__/unit/sqlite/legacyCompressionTooling.test.ts src/db/__tests__/unit/sqlite/legacyDataMigration.test.ts src/db/__tests__/unit/sqlite/dualDatabaseFacade.test.ts` passed, 4 files / 10 tests.
	- `npx vitest run src/db/__tests__/unit/sqlite/articleSearchAdapter.test.ts` passed, 1 file / 3 tests.
	- `npm run build` passed in `news-crawler-db`.
	- `node --check` passed for all changed copilot wrapper/tool/check files listed above.
	- Focused scan of those changed copilot files for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, `information_schema`, and common SQL statement patterns returned no matches.
	- Help/safe smoke checks: `node tools/dev/backup-place-hubs.js --help`, `node tools/compression/backfill-compression.js --help`, and `node tools/compression/compression-benchmark.cjs --help` passed without opening the production DB.
	- Temporary-DB smoke: `node tools/migrations/test-migration-schema.js` passed and removed `test-migration.db`.
	- Latest broad active-path scan count is `784`, down from `898`.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; DB behavior was tested in memory/temp files in `news-crawler-db`, plus syntax/static scans and safe help/temp-DB commands in `copilot-dl-news`.
- Remaining highest active buckets after this pass: `tools/crawl/crawl-remote.js`, `tools/migrations/seed-topics-and-skip-terms.js`, `tools/dev/url-classifications-export.js`, `tools/dev/place-hub-discover.js`, `tools/dev/db-clone-gazetteer.js`, `tools/experiments/intelligent-crawl.js`, `tools/debug/check_duplicates.js`, `src/ui/server/templateTeacher/server.js`, and `src/data/db/sqlite/v1/tools/maintainDb.js`. Generated SQL files, test helpers, deprecated UI, and SQL fixture files still need explicit classification rather than blind migration.

## 2026-05-11 Continuation: Active Tool Runtime Cluster

- Migrated the previous highest-priority active tool cluster into `news-crawler-db` without running any tool against `data/news.db`.
- Added DB-owned APIs in `news-crawler-db`:
	- Topic/skip seed tooling: `countTopicKeywords`, `deleteTopicKeywordsBySource`, `listTopicKeywordBreakdownBySource`, `countCrawlSkipTerms`, `deleteCrawlSkipTermsBySource`, and `listCrawlSkipTermBreakdownBySource`.
	- URL classification export readers: `getUrlClassificationExportStats` and `listUrlClassificationExportRows`.
	- Remote crawl local sync verification: `configureRemoteCrawlLocalSyncDb`, `findLocalRemoteCrawlResponseId`, and `verifyRemoteCrawlBatchPersisted`.
	- Remote crawl v2 local ingest: `ingestRemoteCrawlV2Batch` and `getRemoteCrawlSyncLocalResponseId`.
	- Place-hub discovery tooling: candidate slug extraction, place-name matching reads, preferred-name reads, existing-mapping partitioning, and pending mapping inserts.
	- Gazetteer clone utility: `GAZETTEER_CLONE_DEFAULT_TABLES` and `cloneGazetteerTablesToSqliteDb`.
	- Intelligent crawl experiment setup: `INTELLIGENT_CRAWL_EXPERIMENT_SEED_TABLES`, `createIntelligentCrawlExperimentDb`, `listIntelligentCrawlExperimentSites`, and start-site limiting.
- Migrated these copilot files to no-SQL callers/wrappers:
	- `tools/migrations/seed-topics-and-skip-terms.js`
	- `tools/dev/url-classifications-export.js`
	- `tools/crawl/crawl-remote.js`
	- `tools/crawl/lib/sync-ingest.js`
	- `tools/dev/place-hub-discover.js`
	- `tools/dev/db-clone-gazetteer.js`
	- `tools/experiments/intelligent-crawl.js`
- Added focused `news-crawler-db` tests:
	- `src/db/__tests__/unit/sqlite/legacyTopicSkipSeedTooling.test.ts`
	- `src/db/__tests__/unit/sqlite/legacyUrlClassificationExport.test.ts`
	- `src/db/__tests__/unit/sqlite/legacyRemoteCrawlSyncVerification.test.ts`
	- `src/db/__tests__/unit/sqlite/legacyRemoteCrawlSyncIngest.test.ts`
	- `src/db/__tests__/unit/sqlite/legacyPlaceHubDiscoverTool.test.ts`
	- `src/db/__tests__/unit/sqlite/legacyGazetteerClone.test.ts`
	- `src/db/__tests__/unit/sqlite/legacyIntelligentCrawlExperiment.test.ts`
- Validation evidence:
	- `npx vitest run src/db/__tests__/unit/sqlite/legacyTopicSkipSeedTooling.test.ts src/db/__tests__/unit/sqlite/legacyUrlClassificationExport.test.ts src/db/__tests__/unit/sqlite/legacyRemoteCrawlSyncVerification.test.ts src/db/__tests__/unit/sqlite/legacyRemoteCrawlSyncIngest.test.ts src/db/__tests__/unit/sqlite/legacyPlaceHubDiscoverTool.test.ts src/db/__tests__/unit/sqlite/legacyGazetteerClone.test.ts src/db/__tests__/unit/sqlite/legacyIntelligentCrawlExperiment.test.ts` passed, 7 files / 19 tests.
	- `npm run build` passed in `news-crawler-db`.
	- `node --check` passed for all seven changed copilot files listed above.
	- Focused scan of those seven copilot files for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, `CREATE TABLE`, `INSERT INTO`, `SELECT`, `UPDATE`, `DELETE FROM`, `ensureDb`, and `ensureDatabase` returned no matches.
	- Latest broad active-path scan count is `716`, down from `784`.
- Safety evidence: no live production DB checks were executed; DB behavior was validated with in-memory and temporary SQLite databases in `news-crawler-db`, plus syntax/static checks in `copilot-dl-news`.
- Remaining highest active buckets after this pass: `tools/debug/check_duplicates.js`, `src/ui/server/templateTeacher/server.js`, `src/data/db/sqlite/v1/tools/maintainDb.js`, migration scripts such as `add-place-exclusions` and `add-http-caching-fields`, `src/ui/server/visualDiff/server.js`, schema metadata/redaction tools, active checks such as `place-hub-pattern-learning` and `analytics-dashboard`, and smaller maintenance/gazetteer/compression/debug utilities. Generated SQL files, migration-only scripts, test fixtures/check-only in-memory setup, deprecated UI, and WIP material still need explicit classification.

## 2026-05-11 Continuation: Diagnostics, Template Teacher, Pattern Fixtures, And Small Migrations

- Migrated the next active smaller clusters into `news-crawler-db` named APIs without running anything against `data/news.db`.
- Added DB-owned APIs in `news-crawler-db`:
	- Content-storage duplicate diagnostics: URL duplicate response rows, storage coverage, successful responses without storage, content-storage foreign keys, duplicate content-storage response references, and the bundled `getContentStorageDuplicateDiagnostics`.
	- MaintainDb place-name cleanup helpers: place/name counts, missing normalized-name updates, name trimming, empty-name deletion, and nameless-place deletion.
	- Template-teacher layout-template readers/writers: recent host summaries, template listings, template-by-id lookup, and taught signature creation.
	- Place-hub pattern-learning check fixture creation for in-memory `urls`, `place_hubs`, `place_hub_candidates`, and `place_page_mappings`.
	- Small schema migrations: `place_exclusions` schema/seed/sample migration and HTTP cache field/index migration/validation.
- Migrated these copilot files to no-SQL callers/wrappers:
	- `tools/debug/check_duplicates.js`
	- `src/data/db/sqlite/v1/tools/maintainDb.js`
	- `src/ui/server/templateTeacher/server.js`
	- `checks/place-hub-pattern-learning.check.js`
	- `tools/migrations/add-place-exclusions.js`
	- `tools/migrations/add-http-caching-fields.js`
- Added or extended focused `news-crawler-db` tests:
	- `src/db/__tests__/unit/sqlite/legacyContentStorageDiagnostics.test.ts`
	- `src/db/__tests__/unit/sqlite/legacyMaintainDbTool.test.ts`
	- `src/db/__tests__/unit/sqlite/legacySmallSchemaMigrations.test.ts`
	- Extended `src/db/__tests__/unit/sqlite/legacyLayoutAndUiQueries.test.ts`
	- Extended `src/db/__tests__/unit/sqlite/legacyCheckFixtures.test.ts`
- Validation evidence:
	- `npx vitest run src/db/__tests__/unit/sqlite/legacyContentStorageDiagnostics.test.ts src/db/__tests__/unit/sqlite/legacyMaintainDbTool.test.ts src/db/__tests__/unit/sqlite/legacyLayoutAndUiQueries.test.ts src/db/__tests__/unit/sqlite/legacyCheckFixtures.test.ts src/db/__tests__/unit/sqlite/legacySmallSchemaMigrations.test.ts` passed, 5 files / 17 tests. The known legacy news-source bootstrap warning still appears from copied seeder compatibility code.
	- `npm run build` passed in `news-crawler-db`.
	- news-crawler-db/copilot smoke: `require('news-crawler-db')` exposes `getContentStorageDuplicateDiagnostics`, `countMaintainDbPlaces`, `listTemplateTeacherRecentHostSummaries`, `createPlaceHubPatternLearningCheckFixture`, `runPlaceExclusionsMigration`, and `applyHttpCachingSchemaMigration` as functions after build.
	- `node --check` passed for all six changed copilot files listed above.
	- Focused scan of those six changed copilot files for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, `CREATE TABLE`, `INSERT INTO`, `SELECT`, `UPDATE`, `DELETE FROM`, `ensureDb`, `ensureDatabase`, `openDatabase`, `client.query`, `pool.query`, and `require('pg')` returned no matches.
	- Latest broad active-path scan count is `665`, down from `716`.
- Safety evidence: no live production DB checks were executed; DB behavior was validated with in-memory SQLite tests in `news-crawler-db`, plus syntax/static checks in `copilot-dl-news`.
- Remaining highest active buckets after this pass: `src/data/db/sqlite/v1/schemaMetadata.js`, `scripts/db/redact-export.js`, `src/ui/server/visualDiff/server.js`, `checks/analytics-dashboard.check.js`, `deploy/scripts/init-db.sql`, `tools/compression/migrate-legacy-content.js`, `tools/checks/check-doc-counts.js`, `tools/maintenance/analysis-maintenance-cycle.js`, `tools/gazetteer/normalize-country-names.js`, `tools/schema/schema-sync-postgres.js`, `tools/compression/compress-uncompressed-records.js`, `tools/debug/analyze_failures.js`, and smaller migration/maintenance/schema utility clusters. Generated SQL files, migration-only scripts, test fixtures/check-only in-memory setup, deprecated UI, and WIP material still need explicit classification.

## 2026-05-10 Continuation: Tooling And SQL Boundary

- Broad direct-constructor sweep: migrated checks, deploy scripts, docs/session scripts, top-level scripts/tools, tests, deprecated UI, and WIP labs away from direct `better-sqlite3` imports/constructors. Current JS search scoped to copilot-dl-news reports zero direct `require('better-sqlite3')`, `new Database(...)`, or inline `new (require('better-sqlite3'))(...)` matches. The only workspace JS match is sibling `dl-news/db_sqlite.js`, outside this repo.
- Dependency cleanup: removed `better-sqlite3` as a direct copilot-dl-news dependency and refreshed `package-lock.json` with `npm install --package-lock-only --ignore-scripts`. Remaining root lockfile references are under the `../news-crawler-db` file dependency, which is the owning DB package. WIP standalone package manifests now reference `news-crawler-db` instead of `better-sqlite3`.
- news-crawler-db fix: optional SQLite `timeout` is no longer forwarded as `undefined` to `better-sqlite3`; focused copilot DB tests exposed this and the fix lives in `news-crawler-db/src/db/sqlite/connection.ts`.
- First direct-SQL migration batch: added DB-owned `maintenance` access in `news-crawler-db` for health checks, table listing, table info, table counts, and integrity checks. Migrated `deploy/scripts/health-check.js`, `tools/checks/check-schema.js`, `tools/checks/verify-db.js`, `tools/checks/check-nw-schema.js`, and `tools/maintenance/check-tables.js` to use `db.maintenance.*` instead of local `prepare`/`exec` SQL.
- Validation evidence:
	- news-crawler-db: `npm run build` passed after timeout and maintenance changes.
	- copilot-dl-news: `node --check` passed for 202 files containing `openNewsCrawlerDb`.
	- copilot-dl-news: `node --check deploy/scripts/health-check.js tools/checks/check-schema.js tools/checks/verify-db.js tools/checks/check-nw-schema.js tools/maintenance/check-tables.js` passed.
	- copilot-dl-news: `npm run test:by-path -- src/__tests__/db.adapters.test.js src/__tests__/db.latest_fetch.test.js src/__tests__/db.stream.test.js` passed, 3 suites / 4 tests.
	- copilot-dl-news: smoke-tested `openNewsCrawlerDb(':memory:').maintenance.checkHealth()` from the consumer repo; returned `health=1`.
- Remaining direct SQL inventory after the first batch: approximately 2,938 direct `prepare`/`exec` call sites across 534 JS files when excluding generated bundles/public assets. Largest clusters are `src/data/db/sqlite/v1/SQLiteNewsDatabase.js`, `src/data/db/sqlite/v1/queries/*`, `deploy/remote-crawler-v2/multi-domain-server.js`, `src/data/db/CoverageDatabase.js`, `src/data/db/PlannerDatabase.js`, `src/data/db/QueueDatabase.js`, and legacy/WIP tools. Next migration should move named query contracts into `news-crawler-db` access modules, then leave copilot-side shims only as delegators during transition.

## 2026-05-10 Continuation: DB-Owned URL Listing Access

- Added `SqliteUrlListingAccess` in `news-crawler-db/src/db/sqlite/access/urlListing.ts` and exposed it as `db.urlListing` plus `createSqliteUrlListingAccess` from the DB package root. This moves the URL table/data-explorer SQL out of copilot-local query code.
- Replaced `copilot-dl-news/src/data/db/sqlite/v1/queries/ui/urlListingNormalized.js` with a compatibility shim that preserves the existing synchronous function API (`selectInitialUrls`, `selectUrlPage`, filtered counts, host parsing) while delegating implementation to `news-crawler-db`.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/urlListing.test.ts` passed, 1 file / 2 tests.
	- news-crawler-db: `npm run build` passed.
	- copilot-dl-news: `npm run test:by-path -- tests/db/sqlite/ui/urlListingNormalized.contract.test.js` passed, 1 suite / 4 tests.
	- Diagnostics are clean on `news-crawler-db/src/db/sqlite/access/urlListing.ts`, `news-crawler-db/src/db/__tests__/unit/sqlite/urlListing.test.ts`, and the copilot compatibility shim.
- Remaining direct SQL inventory after URL listing migration: approximately 2,914 direct `prepare`/`exec` call sites across 533 JS files when excluding generated bundles/public assets. The next highest-value candidates are `workspaceAdapter`, `alertAdapter`, `topicAdapter`, `userAdapter`, `gazetteer.deduplication`, `GazetteerDatabase`, and the remote crawler v2 data-export/worker queries.

## 2026-05-10 Continuation: DB-Owned Task Events Access

- Added `SqliteTaskEventsAccess` in `news-crawler-db/src/db/sqlite/access/taskEvents.ts` and exposed it as `db.taskEvents` plus `createSqliteTaskEventsAccess` from the DB package root. This moves `task_events` table creation, indexing, insert, prune, stats, and query helpers out of copilot code.
- Converted `copilot-dl-news/src/data/db/TaskEventWriter.js` to preserve event metadata, buffering, sequence-cache, and emitter behavior while delegating every DB operation to `news-crawler-db`. The file now has no `.prepare(` / `.exec(` / SQL string matches.
- Added `copilot-dl-news/src/db/TaskEventWriter.js` as a no-SQL compatibility alias for existing checks and tools that require the older path.
- Added explicitly named task-events tooling methods on `db.taskEvents`, including `taskEventsTableExists`, `listTaskEventIndexNames`, `listTaskEventTaskSummaries`, `getTaskEventsForTask`, `getTaskEventSummary`, `getTaskEventProblems`, `getTaskEventLifecycleTimeline`, `searchTaskEvents`, `getTaskEventStorageStatistics`, `previewPruneTaskEventsOlderThan`, and `pruneTaskEventsOlderThan`.
- Migrated `copilot-dl-news/tools/dev/task-events.js` and `copilot-dl-news/scripts/apply-task-events-migration.js` to those explicit DB-owned methods. Both files now have no `.prepare(` / `.exec(` / `task_events` SQL patterns.
- Migrated task-event telemetry checks to the same access surface: `checks/task-event-writer.check.js`, `checks/telemetry-integration.check.js`, and `checks/telemetry-chain.check.js` no longer contain direct `task_events` SQL. Also corrected stale telemetry import paths in `checks/telemetry-integration.check.js`, `checks/telemetry-chain.check.js`, and `checks/telemetry-integration-db.check.js` to current `src/core/crawler/...` locations so the checks run.
- Added explicit crawl telemetry dashboard methods on `db.taskEvents`: `getRecentCrawlTelemetrySummary`, `getHourlyCrawlTelemetryStats`, `getTaskEventErrorBreakdown`, and `getCrawlDomainTelemetryStats`. Migrated `checks/crawl-telemetry-dashboard.check.js` to those DB-owned methods and fixed its shutdown path so the HTTP server closes before process exit.
- Added explicit crawl-live task event readers on `db.taskEvents`: `getLatestCrawlTelemetryTask`, `getTaskEventTaskInfo`, `getLatestTaskEventPayload`, `getTaskEventPayloadHistory`, and `countTaskEventErrors`. Migrated `tools/dev/crawl-live.js` and `tools/dev/crawl-watch.js` to DB-owned methods; both now have no direct `task_events` SQL patterns.
- Added `db.taskEvents.listSchedulerReconcileRuns` for scheduler reconcile dashboard data and migrated `src/ui/server/schedulerDashboard/server.js` to use it plus `getTaskEventsForTask` for run details.
- Added unified-app task event readers on `db.taskEvents`: `getFirstTaskEventPayload`, `getLatestTaskEventType`, `getLatestStartedCrawlTaskSince`, and `listRecentCrawlTaskRuns`. Migrated `src/ui/server/unifiedApp/server.js` and `src/ui/server/unifiedApp/subApps/registry.js` away from embedded `task_events` SQL.
- Added `db.taskEvents.listTaskEventNonInfoEvents` for the distributed crawl speedometer error feed. Migrated `wip/labs/distributed-crawl/speedometer-app.js` and `debug-speedometer.js` to DB-owned access methods.
- Added `db.remoteCrawler` in `news-crawler-db` for remote crawler v2 schema/runtime setup, worker writes, export pruning, export/replay reads, manifest/sync pull reads, content inspection, logs/errors, reset-table admin, and debug link snapshots. Migrated `deploy/remote-crawler-v2/lib/schema.js`, `lib/run-worker.js`, `lib/export-retention.js`, and `multi-domain-server.js` to the named DB APIs.
- Added `createSqliteArticleSearchAdapter` in `news-crawler-db` for legacy synchronous FTS article search consumers. Migrated `copilot-dl-news/src/data/db/sqlite/v1/queries/searchAdapter.js` into a compatibility wrapper exporting the historical names while delegating SQL ownership to `news-crawler-db`.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/taskEvents.test.ts src/db/__tests__/unit/sqlite/urlListing.test.ts` passed, 2 files / 3 tests.
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/taskEvents.test.ts` passed after adding explicit-method coverage, 1 file / 2 tests.
	- news-crawler-db: `npm run build` passed.
	- copilot-dl-news: `node checks/task-event-writer.check.js` passed all check steps.
	- copilot-dl-news: `node --check tools/dev/task-events.js` and `node --check scripts/apply-task-events-migration.js` passed; `node tools/dev/task-events.js --help` displayed successfully.
	- copilot-dl-news: `node checks/telemetry-chain.check.js`, `node checks/telemetry-integration.check.js`, and `node checks/telemetry-integration-db.check.js` passed after delegation/import updates.
	- copilot-dl-news: `node checks/crawl-telemetry-dashboard.check.js` passed all 18 checks; the file now has no direct `.prepare(` / `.exec(` / `task_events` SQL patterns.
	- copilot-dl-news: `node --check tools/dev/crawl-live.js`, `node tools/dev/crawl-live.js --help`, and `node --check tools/dev/crawl-watch.js` passed. `tools/dev/crawl-live.js` and `tools/dev/crawl-watch.js` now only mention `task_events` in help/comments.
	- copilot-dl-news: `node --check src/ui/server/schedulerDashboard/server.js` passed. Direct `.prepare(` / `FROM task_events` patterns are gone from that file.
	- copilot-dl-news: `node --check src/ui/server/unifiedApp/server.js` and `node --check src/ui/server/unifiedApp/subApps/registry.js` passed. Direct `FROM task_events` patterns are gone from the unified app server subtree.
	- copilot-dl-news: `node --check wip/labs/distributed-crawl/speedometer-app.js` and `node --check wip/labs/distributed-crawl/debug-speedometer.js` passed. A final JS inventory found no remaining active `task_events` SQL, only comments/help text references in crawl observer/crawl-live.
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/remoteCrawler.test.ts` passed 5 in-memory tests; `npm run build` passed.
	- copilot-dl-news: `node --check deploy/remote-crawler-v2/lib/schema.js`, `lib/run-worker.js`, `lib/export-retention.js`, and `multi-domain-server.js` passed. A focused scan found no remaining direct SQL/pragma patterns in `deploy/remote-crawler-v2`, only non-DB text matches such as `errors` fields and PM2 `execSync`.
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/articleSearchAdapter.test.ts` passed 2 in-memory FTS tests; `npm run build` passed.
	- copilot-dl-news: `node --check src/data/db/sqlite/v1/queries/searchAdapter.js`, `src/search/SearchService.js`, and `src/api/v1/routes/articles.js` passed. A focused scan of the compatibility wrapper found no direct SQL patterns.
	- Diagnostics are clean on `news-crawler-db/src/db/sqlite/access/taskEvents.ts`, `news-crawler-db/src/db/__tests__/unit/sqlite/taskEvents.test.ts`, `copilot-dl-news/src/data/db/TaskEventWriter.js`, and the compatibility alias.

## 2026-05-10 Continuation: Guardian And Place-Hub Diagnostics Boundary

- Added `db.placeHubDiagnostics` in `news-crawler-db` via `src/db/sqlite/access/placeHubDiagnostics.ts`, exported from the package root and attached to the SQLite adapter. The access surface owns Guardian/place-hub diagnostic reads including exact-host URL counts, path/slug extraction, short/root/regional URL listings, hub-related table discovery, mapping summaries, recent determinations/runs, mapping/name joins, and unmapped country checks.
- Added focused in-memory coverage in `news-crawler-db/src/db/__tests__/unit/sqlite/placeHubDiagnostics.test.ts` for URL slug extraction, exact-host behavior, candidate URL listings, hub status reads, mapping joins, and unmapped country detection.
- Migrated these active copilot checks to `db.placeHubDiagnostics`: `checks/guardian-urls.check.js`, `checks/debug-slug-extraction.check.js`, `checks/debug-discover-query.check.js`, `checks/guardian-hub-status.check.js`, and `checks/guardian-mappings.check.js`. The files now keep only console formatting and static Guardian heuristic lists; DB SQL lives in `news-crawler-db`.
- Validation evidence:
	- news-crawler-db: initial Vitest run was blocked by missing Rollup optional native package; installed `@rollup/rollup-linux-x64-gnu` with `--no-save`. A second run exposed a Windows `better-sqlite3` binary in `node_modules`; `npm rebuild better-sqlite3 --build-from-source` fixed the local test environment.
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/placeHubDiagnostics.test.ts` passed, 1 file / 4 tests.
	- news-crawler-db: `npm run build` passed.
	- copilot-dl-news: `node --check` passed for `checks/guardian-urls.check.js`, `checks/debug-slug-extraction.check.js`, `checks/debug-discover-query.check.js`, `checks/guardian-hub-status.check.js`, and `checks/guardian-mappings.check.js`.
	- copilot-dl-news: focused scan of those five files for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, and common SQL statement patterns returned no matches.
- Safety evidence: did not execute the migrated copilot checks against `data/news.db`; validation used syntax checks and in-memory DB tests only.
- Remaining exceptions remain staged: generated assets, deprecated UI, tests/fixtures, WIP labs, and larger legacy adapter modules still contain direct SQL and should be migrated or classified in later slices rather than mixed into this diagnostic-check pass.

## 2026-05-10 Continuation: User Adapter Boundary

- Added a DB-owned user access surface in `news-crawler-db/src/db/sqlite/access/userAdapter.ts`, with explicit exports for `createSqliteUserAdapter`, `ensureSqliteUserSchema`, password hashing/verification, and session-token generation. It owns the legacy user schema, sessions, user events, preferences, and personalized feed helper joins.
- Exposed the user adapter from the package root and added a lazy `db.userAdapter` getter on the SQLite adapter. The getter avoids creating user tables during ordinary DB opens unless the user surface is actually accessed.
- Replaced `copilot-dl-news/src/data/db/sqlite/v1/queries/userAdapter.js` with a compatibility wrapper that preserves historical CommonJS names (`createUserAdapter`, `ensureUserSchema`, `hashPassword`, `verifyPassword`, `generateSessionToken`) and delegates to `news-crawler-db`.
- Added focused in-memory coverage in `news-crawler-db/src/db/__tests__/unit/sqlite/userAdapter.test.ts` for password/session helpers, user CRUD/authentication, sessions, events, article metadata joins, preferences, feed helpers, and aggregate stats.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/userAdapter.test.ts` passed, 1 file / 4 tests.
	- news-crawler-db: `npm run build` passed.
	- copilot-dl-news: `node --check src/data/db/sqlite/v1/queries/userAdapter.js` passed.
	- copilot-dl-news: `node -e "const u=require('./src/data/db/sqlite/v1/queries/userAdapter.js'); console.log(typeof u.createUserAdapter, typeof u.hashPassword)"` returned `function function`.
	- copilot-dl-news: focused scan of `src/data/db/sqlite/v1/queries/userAdapter.js` for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, and common SQL statement patterns returned no matches.
- Safety evidence: did not execute user tooling against `data/news.db`; validation used the DB package build, syntax check, static scan, and in-memory DB tests only.
- Remaining classified exceptions: larger legacy DB modules such as `SQLiteNewsDatabase.js`, `workspaceAdapter.js`, `alertAdapter.js`, `topicAdapter.js`, gazetteer ingestion/deduplication, `CoverageDatabase`, `PlannerDatabase`, `QueueDatabase`, and WIP/deprecated/test-only scripts still contain direct SQL and remain candidates for later slices.

## 2026-05-10 Continuation: Topic, Alert, And Workspace Adapter Boundaries

- Added DB-owned legacy adapter access surfaces in `news-crawler-db`:
	- `src/db/sqlite/access/topicAdapter.ts` for topics, article-topic assignments, story clusters, and topic trends.
	- `src/db/sqlite/access/alertAdapter.ts` for alert rules, alert history, user notifications, and breaking-news rows.
	- `src/db/sqlite/access/workspaceAdapter.ts` for workspaces, members, shared feeds, annotations, activity, constants, and slug generation.
- Exposed these APIs from the package root and as lazy SQLite adapter properties: `db.topicAdapter`, `db.alertAdapter`, and `db.workspaceAdapter`. The lazy getters avoid creating optional legacy tables unless the corresponding access surface is actually requested.
- Replaced the copilot legacy adapter files with compatibility wrappers that preserve historical CommonJS exports while delegating implementation to `news-crawler-db`:
	- `src/data/db/sqlite/v1/queries/topicAdapter.js`
	- `src/data/db/sqlite/v1/queries/alertAdapter.js`
	- `src/data/db/sqlite/v1/queries/workspaceAdapter.js`
- Added focused in-memory coverage in `news-crawler-db`:
	- `src/db/__tests__/unit/sqlite/topicAdapter.test.ts`
	- `src/db/__tests__/unit/sqlite/alertAdapter.test.ts`
	- `src/db/__tests__/unit/sqlite/workspaceAdapter.test.ts`
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/topicAdapter.test.ts` passed, 1 file / 4 tests.
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/alertAdapter.test.ts` passed, 1 file / 4 tests.
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/workspaceAdapter.test.ts` passed, 1 file / 4 tests.
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/topicAdapter.test.ts src/db/__tests__/unit/sqlite/alertAdapter.test.ts src/db/__tests__/unit/sqlite/workspaceAdapter.test.ts` passed, 3 files / 12 tests.
	- news-crawler-db: `npm run build` passed after all three adapter migrations.
	- copilot-dl-news: `node --check src/data/db/sqlite/v1/queries/topicAdapter.js && node --check src/data/db/sqlite/v1/queries/alertAdapter.js && node --check src/data/db/sqlite/v1/queries/workspaceAdapter.js` passed.
	- copilot-dl-news: wrapper require smoke returned `function function admin function function` for workspace factory, slug generator, role constant, topic factory, and alert factory.
	- copilot-dl-news: focused scan of the three migrated wrappers for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, and common SQL statement patterns returned no matches.
- Safety evidence: did not execute these adapters against `data/news.db`; validation used DB package in-memory tests, package build, copilot syntax checks, static scans, and require-only wrapper smoke checks.
- Remaining classified legacy clusters after this pass: `SQLiteNewsDatabase.js`, `CoverageDatabase.js`, `PlannerDatabase.js`, and `QueueDatabase.js` still account for 253 focused direct SQL/schema matches. Gazetteer ingestion/deduplication and larger WIP/deprecated/test-only scripts also remain staged for later slices.

## 2026-05-10 Continuation: Enhanced Queue, Planner, Coverage, And Crawl Helper Boundaries

- Moved the class-style DB clusters into `news-crawler-db` and exported them from the package root:
	- `src/db/sqlite/access/queueDatabase.ts` exports `QueueDatabase`.
	- `src/db/sqlite/access/plannerDatabase.ts` exports `PlannerDatabase`.
	- `src/db/sqlite/access/coverageDatabase.ts` exports deprecated-compatible `CoverageDatabase`.
	- `src/db/sqlite/access/crawlCompat.ts` exports `createSqliteCrawl`, `createSqliteCrawlType`, `getSqliteCrawl`, and `getSqliteCrawlLogs`.
- Replaced these copilot files with compatibility wrappers that contain no SQL and preserve historical CommonJS exports:
	- `src/data/db/QueueDatabase.js`
	- `src/data/db/PlannerDatabase.js`
	- `src/data/db/CoverageDatabase.js`
	- `src/data/db/sqlite/v1/access.js`
- Added focused in-memory DB coverage in `news-crawler-db/src/db/__tests__/unit/sqlite/legacyEnhancedDatabases.test.ts` for enhanced queue events, problem clusters, gap predictions, WAL recovery, planner patterns, hub validations, reuse stats, cross-crawl knowledge, coverage snapshots, hub discoveries, gaps, milestones, metrics, and analytics.
- Added focused in-memory DB coverage in `news-crawler-db/src/db/__tests__/unit/sqlite/crawlCompat.test.ts` for crawl type/job creation and queue-event log reads.
- While moving coverage ownership, tests exposed and fixed two legacy DB bugs in the DB package:
	- `recordHubDiscovery` now stores boolean `gapFilled` as a SQLite-bindable integer.
	- `resolveGap` now uses the named `@id` parameter that its caller supplies.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyEnhancedDatabases.test.ts` passed, 1 file / 3 tests.
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/crawlCompat.test.ts src/db/__tests__/unit/sqlite/legacyEnhancedDatabases.test.ts` passed, 2 files / 4 tests.
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyEnhancedDatabases.test.ts src/db/__tests__/unit/sqlite/topicAdapter.test.ts src/db/__tests__/unit/sqlite/alertAdapter.test.ts src/db/__tests__/unit/sqlite/workspaceAdapter.test.ts src/db/__tests__/unit/sqlite/userAdapter.test.ts` passed, 5 files / 19 tests.
	- news-crawler-db: `npm run build` passed.
	- copilot-dl-news: `node --check src/data/db/QueueDatabase.js && node --check src/data/db/PlannerDatabase.js && node --check src/data/db/CoverageDatabase.js && node --check src/data/db/sqlite/v1/access.js` passed.
	- copilot-dl-news: wrapper require smoke returned `function function function function` for the queue, planner, coverage, and crawl helper exports.
	- copilot-dl-news: focused scan of the four migrated wrappers for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, and common SQL statement patterns returned no matches.
- Safety evidence: did not execute these wrappers or classes against `data/news.db`; validation used in-memory DB fixtures, package build, syntax checks, static scans, and require-only wrapper smoke checks.
- Remaining classified legacy cluster: `SQLiteNewsDatabase.js` plus its local collaborators (`StatementManager.js`, `SchemaInitializer.js`, `ArticleOperations.js`, `queries/analysis.analysePagesCore.js`, `queries/articleXPathPatterns.js`, `queries/multiModalCrawl.js`, and `queries/patternLearning.js`) still account for 202 focused direct SQL/schema matches. This needs a dedicated facade extraction rather than a blind single-file move because the current class imports local seeders, schema helpers, query modules, stream helpers, and article operation machinery.

## 2026-05-10 Continuation: Place-Hub Candidate Store And Geo Introspection Boundaries

- Added `SqlitePlaceHubCandidatesStore` in `news-crawler-db/src/db/sqlite/access/placeHubCandidatesStore.ts`, exported it from the DB package root, and exposed it as lazy `db.placeHubCandidates`. It owns place-hub candidate save/upsert, recent listing, exact lower-case domain lookup, status updates, and validation metrics/evidence updates.
- Replaced `copilot-dl-news/src/data/db/placeHubCandidatesStore.js` with a no-SQL compatibility wrapper preserving the historical `createPlaceHubCandidatesStore` export used by `src/core/orchestration/dependencies.js`.
- Added `SqliteDatabaseIntrospectionAccess` in `news-crawler-db/src/db/sqlite/access/databaseIntrospection.ts`, exported file-level helpers `getBasicSqliteDatabaseInfo` and `getSqliteDatabaseStats`, and exposed the access surface as `db.databaseIntrospection`.
- Replaced `copilot-dl-news/src/data/db/sqlite/tools/databaseIntrospection.js` with a no-SQL compatibility wrapper and migrated `src/ui/server/geoImportServer.js` to use that wrapper instead of local `sqlite_master` / count queries.
- Added focused in-memory coverage:
	- `news-crawler-db/src/db/__tests__/unit/sqlite/placeHubCandidatesStore.test.ts`
	- `news-crawler-db/src/db/__tests__/unit/sqlite/databaseIntrospection.test.ts`
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/placeHubCandidatesStore.test.ts` passed, 1 file / 5 tests.
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/placeHubCandidatesStore.test.ts src/db/__tests__/unit/sqlite/databaseIntrospection.test.ts` passed after tightening an introspection fixture expectation, 2 files / 8 tests.
	- news-crawler-db: `npm run build` passed.
	- copilot-dl-news: `node --check src/data/db/placeHubCandidatesStore.js && node --check src/data/db/sqlite/tools/databaseIntrospection.js && node --check src/ui/server/geoImportServer.js` passed.
	- copilot-dl-news: focused scan of `src/data/db/placeHubCandidatesStore.js`, `src/data/db/sqlite/tools/databaseIntrospection.js`, and `src/ui/server/geoImportServer.js` for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, and common SQL statement patterns returned no matches.
	- copilot-dl-news: wrapper/export smoke returned `function function function function` for candidate-store and introspection DB exports/wrappers.
- Safety evidence: did not execute geo/candidate tooling against `data/news.db`; validation used in-memory DB fixtures, package build, syntax checks, static scans, and require-only smoke checks.
- Remaining classified clusters after this pass:
	- Generated/schema artifacts: `src/data/db/sqlite/v1/schema-definitions.js` and `src/data/db/postgres/v1/schema-definitions.js`.
	- Large active facade: `SQLiteNewsDatabase.js` and local collaborators still need a dedicated extraction plan.
	- Active gazetteer/UI/query clusters: `gazetteer.deduplication.js`, `gazetteer.places.js`, `gazetteer.populateTool.js`, `GazetteerDatabase.js`, `placePageMappings.js`, `placeHubGuessingUiQueries.js`, `guessPlaceHubsQueries.js`, and geo viewer DB adapters.
	- Remaining legacy adapter clusters: `adminAdapter.js`, `billingAdapter.js`, `tagAdapter.js`, `trustAdapter.js`, `recommendationAdapter.js`, `pushAdapter.js`, `sentimentAdapter.js`, `summaryAdapter.js`, queue adapters, and UI query modules.
	- Tools/scripts: dev hub-discovery tools, remote crawl server tooling, URL normalization migration tooling, and gazetteer migration scripts remain staged; migrate active ones first and classify deprecated/generated/test-only entries separately.

## 2026-05-10 Continuation: Place-Hub URL Pattern Store Boundary

- Added `SqlitePlaceHubUrlPatternsStore` in `news-crawler-db/src/db/sqlite/access/placeHubUrlPatternsStore.ts`, exported it from the DB package root, and exposed it as lazy `db.placeHubUrlPatterns`. It owns `place_hub_url_patterns` schema/index creation, pattern upserts, domain/place-kind reads, accuracy/freshness updates, stale cleanup, stats, and regex matching.
- Replaced `copilot-dl-news/src/data/db/placeHubUrlPatternsStore.js` with a no-SQL compatibility wrapper preserving the historical `createPlaceHubUrlPatternsStore` export used by `src/services/PlaceHubPatternLearningService.js`.
- Added focused in-memory coverage in `news-crawler-db/src/db/__tests__/unit/sqlite/placeHubUrlPatternsStore.test.ts` for schema creation, normalized-domain saves, upsert behavior, ordering, place-kind filtering, all-domain reads, accuracy updates, URL matching, stale cleanup, stats, and no-op input handling.
- Validation evidence:
	- news-crawler-db: initial combined URL-pattern test run exposed a legacy behavior in which an upsert without explicit accuracy applies the default `1.0`; the test now documents that preserved behavior.
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/placeHubUrlPatternsStore.test.ts src/db/__tests__/unit/sqlite/placeHubCandidatesStore.test.ts src/db/__tests__/unit/sqlite/databaseIntrospection.test.ts` passed, 3 files / 13 tests.
	- news-crawler-db: `npm run build` passed after adding the URL-pattern store exports.
	- copilot-dl-news: `node --check src/data/db/placeHubCandidatesStore.js && node --check src/data/db/placeHubUrlPatternsStore.js && node --check src/data/db/sqlite/tools/databaseIntrospection.js && node --check src/ui/server/geoImportServer.js` passed.
	- copilot-dl-news: focused scan of the four migrated copilot files for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, and common SQL statement patterns returned no matches.
	- copilot-dl-news: wrapper/export smoke returned `function function function` for URL-pattern DB exports/wrapper.
- Safety evidence: did not execute URL-pattern services against `data/news.db`; validation used in-memory DB fixtures, package build, syntax checks, static scans, and require-only smoke checks.

## 2026-05-10 Status Audit: Remaining DB-Boundary Work

- Answer to "is there more work?": yes. The DB-boundary migration is substantially advanced but not complete.
- Added `STATUS.md` to this session as the quick current-state document. Updated `INDEX.md`, `PLAN.md`, and `docs/sessions/SESSIONS_HUB.md` to link it and reflect that the session remains active.
- Latest broad active-path static scan:
	- Command: `rg -n "\.prepare\(|\.exec\(|\.pragma\(|sqlite_master|CREATE TABLE|INSERT INTO|SELECT\s|UPDATE\s|DELETE FROM" src/data/db src/core src/services src/ui scripts deploy checks tools --glob '!node_modules/**' --glob '!data/**' --glob '!docs/**' --glob '!**/__tests__/**' --glob '!**/*.test.js' --glob '!**/*.test.ts' --glob '!wip/**' --glob '!public/**' | wc -l`
	- Result: `3908` matches.
- The scan is intentionally broad and includes generated/schema/migration/tooling files, but it also shows active clusters still own local DB SQL.
- Current largest remaining buckets include:
	- Generated/schema artifacts: `src/data/db/sqlite/v1/schema-definitions.js` and `src/data/db/postgres/v1/schema-definitions.js`.
	- Large active facade: `src/data/db/sqlite/v1/SQLiteNewsDatabase.js` plus `StatementManager.js`, `SchemaInitializer.js`, `ArticleOperations.js`, and related query modules.
	- Gazetteer modules: `gazetteer.deduplication.js`, `gazetteer.places.js`, `gazetteer.populateTool.js`, `GazetteerDatabase.js`, `gazetteer.ingest.js`, and geo viewer DB adapters.
	- Legacy adapters: tag, billing, admin, trust, recommendation, push, sentiment, summary, similarity, schedule, API key, healing, coverage, template review, and integration.
	- UI/query modules: place-hub guessing UI, quality metrics, analytics, gazetteer country/place views, queues, UI themes, and pattern sharing.
	- Core/service/tooling: URL queue adapters, place-hub backfill, URL classification, crawl playbook, predictive hub discovery, hub-discovery tools, remote crawl tools, URL-normalization migrations, and gazetteer migration/dedupe scripts.
- Recommended next slice: create a dedicated extraction plan for `SQLiteNewsDatabase.js` and local collaborators rather than moving that facade blindly; it is the largest active boundary blocker and imports schema helpers, seeders, query modules, stream helpers, and article operation machinery.
- Safety evidence: this audit used static scans and doc edits only; no live `data/news.db` access.

## 2026-05-10 Continuation: Schedule, API Key, Healing, Template Review, And Push Adapter Boundaries

- Added DB-owned legacy compatibility access modules in `news-crawler-db`:
	- `src/db/sqlite/access/legacy-common.ts`
	- `src/db/sqlite/access/legacy-scheduleAdapter.ts`
	- `src/db/sqlite/access/legacy-apiKeyAdapter.ts`
	- `src/db/sqlite/access/legacy-healingAdapter.ts`
	- `src/db/sqlite/access/legacy-templateReviewAdapter.ts`
	- `src/db/sqlite/access/legacy-pushAdapter.ts`
- Exported their historical helper/factory functions from `news-crawler-db/src/db/index.ts` so existing CommonJS copilot callers can delegate without retaining local SQL.
- Replaced these copilot files with no-SQL compatibility wrappers:
	- `src/data/db/sqlite/v1/queries/scheduleAdapter.js`
	- `src/data/db/sqlite/v1/queries/apiKeyAdapter.js`
	- `src/data/db/sqlite/v1/queries/healingAdapter.js`
	- `src/data/db/sqlite/v1/queries/templateReviewAdapter.js`
	- `src/data/db/sqlite/v1/queries/pushAdapter.js`
- Added focused in-memory coverage in `news-crawler-db/src/db/__tests__/unit/sqlite/legacyAdaptersBatch.test.ts` for schedule persistence, API key validation/rate/revocation behavior, healing events, template review queues, and push subscription persistence.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyAdaptersBatch.test.ts` passed, 1 file / 5 tests.
	- news-crawler-db: `npm run build` passed after moving `@ts-nocheck` to the top of the copied legacy modules.
	- copilot-dl-news: `node --check src/data/db/sqlite/v1/queries/scheduleAdapter.js && node --check src/data/db/sqlite/v1/queries/apiKeyAdapter.js && node --check src/data/db/sqlite/v1/queries/healingAdapter.js && node --check src/data/db/sqlite/v1/queries/templateReviewAdapter.js && node --check src/data/db/sqlite/v1/queries/pushAdapter.js` passed.
	- copilot-dl-news: wrapper/export smoke returned `function function function function function function` for the DB package and five wrapper exports.
	- copilot-dl-news: focused scan of the five migrated wrappers for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, and common SQL statement patterns returned no matches.
- Updated broad active-path scan:
	- Command: `rg -n "\.prepare\(|\.exec\(|\.pragma\(|sqlite_master|CREATE TABLE|INSERT INTO|SELECT\s|UPDATE\s|DELETE FROM" src/data/db src/core src/services src/ui scripts deploy checks tools --glob '!node_modules/**' --glob '!data/**' --glob '!docs/**' --glob '!**/__tests__/**' --glob '!**/*.test.js' --glob '!**/*.test.ts' --glob '!wip/**' --glob '!public/**' | wc -l`
	- Result: `3792` matches, down from the prior `3908`.
- Safety evidence: did not execute these adapters against `data/news.db`; validation used in-memory DB tests, the DB package build, syntax checks, static scans, and require-only smoke checks.
- Remaining classified clusters after this pass:
	- Generated/schema artifacts: `src/data/db/sqlite/v1/schema-definitions.js` and `src/data/db/postgres/v1/schema-definitions.js`.
	- Large active facade: `SQLiteNewsDatabase.js` and local collaborators still need a dedicated extraction plan.
	- Active gazetteer/UI/query clusters: `gazetteer.deduplication.js`, `gazetteer.places.js`, `gazetteer.populateTool.js`, `GazetteerDatabase.js`, `placePageMappings.js`, `placeHubGuessingUiQueries.js`, `guessPlaceHubsQueries.js`, and geo viewer DB adapters.
	- Remaining legacy adapter clusters: `adminAdapter.js`, `billingAdapter.js`, `tagAdapter.js`, `trustAdapter.js`, `recommendationAdapter.js`, `sentimentAdapter.js`, `summaryAdapter.js`, `similarityAdapter.js`, `coverageAdapter.js`, and integration adapters.
	- Core/service/tooling: URL queue adapters, place-hub backfill, URL classification, crawl playbook, predictive hub discovery, hub-discovery tools, remote crawl tools, URL-normalization migrations, and gazetteer migration/dedupe scripts.

## 2026-05-10 Continuation: Admin, Billing, Tag, Trust, Recommendation, Sentiment, Summary, Similarity, And Coverage Adapter Boundaries

- Added DB-owned legacy compatibility access modules in `news-crawler-db`:
	- `src/db/sqlite/access/legacy-adminAdapter.ts`
	- `src/db/sqlite/access/legacy-billingAdapter.ts`
	- `src/db/sqlite/access/legacy-tagAdapter.ts`
	- `src/db/sqlite/access/legacy-trustAdapter.ts`
	- `src/db/sqlite/access/legacy-recommendationAdapter.ts`
	- `src/db/sqlite/access/legacy-sentimentAdapter.ts`
	- `src/db/sqlite/access/legacy-summaryAdapter.ts`
	- `src/db/sqlite/access/legacy-similarityAdapter.ts`
	- `src/db/sqlite/access/legacy-coverageAdapter.ts`
- Exported their historical factories/constants from `news-crawler-db/src/db/index.ts`.
- Replaced these copilot files with no-SQL compatibility wrappers:
	- `src/data/db/sqlite/v1/queries/adminAdapter.js`
	- `src/data/db/sqlite/v1/queries/billingAdapter.js`
	- `src/data/db/sqlite/v1/queries/tagAdapter.js`
	- `src/data/db/sqlite/v1/queries/trustAdapter.js`
	- `src/data/db/sqlite/v1/queries/recommendationAdapter.js`
	- `src/data/db/sqlite/v1/queries/sentimentAdapter.js`
	- `src/data/db/sqlite/v1/queries/summaryAdapter.js`
	- `src/data/db/sqlite/v1/queries/similarityAdapter.js`
	- `src/data/db/sqlite/v1/queries/coverageAdapter.js`
- Added focused in-memory coverage in `news-crawler-db/src/db/__tests__/unit/sqlite/legacyAdaptersBatch2.test.ts` for admin user/audit operations, billing subscriptions/usage/events, tags/categories/entities/document frequencies, trust records, recommendation/trending rows, sentiment, summaries, similarity fingerprints, and story coverage.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyAdaptersBatch2.test.ts src/db/__tests__/unit/sqlite/legacyAdaptersBatch.test.ts` passed, 2 files / 11 tests.
	- news-crawler-db: `npm run build` passed after adding the DB-owned legacy exports.
	- copilot-dl-news: `node --check` passed for all nine migrated wrappers.
	- copilot-dl-news: wrapper/export smoke returned `function function function function function function function function function function function` for DB package exports plus all nine wrapper factories.
	- copilot-dl-news: focused scan of the nine migrated wrappers for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, and common SQL statement patterns returned no matches.
- Updated broad active-path scan:
	- Command: `rg -n "\.prepare\(|\.exec\(|\.pragma\(|sqlite_master|CREATE TABLE|INSERT INTO|SELECT\s|UPDATE\s|DELETE FROM" src/data/db src/core src/services src/ui scripts deploy checks tools --glob '!node_modules/**' --glob '!data/**' --glob '!docs/**' --glob '!**/__tests__/**' --glob '!**/*.test.js' --glob '!**/*.test.ts' --glob '!wip/**' --glob '!public/**' | wc -l`
	- Result: `3458` matches, down from the prior `3792`.
- Safety evidence: did not execute these adapters against `data/news.db`; validation used in-memory DB tests, the DB package build, syntax checks, static scans, and require-only smoke checks.
- Remaining classified clusters after this pass:
	- Generated/schema artifacts: `src/data/db/sqlite/v1/schema-definitions.js` and `src/data/db/postgres/v1/schema-definitions.js`.
	- Large active facade: `SQLiteNewsDatabase.js` and local collaborators still need a dedicated extraction plan.
	- Active gazetteer/UI/query clusters: `gazetteer.deduplication.js`, `gazetteer.places.js`, `gazetteer.populateTool.js`, `GazetteerDatabase.js`, `placePageMappings.js`, `placeHubGuessingUiQueries.js`, `guessPlaceHubsQueries.js`, and geo viewer DB adapters.
	- Remaining legacy adapter cluster: `integrationAdapter.js`, which uses an async DB API shape and should be moved separately from the better-sqlite3 adapter batch.
	- Core/service/tooling: URL queue adapters, place-hub backfill, URL classification, crawl playbook, predictive hub discovery, hub-discovery tools, remote crawl tools, URL-normalization migrations, and gazetteer migration/dedupe scripts.

## 2026-05-10 Continuation: Async Integration Adapter Boundary

- Added `news-crawler-db/src/db/sqlite/access/legacy-integrationAdapter.ts` and exported `createIntegrationAdapter` from `news-crawler-db/src/db/index.ts`.
- Preserved the adapter's historical async `run/get/all` DB contract rather than forcing it into the synchronous better-sqlite3 adapter shape.
- Replaced `copilot-dl-news/src/data/db/sqlite/v1/queries/integrationAdapter.js` with a no-SQL compatibility wrapper.
- Extended `news-crawler-db/src/db/__tests__/unit/sqlite/legacyAdaptersBatch2.test.ts` with an async in-memory facade over better-sqlite3 covering webhook creation/listing/event matching, delivery creation/update/stats, integration create/list/delete, and secret generation.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyAdaptersBatch2.test.ts src/db/__tests__/unit/sqlite/legacyAdaptersBatch.test.ts` passed, 2 files / 12 tests.
	- news-crawler-db: `npm run build` passed after adding the integration adapter export.
	- copilot-dl-news: `node --check src/data/db/sqlite/v1/queries/integrationAdapter.js` passed.
	- copilot-dl-news: wrapper/export smoke returned `function function` for the DB package export and wrapper export.
	- copilot-dl-news: focused scan of all 15 migrated legacy adapter wrappers for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, and common SQL statement patterns returned no matches.
- Updated broad active-path scan:
	- Command: `rg -n "\.prepare\(|\.exec\(|\.pragma\(|sqlite_master|CREATE TABLE|INSERT INTO|SELECT\s|UPDATE\s|DELETE FROM" src/data/db src/core src/services src/ui scripts deploy checks tools --glob '!node_modules/**' --glob '!data/**' --glob '!docs/**' --glob '!**/__tests__/**' --glob '!**/*.test.js' --glob '!**/*.test.ts' --glob '!wip/**' --glob '!public/**' | wc -l`
	- Result: `3438` matches, down from the prior `3458`.
- Safety evidence: did not execute this adapter against `data/news.db`; validation used in-memory DB tests, the DB package build, syntax checks, static scans, and require-only smoke checks.
- Remaining classified clusters after this pass:
	- Generated/schema artifacts: `src/data/db/sqlite/v1/schema-definitions.js` and `src/data/db/postgres/v1/schema-definitions.js`.
	- Large active facade: `SQLiteNewsDatabase.js` and local collaborators still need a dedicated extraction plan.
	- Active gazetteer/UI/query clusters: `gazetteer.deduplication.js`, `gazetteer.places.js`, `gazetteer.populateTool.js`, `GazetteerDatabase.js`, `placePageMappings.js`, `placeHubGuessingUiQueries.js`, `guessPlaceHubsQueries.js`, and geo viewer DB adapters.
	- Core/service/tooling: URL queue adapters, place-hub backfill, URL classification, crawl playbook, predictive hub discovery, hub-discovery tools, remote crawl tools, URL-normalization migrations, and gazetteer migration/dedupe scripts.

## 2026-05-10 Continuation: SQLiteNewsDatabase, Gazetteer, Place-Hub, Queue, UI, And Schema Boundary Slices

- Moved the large `SQLiteNewsDatabase` compatibility facade and local collaborators into `news-crawler-db` as DB-owned legacy compatibility modules, then replaced these copilot files with no-SQL wrappers:
	- `src/data/db/sqlite/v1/SQLiteNewsDatabase.js`
	- `src/data/db/sqlite/v1/StatementManager.js`
	- `src/data/db/sqlite/v1/SchemaInitializer.js`
	- `src/data/db/sqlite/v1/ArticleOperations.js`
	- `src/data/db/sqlite/v1/UtilityFunctions.js`
	- `src/data/db/sqlite/v1/seeders.js`
	- `src/data/db/sqlite/v1/newsSourcesSeeder.js`
	- `src/data/db/sqlite/v1/queries/analysis.analysePagesCore.js`
	- `src/data/db/sqlite/v1/queries/articleXPathPatterns.js`
	- `src/data/db/sqlite/v1/queries/multiModalCrawl.js`
	- `src/data/db/sqlite/v1/queries/patternLearning.js`
- Added DB-side in-memory coverage in `news-crawler-db/src/db/__tests__/unit/sqlite/sqliteNewsDatabaseCompat.test.ts` for the moved facade, settings/seeders, article XPath patterns, and analysis-pages query factory.
- Moved the active gazetteer compatibility cluster into `news-crawler-db`, including v1 query modules, classic `src/data/db/sqlite/queries/*` variants, standalone `GazetteerDatabase`, schema helpers/definitions, and place-page mapping helpers. Replaced the corresponding copilot files with wrappers.
- Added `news-crawler-db/src/db/__tests__/unit/sqlite/legacyGazetteerCompat.test.ts` covering country/name lookup, place-page mapping coverage, populate summaries, progress state, and standalone gazetteer schema helpers.
- Moved place-hub guessing/backfill DB ownership into `news-crawler-db`:
	- `placeHubGuessingUiQueries`
	- `guessPlaceHubsQueries`
	- `PlaceHubBackfillService`
	- the slugify helper needed by the DB-owned compatibility code.
- Added `news-crawler-db/src/db/__tests__/unit/sqlite/legacyPlaceHubGuessingCompat.test.ts` covering host page counts, cell verification writes, hub insertion/determinations, and absent-mapping backfill from 404 candidates.
- Moved core URL queue adapter ownership into `news-crawler-db`:
	- `IUrlQueue`
	- `SqliteUrlQueueAdapter`
	- `PostgresUrlQueueAdapter`
  Copilot now exports wrappers from `src/core/queue/*`; the wrapper smoke check confirmed the adapter still shares the exported `IUrlQueue` base class.
- Added `news-crawler-db/src/db/__tests__/unit/sqlite/legacyUrlQueueAdapters.test.ts` covering SQLite queue behavior with an injected in-memory handle and Postgres adapter stub mode without a live database.
- Moved active UI query ownership into `news-crawler-db` and replaced copilot UI query files with wrappers:
	- `src/data/db/sqlite/v1/queries/helpers.js`
	- `src/data/db/sqlite/v1/queries/ui/qualityMetrics.js`
	- `src/data/db/sqlite/v1/queries/ui/analytics.js`
	- `src/data/db/sqlite/v1/queries/ui/gazetteerCountry.js`
	- `src/data/db/sqlite/v1/queries/ui/gazetteerPlace.js`
	- `src/data/db/sqlite/v1/queries/ui/queues.js`
	- `src/data/db/sqlite/v1/queries/ui/uiThemes.js`
	- `src/data/db/sqlite/v1/queries/crawlObserverUiQueries.js`
- Added `news-crawler-db/src/db/__tests__/unit/sqlite/legacyUiQueriesCompat.test.ts` covering quality/analytics reads, gazetteer UI reads, queue detail reads, UI theme writes, and crawl observer reads.
- Moved generated SQLite/Postgres v1 schema contract exports and SQLite v1 schema initializer into `news-crawler-db`; copilot schema files are now wrappers:
	- `src/data/db/sqlite/v1/schema-definitions.js`
	- `src/data/db/postgres/v1/schema-definitions.js`
	- `src/data/db/sqlite/v1/schema.js`
- Added `news-crawler-db/src/db/__tests__/unit/sqlite/legacySchemaDefinitionsCompat.test.ts` covering DB-owned schema statement exports and in-memory SQLite schema application with skipped legacy errors.
- Validation evidence for these slices:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/sqliteNewsDatabaseCompat.test.ts` passed, 1 file / 3 tests.
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyGazetteerCompat.test.ts` passed, 1 file / 3 tests.
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyPlaceHubGuessingCompat.test.ts` passed, 1 file / 3 tests.
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyUrlQueueAdapters.test.ts` passed, 1 file / 2 tests.
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyUiQueriesCompat.test.ts` passed, 1 file / 3 tests.
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacySchemaDefinitionsCompat.test.ts` passed, 1 file / 3 tests. This run still emits the known legacy news-source bootstrap warning because the copied seeder looks for `data/bootstrap/news-sources.json` in the DB repo.
	- news-crawler-db: combined `npx vitest run src/db/__tests__/unit/sqlite/legacyGazetteerCompat.test.ts src/db/__tests__/unit/sqlite/legacyPlaceHubGuessingCompat.test.ts src/db/__tests__/unit/sqlite/legacyUrlQueueAdapters.test.ts src/db/__tests__/unit/sqlite/legacyUiQueriesCompat.test.ts` passed, 4 files / 11 tests.
	- news-crawler-db: `npm run build` passed after the moved modules and schema exports were added.
	- copilot-dl-news: `node --check` passed for all wrappers changed in these slices.
	- copilot-dl-news: focused scans of the changed wrappers for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, and common SQL statement patterns returned no matches.
	- copilot-dl-news: require-only wrapper smokes returned function exports for moved gazetteer, place-hub, queue, UI, and schema surfaces.
- Updated broad active-path scan:
	- Command: `rg -n "\.prepare\(|\.exec\(|\.pragma\(|sqlite_master|CREATE TABLE|INSERT INTO|SELECT\s|UPDATE\s|DELETE FROM" src/data/db src/core src/services src/ui scripts deploy checks tools --glob '!node_modules/**' --glob '!data/**' --glob '!docs/**' --glob '!**/__tests__/**' --glob '!**/*.test.js' --glob '!**/*.test.ts' --glob '!wip/**' --glob '!public/**' | wc -l`
	- Result after these slices: `2161` matches, down from the prior `3438`.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; validation used in-memory DB tests, DB package builds, copilot syntax checks, static scans, and require-only smokes.
- Remaining classified clusters:
	- Active query/service DB ownership still in copilot: `domainCrawlBehaviorsQueries.js`, `analysisRuns.js`, `articlesAdapter.js`, `rateLimitAdapter.js`, `classificationTypes.js`, `layout*` query modules, `patternSharing.js`, `pages.export.js`, `placeHubs.js`, `UrlClassificationService.js`, `CrawlPlaybookService.js`, `NewsWebsiteStatsCache.js`, `UrlPatternLearningService.js`, `PredictiveHubDiscovery.js`, `GeoImportService.js`, and `GeoViewerDbAdapter.js`.
	- Postgres parity/WIP runtime: `src/data/db/postgres/v1/PostgresNewsDatabase.js` and `queries/analysis.analysePagesCore.js`.
	- Active or operational tools/scripts still to classify or migrate: `tools/dev/hub-discovery-*`, `tools/remote-crawl/*`, URL-normalization migrations, gazetteer QA/dedupe/ingestion tools, crawl/cloud scripts, schema-sync tools, and download/admin verification checks.
	- Generated/migration-only/test-only files still need explicit classification where retained.

## 2026-05-10 Continuation: Active Query Utility Boundary Slices

- Moved another active SQLite query batch into `news-crawler-db` as DB-owned legacy compatibility modules, then replaced the copilot files with no-SQL wrappers:
	- `src/data/db/sqlite/v1/queries/domainCrawlBehaviorsQueries.js`
	- `src/data/db/sqlite/v1/queries/analysisRuns.js`
	- `src/data/db/sqlite/v1/queries/articlesAdapter.js`
	- `src/data/db/sqlite/v1/rateLimitAdapter.js`
	- `src/data/db/sqlite/v1/queries/ui/classificationTypes.js`
- While moving `domainCrawlBehaviorsQueries`, fixed its DB-owned schema helper to create/add the columns used by its own record/update functions (`puppeteer_last_needed_at`, `puppeteer_detection_count`, `head_supported`, `head_last_failure_at`, `puppeteer_last_success_at`, and metadata compatibility columns).
- Added `news-crawler-db/src/db/__tests__/unit/sqlite/legacyActiveQueryAdapters.test.ts` covering domain crawl behavior persistence, analysis run/event tracking, article adapter reads, classification type/document reads, and rate-limit persistence.
- Moved another active content/query utility batch into `news-crawler-db` and replaced copilot files with wrappers:
	- `src/data/db/sqlite/v1/queries/schema.js`
	- `src/data/db/sqlite/v1/queries/ui/patternSharing.js`
	- `src/data/db/sqlite/v1/queries/pages.export.js`
	- `src/data/db/queries/downloadEvidence.js`
	- `src/data/db/sqlite/v1/queries/multiLanguagePlaces.js`
	- `src/data/db/sqlite/v1/queries/topicKeywords.js`
	- `src/data/db/sqlite/v1/queries/crawlSkipTerms.js`
	- `src/data/db/sqlite/v1/queries/nonGeoTopicSlugsUiQueries.js`
- Added `news-crawler-db/src/db/__tests__/unit/sqlite/legacyContentUtilityQueries.test.ts` covering schema/page-export helpers, pattern sharing, topic/skip/non-geo topic rows, multi-language place lookup, and download verification evidence.
- Moved layout/UI detail query ownership into `news-crawler-db` and replaced copilot files with wrappers:
	- `src/data/db/sqlite/v1/queries/layoutSignatures.js`
	- `src/data/db/sqlite/v1/queries/layoutTemplates.js`
	- `src/data/db/sqlite/v1/queries/layoutMasks.js`
	- `src/data/db/sqlite/v1/queries/layoutAdapter.js`
	- `src/data/db/sqlite/v1/queries/ui/placeHubs.js`
	- `src/data/db/sqlite/v1/queries/ui/urlDetails.js`
	- `src/data/db/sqlite/v1/queries/ui/domainSummary.js`
- Added `news-crawler-db/src/db/__tests__/unit/sqlite/legacyLayoutAndUiQueries.test.ts` covering layout signatures/templates/masks/adapter stats, place-hub UI reads, URL detail reads, and domain summary counts.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyActiveQueryAdapters.test.ts` passed, 1 file / 3 tests.
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyContentUtilityQueries.test.ts` passed, 1 file / 4 tests.
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyLayoutAndUiQueries.test.ts` passed, 1 file / 3 tests.
	- news-crawler-db: combined `npx vitest run src/db/__tests__/unit/sqlite/legacyActiveQueryAdapters.test.ts src/db/__tests__/unit/sqlite/legacyContentUtilityQueries.test.ts src/db/__tests__/unit/sqlite/legacyLayoutAndUiQueries.test.ts` passed, 3 files / 10 tests. These runs still emit the known legacy news-source bootstrap warning from copied seeder code.
	- news-crawler-db: `npm run build` passed after adding explicit ESM exports for the moved legacy modules.
	- copilot-dl-news: `node --check` passed for all 20 changed copilot wrappers in this continuation.
	- copilot-dl-news: focused scans of those 20 wrappers for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, and common SQL statement patterns returned no matches.
	- copilot-dl-news: require-only wrapper smoke returned `wrapper smoke ok 17` for representative moved query surfaces.
- Updated broad active-path scan:
	- Command: `rg -n "\.prepare\(|\.exec\(|\.pragma\(|sqlite_master|CREATE TABLE|INSERT INTO|SELECT\s|UPDATE\s|DELETE FROM" src/data/db src/core src/services src/ui scripts deploy checks tools --glob '!node_modules/**' --glob '!data/**' --glob '!docs/**' --glob '!**/__tests__/**' --glob '!**/*.test.js' --glob '!**/*.test.ts' --glob '!wip/**' --glob '!public/**' | wc -l`
	- Result after these slices: `1879` matches, down from `2161`.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; validation used in-memory DB tests, the DB package build, copilot syntax checks, static scans, and require-only smokes.
- Remaining classified clusters:
	- Active service/runtime DB ownership still in copilot: `UrlClassificationService.js`, `CrawlPlaybookService.js`, `NewsWebsiteStatsCache.js`, `UrlPatternLearningService.js`, `PredictiveHubDiscovery.js`, `GeoImportService.js`, `GeoViewerDbAdapter.js`, `TestResultService.js`, and Electron/admin/download verification DB reads.
	- Postgres parity/WIP runtime: `src/data/db/postgres/v1/PostgresNewsDatabase.js` and `queries/analysis.analysePagesCore.js`.
	- Active or operational tools/scripts still to classify or migrate: `src/data/db/sqlite/v1/tools/gazetteerQA.js`, `tools/dev/hub-discovery-*`, `tools/remote-crawl/*`, URL-normalization migrations, gazetteer migration/dedupe/ingestion tools, crawl/cloud scripts, schema-sync tools, DSPL place metadata, and download/admin verification checks.
	- Generated/migration-only/test-only files still need explicit classification where retained.

## 2026-05-10 Continuation: Active Service And Runtime DB Boundary Slices

- Added `news-crawler-db` DB-owned access surfaces for remaining active service/runtime DB work:
	- `src/db/sqlite/access/hubGapAnalysis.ts` exposes named operations for hub-gap URL reads, country/topic rows, latest fetch/status checks, place-hub pattern learning reads, site URL pattern reads/writes, news-website discovery counts, crawl-task inserts, URL status updates, known hub seed reads/writes, strategy templates, exploration decisions/outcomes, and goal optimizations.
	- `src/db/sqlite/access/geoImport.ts` exposes GeoNames import statements, import transactions, index creation, import counts, and verification lookups.
	- `src/db/sqlite/access/legacy-quickWinSchemaMigrations.ts` owns the quick-win crawler schema migrations and schema status checks.
- Wired these through `news-crawler-db` root exports and SQLite adapter properties (`db.hubGapAnalysis`, `db.geoImport`).
- Migrated all direct SQL out of `copilot-dl-news/src/services` active service files:
	- `sitePatternAnalysis.js`
	- `shared/PredictionStrategyManager.js`
	- `shared/PatternDiscoveryManager.js`
	- `TopicHubGapAnalyzer.js`
	- `CountryHubGapAnalyzer.js`
	- `PlacePlaceHubGapAnalyzer.js`
	- `PlaceTopicHubGapAnalyzer.js`
	- `PlaceHubPatternLearningService.js`
	- `GeoImportService.js`
	- `GeoImportStateManager.js`
	- `NewsWebsiteDiscovery.js`
	- `CountryHubMatcher.js`
	- `HubTaskGenerator.js`
	- `IntelligentCrawlServer.js`
- Migrated a focused set of active crawler runtime DB calls to DB-owned APIs:
	- `src/core/orchestration/ActiveProbeProcessor.js`
	- `src/core/crawler/UrlEligibilityService.js`
	- `src/core/crawler/domains/DomainRegistryStore.js`
	- `src/core/crawler/dbClient.js`
	- `src/core/crawler/data/placeHubs.js`
	- `src/core/crawler/planner/CountryHubPlanner.js`
	- `src/core/crawler/services/ResilienceService.js`
	- `src/core/crawler/CrawlStrategyTemplates.js`
	- `src/core/crawler/AdaptiveExplorer.js`
	- `src/core/crawler/MultiGoalOptimizer.js`
	- `src/core/crawler/ProblemResolutionService.js`
	- `src/core/crawler/schema-migrations.js`
- Added focused in-memory coverage:
	- `news-crawler-db/src/db/__tests__/unit/sqlite/hubGapAnalysis.test.ts`
	- `news-crawler-db/src/db/__tests__/unit/sqlite/geoImport.test.ts`
	- `news-crawler-db/src/db/__tests__/unit/sqlite/quickWinSchemaMigrations.test.ts`
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/hubGapAnalysis.test.ts src/db/__tests__/unit/sqlite/geoImport.test.ts src/db/__tests__/unit/sqlite/quickWinSchemaMigrations.test.ts src/db/__tests__/unit/sqlite/legacyRuntimeServiceCompat.test.ts` passed, 4 files / 12 tests. The known legacy news-source bootstrap warning still appears from copied seeder compatibility code.
	- news-crawler-db: `npm run build` passed.
	- copilot-dl-news: `node --check` passed for all changed service/runtime files in this slice.
	- copilot-dl-news: focused scan of all changed service/runtime files for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, and common SQL statement patterns returned no matches.
	- copilot-dl-news: broad active-path scan now reports `1586` matches, down from `1879`.
- Latest remaining active `src/services` scan result: no direct DB SQL/driver-pattern matches.
- Remaining active/runtime clusters:
	- `src/core/crawler/HierarchicalPlanner.js`
	- `src/core/crawler/remote/RemoteCrawlerAdapter.js`
	- `src/core/crawler/gazetteer/ingestors/*`
	- `src/core/crawler/gazetteer/GazetteerPriorityScheduler.js`
	- `src/core/crawler/cli/runLegacyCommand.js`
	- `src/core/crawler/services/groups/StorageServices.js`
- Remaining non-DB false positives in core scans include XML/HTML regex loops, SPARQL query strings, and comments in sitemap, hub-validator, archive discovery, processing services, Wikidata service, and geography query builders.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; validation used in-memory DB tests, the DB package build, syntax checks, and static scans.

## 2026-05-10 Continuation: Remaining Active Core Runtime Boundary

- Migrated the remaining meaningful active `src/core` DB ownership into `news-crawler-db` named APIs.
- Extended `news-crawler-db/src/db/sqlite/access/hubGapAnalysis.ts` for `HierarchicalPlanner` with named planning/profile/heuristic operations and exported them from the package root.
- Extended `news-crawler-db/src/db/sqlite/access/remoteCrawler.ts` with `listRemoteCrawlerAdapterExportRows` and migrated `src/core/crawler/remote/RemoteCrawlerAdapter.js` export reads to that API.
- Added `news-crawler-db/src/db/sqlite/access/legacyArticleStorage.ts` with `upsertLegacyArticleRecord` and `getLegacyArticleRecordByUrl`; migrated `src/core/crawler/services/groups/StorageServices.js` to use those functions instead of local article SQL.
- Added `databaseTableExists` and used it from `src/core/crawler/gazetteer/GazetteerPriorityScheduler.js`.
- Added gazetteer ingestion helper APIs in `news-crawler-db/src/db/sqlite/access/legacy-gazetteer-ingest.ts`: `registerPlaceSource`, `listWikidataCountryIngestionRows`, `getAdm1CodeForWikidataRegion`, `getRegionPlaceIdByAdm1Code`, and `insertAdminParentHierarchy`.
- Exposed those helpers through both copilot gazetteer ingestion compatibility wrappers:
	- `src/data/db/sqlite/v1/queries/gazetteer.ingest.js`
	- `src/data/db/sqlite/queries/gazetteer.ingest.js`
- Migrated DB reads/writes in active gazetteer ingestors:
	- `src/core/crawler/gazetteer/ingestors/WikidataCountryIngestor.js`
	- `src/core/crawler/gazetteer/ingestors/WikidataAdm1Ingestor.js`
	- `src/core/crawler/gazetteer/ingestors/WikidataCitiesIngestor.js`
	- `src/core/crawler/gazetteer/ingestors/OsmBoundaryIngestor.js`
- Migrated `src/core/crawler/cli/runLegacyCommand.js` country city-count reporting to `resolveCountryCityCountReports` from `news-crawler-db`.
- Updated `src/core/crawler/components/GazetteerManager.js` comments so the active core scan no longer reports stale `db.prepare` guidance.
- Added/extended focused in-memory coverage:
	- `news-crawler-db/src/db/__tests__/unit/sqlite/hubGapAnalysis.test.ts`
	- `news-crawler-db/src/db/__tests__/unit/sqlite/remoteCrawler.test.ts`
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacyArticleStorage.test.ts`
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacyGazetteerCompat.test.ts`
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/remoteCrawler.test.ts src/db/__tests__/unit/sqlite/hubGapAnalysis.test.ts src/db/__tests__/unit/sqlite/legacyArticleStorage.test.ts src/db/__tests__/unit/sqlite/legacyGazetteerCompat.test.ts` passed, 4 files / 12 tests.
	- news-crawler-db: `npm run build` passed.
	- copilot-dl-news: `node --check` passed for `HierarchicalPlanner.js`, `RemoteCrawlerAdapter.js`, `GazetteerPriorityScheduler.js`, `StorageServices.js`, `runLegacyCommand.js`, `GazetteerManager.js`, all four migrated gazetteer ingestors, and both gazetteer ingestion compatibility wrappers.
	- copilot-dl-news: focused direct-SQL scan of the migrated core files for `.prepare(`, `.pragma(`, `sqlite_master`, `CREATE TABLE`, `INSERT INTO`, `UPDATE`, and `DELETE FROM` returned no matches.
	- copilot-dl-news: broad active-path scan now reports `1547` matches, down from `1586`.
	- copilot-dl-news: `src/core` scan now has no meaningful SQLite ownership matches; remaining hits are SPARQL `SELECT` strings and regex `.exec` false positives in sitemap/archive/hub-validator/processing code.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; validation used in-memory DB tests, the DB package build, syntax checks, and static scans.
- Remaining classified work after active core cleanup:
	- Postgres parity/WIP runtime: at this checkpoint `src/data/db/postgres/v1/PostgresNewsDatabase.js` and query collaborators still needed migration into DB-owned parity APIs. This item is superseded by the 2026-05-11 continuation below, which migrated that runtime into `news-crawler-db`.
	- Active or operational tools/scripts still to classify or migrate: remote crawl server/merge tools, hub discovery dev tools, gazetteer QA/dedupe/ingestion scripts, URL-normalization migrations, cloud-crawl validation scripts, schema-sync tools, DSPL place metadata tools, and download/admin verification checks.
	- Generated, migration-only, deprecated, and test-only SQL remains staged for explicit classification rather than mixed into active runtime migration.

## 2026-05-11 Correction: Postgres Is A Parity Backend

- Corrected stale wording that described the Postgres runtime as legacy or a retire/migrate decision.
- Current direction: Postgres is a first-class WIP backend. It should be moved into `news-crawler-db` parity APIs alongside SQLite, not deprecated.
- Target behavior: SQLite and Postgres should be interchangeable behind explicit DB-owned interfaces and should also be able to run side by side for migration, export, import, comparison, and verification workflows.
- Updated `STATUS.md`, `PLAN.md`, and `docs/sessions/SESSIONS_HUB.md` to reflect this classification.

## 2026-05-11 Continuation: Postgres Parity And UI Query Wrappers

- Migrated the active Postgres v1 compatibility runtime into `news-crawler-db` as first-class Postgres parity/WIP APIs, not deprecated code:
	- `news-crawler-db/src/db/postgres/access/PostgresNewsDatabase.ts`
	- `news-crawler-db/src/db/postgres/access/postgresV1-pgPool.ts`
	- `news-crawler-db/src/db/postgres/access/postgresV1-ensureDb.ts`
	- `news-crawler-db/src/db/postgres/access/postgresV1-analysisAnalysePagesCore.ts`
	- `news-crawler-db/src/db/postgres/access/postgresV1-articleXPathPatterns.ts`
	- `news-crawler-db/src/db/postgres/access/postgresV1-common.ts`
- Added `pg` as a direct `news-crawler-db` dependency so the DB-owned pool factory does not rely on `copilot-dl-news` dependency resolution.
- Replaced the copilot Postgres files with no-SQL compatibility wrappers:
	- `src/data/db/postgres/index.js`
	- `src/data/db/postgres/v1/connection.js`
	- `src/data/db/postgres/v1/ensureDb.js`
	- `src/data/db/postgres/v1/PostgresNewsDatabase.js`
	- `src/data/db/postgres/v1/queries/analysis.analysePagesCore.js`
	- `src/data/db/postgres/v1/queries/articleXPathPatterns.js`
	- `src/data/db/postgres/v1/queries/common.js`
- Migrated the remaining non-test SQLite UI query SQL from `src/data/db/sqlite/v1/queries/ui` into DB-owned compatibility modules:
	- Domain/storage batch: domain listing, domain counts, domain details, recent domains, and storage totals.
	- Remaining UI batch: article viewer DB reads/counts, cloud crawl status, configuration, crawl types, crawl events, crawl listings, error summaries, and cached metrics.
- Copilot-side UI files are now wrappers or non-DB presentation helpers. `articleViewer.js` keeps decompression and HTML extraction locally while delegating all DB reads/counts to `news-crawler-db`.
- Added focused in-memory coverage:
	- `news-crawler-db/src/db/__tests__/unit/postgres/postgresV1Compat.test.ts`
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacyUiDomainStorageCompat.test.ts`
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacyUiRemainingCompat.test.ts`
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyUiDomainStorageCompat.test.ts src/db/__tests__/unit/sqlite/legacyUiRemainingCompat.test.ts src/db/__tests__/unit/postgres/postgresV1Compat.test.ts` passed, 3 files / 11 tests. The known legacy news-source bootstrap warning still appears from copied seeder compatibility code.
	- news-crawler-db: `npm run build` passed.
	- copilot-dl-news: `node --check` passed for all changed Postgres wrappers and all changed UI query wrappers.
	- copilot-dl-news: focused Postgres scan for `require('pg')`, `client.query`, `pool.query`, transaction keywords, and common SQL statement patterns returned no matches.
	- copilot-dl-news: focused non-test `src/data/db/sqlite/v1/queries/ui` scan for `.prepare(`, `.exec(`, `sqlite_master`, and common SQL statement patterns returned no matches.
	- copilot-dl-news: `node -e "const db = require('news-crawler-db'); ..."` confirmed the freshly built root exports for Postgres, UI article/cloud/cache, domain listing, and storage APIs are available.
	- copilot-dl-news: broad active-path scan now reports `1443` matches, down from `1547`.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; validation used fake Postgres pools, in-memory SQLite tests, the DB package build, syntax checks, export smoke checks, and static scans.
- Remaining classified work after this pass:
	- Top-level SQLite v1 query wrappers still containing small raw SQL clusters: `analysis.showAnalysis.js`, `articles.backfillDates.js`, `backgroundTasks.js`, `compression.js`, `maintenance.js`, `placeHubs.crawlTool.js`, `placeHubs.js`, `telemetry.js`, and `topicHubGuessingUiQueries.js`.
	- Active or operational tools/scripts still to classify or migrate: remote crawl server/merge tools, hub discovery dev tools, gazetteer QA/dedupe/ingestion scripts, URL-normalization migrations, cloud-crawl validation scripts, schema-sync tools, DSPL place metadata tools, and download/admin verification checks.
	- Generated, migration-only, deprecated, and test-only SQL remains staged for explicit classification rather than mixed into active runtime migration.

## 2026-05-11 Continuation: Top-Level SQLite V1 Query Wrappers

- Migrated the remaining small top-level SQLite v1 query-wrapper SQL clusters into `news-crawler-db` named compatibility APIs:
	- `legacy-analysisShowAnalysis.ts`
	- `legacy-articlesBackfillDates.ts`
	- `legacy-backgroundTasksQueries.ts`
	- `legacy-compressionQueries.ts`
	- `legacy-maintenanceQueries.ts`
	- `legacy-placeHubsCrawlTool.ts`
	- `legacy-placeHubsCountryCandidates.ts`
	- `legacy-telemetryQueries.ts`
	- `legacy-topicHubGuessingUiQueries.ts`
- Replaced these copilot files with thin wrappers or helper-only exports:
	- `src/data/db/sqlite/v1/queries/analysis.showAnalysis.js`
	- `src/data/db/sqlite/v1/queries/articles.backfillDates.js`
	- `src/data/db/sqlite/v1/queries/backgroundTasks.js`
	- `src/data/db/sqlite/v1/queries/compression.js`
	- `src/data/db/sqlite/v1/queries/maintenance.js`
	- `src/data/db/sqlite/v1/queries/placeHubs.crawlTool.js`
	- `src/data/db/sqlite/v1/queries/placeHubs.js`
	- `src/data/db/sqlite/v1/queries/telemetry.js`
	- `src/data/db/sqlite/v1/queries/topicHubGuessingUiQueries.js`
- Added focused in-memory coverage in `news-crawler-db/src/db/__tests__/unit/sqlite/legacyTopLevelQueryCompat.test.ts` for analysis summary/latest rows, article date backfill selection/update, background task create/update/get, compression discovery/stats, maintenance helpers, place-hub crawl/country candidate reads, telemetry stats, and topic-hub matrix/cell reads.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyTopLevelQueryCompat.test.ts` passed, 1 file / 5 tests.
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyTopLevelQueryCompat.test.ts src/db/__tests__/unit/sqlite/legacyUiDomainStorageCompat.test.ts src/db/__tests__/unit/sqlite/legacyUiRemainingCompat.test.ts src/db/__tests__/unit/postgres/postgresV1Compat.test.ts` passed, 4 files / 16 tests. The known legacy news-source bootstrap warning still appears from copied seeder compatibility code.
	- news-crawler-db: `npm run build` passed.
	- news-crawler-db: root export smoke confirmed `createShowAnalysisQueries`, `createBackfillDatesQueries`, `createBackgroundTask`, `getCompressionUsageStats`, `createCrawlPlaceHubsQueries`, and `buildTopicHubMatrixModel` are exported functions.
	- copilot-dl-news: `node --check` passed for all nine changed top-level SQLite v1 query wrappers.
	- copilot-dl-news: focused scan of non-test `src/data/db/sqlite/v1/queries/*.js` and `src/data/db/sqlite/v1/queries/ui/*.js` for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, and common SQL statement patterns returned no matches.
	- copilot-dl-news: broad active-path scan now reports `1402` matches, down from `1443`.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; validation used in-memory SQLite tests, fake Postgres pool tests, the DB package build, syntax checks, export smoke checks, and static scans.
- Remaining classified work after this pass:
	- Active or operational tools/scripts still to classify or migrate: remote crawl server/merge tools, hub discovery dev tools, gazetteer QA/dedupe/ingestion scripts, URL-normalization migrations, cloud-crawl validation scripts, schema-sync tools, DSPL place metadata tools, and download/admin verification checks.
	- Shared SQLite/Postgres import/export/migration APIs still need explicit design so both backends can be interchangeable for normal callers and side by side for migration/export/import verification.
	- Generated, migration-only, deprecated, and test-only SQL remains staged for explicit classification rather than mixed into active runtime migration.

## 2026-05-11 Continuation: Gazetteer QA, Hub Discovery, And Remote Crawl Server Tooling

- Migrated `src/data/db/sqlite/v1/tools/gazetteerQA.js` into DB-owned `validateGazetteerIntegrity` and `repairGazetteerIntegrity` APIs in `news-crawler-db/src/db/sqlite/access/legacy-gazetteer-qa.ts`.
- Added `src/data/db/sqlite/tools/gazetteerQA.js` as a compatibility alias so existing `src/tools/validate-gazetteer.js` and `src/tools/gazetteer_qa.js` resolve through the DB-owned API instead of a missing non-v1 path.
- Added `news-crawler-db/src/db/sqlite/access/legacy-hubDiscoveryDiagnostics.ts` for hub-discovery dev diagnostics and verification DB operations:
	- progress counts, pages-needing-analysis counts, analysis counts, diagnostic snapshots, gazetteer seed DB copy, fetched-response recording, successful page/URL reads, hub verification table setup, verification result recording, publisher/country stats, and sample existing hub reads.
- Migrated `tools/dev/hub-discovery-test.js` and `tools/dev/hub-discovery-e2e.js` so they keep crawl orchestration, HTTP fetching, link extraction, candidate heuristics, and report formatting locally while delegating DB reads/writes to `news-crawler-db`.
- Added `news-crawler-db/src/db/sqlite/access/legacy-remoteCrawlServer.ts` for the active `tools/remote-crawl/news-crawler-server.js` DB surface:
	- schema setup, stale run cleanup, crawl run creation/finalization/interruption, crawl log writes, queue state transitions, URL enqueueing, summary/status reads, URL listing, and export rows.
- Migrated `tools/remote-crawl/news-crawler-server.js` so crawler/server logic remains local but schema, queue/run/log/status/export SQL lives in `news-crawler-db`.
- Added focused coverage:
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacyGazetteerQaCompat.test.ts`
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacyHubDiscoveryDiagnostics.test.ts`
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacyRemoteCrawlServer.test.ts`
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyGazetteerQaCompat.test.ts src/db/__tests__/unit/sqlite/legacyHubDiscoveryDiagnostics.test.ts src/db/__tests__/unit/sqlite/legacyRemoteCrawlServer.test.ts` passed, 3 files / 6 tests. The known legacy news-source bootstrap warning still appears from copied seeder compatibility code.
	- news-crawler-db: `npm run build` passed.
	- news-crawler-db/copilot smoke: `require('news-crawler-db')` exposes `validateGazetteerIntegrity`, `repairGazetteerIntegrity`, hub-discovery APIs, and remote crawl server APIs as functions after build.
	- copilot-dl-news: `node --check` passed for `src/data/db/sqlite/v1/tools/gazetteerQA.js`, `src/data/db/sqlite/tools/gazetteerQA.js`, `src/tools/validate-gazetteer.js`, `src/tools/maintain-db.js`, `src/tools/gazetteer_qa.js`, `tools/dev/hub-discovery-test.js`, `tools/dev/hub-discovery-e2e.js`, and `tools/remote-crawl/news-crawler-server.js`.
	- copilot-dl-news: focused scans of the migrated gazetteer QA wrappers, hub-discovery tools, and remote crawl server for `.prepare(`, `.pragma(`, `sqlite_master`, `CREATE TABLE`, `INSERT INTO`, `SELECT`, `UPDATE`, and `DELETE FROM` returned no matches.
	- copilot-dl-news: the only remaining `.exec(` hit in those migrated operational files is an HTML href regex loop in `tools/dev/hub-discovery-e2e.js`, not database execution.
	- copilot-dl-news: broad active-path scan now reports `1278` matches, down from `1402`.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; validation used in-memory or temporary-file DB fixtures, the DB package build, syntax checks, export smoke checks, and static scans.
- Remaining classified work after this pass:
	- Active or operational tools/scripts still to classify or migrate: remote crawl merge/import tools, gazetteer schema/dedupe/ingestion tools, URL-normalization migrations, PostGIS exploration, cloud-crawl validation scripts, schema-sync tools, DSPL place metadata tools, compression tools, and download/admin/search verification checks.
	- Shared SQLite/Postgres import/export/migration APIs still need explicit design so both backends can be interchangeable for normal callers and side by side for migration/export/import verification.
	- Generated, migration-only, deprecated, and test-only SQL remains staged for explicit classification rather than mixed into active runtime migration.

## 2026-05-11 Continuation: Remote Crawl Merge/Queue And Gazetteer Schema Migration

- Extended `news-crawler-db/src/db/sqlite/access/legacy-remoteCrawlServer.ts` with DB-owned remote crawl import/queue operations:
	- `mergeRemoteCrawlServerDatabase` imports completed remote crawl rows into a main SQLite DB by URL, inserts missing `http_responses`, and returns before/after/source/change counts.
	- `listRemoteCrawlDomainsNeedingDocuments` reads enabled `news_websites`, derives effective hosts, counts local `urls`, and returns under-threshold domains for remote queueing.
- Migrated `tools/remote-crawl/merge-db.js` and `tools/remote-crawl/queue-urls-to-remote.js` so they keep CLI parsing, path checks, HTTP queueing, and console output locally while delegating DB reads/writes to `news-crawler-db`.
- Added `news-crawler-db/src/db/sqlite/access/legacy-gazetteer-schemaMigration.ts` with `runGazetteerSchemaMigration`, covering alias table creation, canonical-name repair/deletion, index creation, `place_type` column migration, live transaction handling, dry-run reporting, and final stats.
- Migrated `scripts/gazetteer/migrate-schema.js` into a no-SQL reporter wrapper around `runGazetteerSchemaMigration`.
- Added focused coverage:
	- Extended `news-crawler-db/src/db/__tests__/unit/sqlite/legacyRemoteCrawlServer.test.ts` for remote crawl DB merge and domain threshold selection.
	- Added `news-crawler-db/src/db/__tests__/unit/sqlite/legacyGazetteerSchemaMigration.test.ts` for live and dry-run schema migration behavior.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyRemoteCrawlServer.test.ts src/db/__tests__/unit/sqlite/legacyGazetteerSchemaMigration.test.ts` passed, 2 files / 6 tests. The known legacy news-source bootstrap warning still appears from copied seeder compatibility code.
	- news-crawler-db: `npm run build` passed.
	- news-crawler-db/copilot smoke: `require('news-crawler-db')` exposes `mergeRemoteCrawlServerDatabase`, `listRemoteCrawlDomainsNeedingDocuments`, and `runGazetteerSchemaMigration` as functions after build.
	- copilot-dl-news: `node --check tools/remote-crawl/merge-db.js tools/remote-crawl/queue-urls-to-remote.js tools/remote-crawl/news-crawler-server.js scripts/gazetteer/migrate-schema.js` passed.
	- copilot-dl-news: focused scans of `tools/remote-crawl/merge-db.js`, `tools/remote-crawl/queue-urls-to-remote.js`, and `scripts/gazetteer/migrate-schema.js` for `.prepare(`, `.pragma(`, `sqlite_master`, `CREATE TABLE`, `INSERT INTO`, `SELECT`, `UPDATE`, and `DELETE FROM` returned no matches.
	- copilot-dl-news: broad active-path scan now reports `1234` matches, down from `1278`.
- Architecture note from user direction:
	- `news-db-pure-analysis` should remain a pure, DB-free function library.
	- `news-db-analysis` should bridge `news-crawler-db` and `news-db-pure-analysis`: fetch explicit DB read models, call pure analysis, and persist analysis outputs through DB APIs where needed.
	- `news-crawler-db` should not import either analysis repo; it owns persistence contracts only.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; validation used in-memory or temporary-file DB fixtures, the DB package build, syntax checks, export smoke checks, and static scans.
- Remaining classified work after this pass:
	- Active or operational tools/scripts still to classify or migrate: URL-normalization migrations, PostGIS exploration, gazetteer dedupe/ingestion tools, cloud-crawl validation scripts, schema-sync tools, DSPL place metadata tools, compression tools, and download/admin/search verification checks.
	- Shared SQLite/Postgres import/export/migration APIs still need explicit design so both backends can be interchangeable for normal callers and side by side for migration/export/import verification.
	- Generated, migration-only, deprecated, and test-only SQL remains staged for explicit classification rather than mixed into active runtime migration.

## 2026-05-11 Continuation: Electron Diagnostics, DSPL Reads, Exporter, And FTS5 Migration

- Added `news-crawler-db` access surfaces for additional active clusters:
	- `crawlerAppDiagnostics` for Electron crawler app URL analysis, DB stats, HTTP-response cache clearing, and stored-content lookup.
	- `dsplAnalysis` for DSPL/country-hub read models: country metadata/name rows, region/city metadata rows, candidate article rows, and place-hub pattern rows.
	- `DatabaseExporter` and `runDatabaseExportCli` in `news-crawler-db/src/db/export/DatabaseExporter.ts`, supporting SQLite/Postgres export infrastructure from the DB repo. SQLite-to-SQLite is covered by focused tests; Postgres is lazily loaded through `pg` so SQLite-focused validation does not require a local `pg` install.
	- FTS5 article-search migration functions in `legacy-fts5ArticleSearchMigration.ts`.
- Migrated copilot callers/wrappers:
	- `src/ui/electron/crawlerApp/main.js` now delegates all DB work to `db.crawlerAppDiagnostics`.
	- `tools/lib/dspl/placeMetadata.js` now shapes metadata from `db.dsplAnalysis` rows without local SQL.
	- `tools/analysis/analyze-country-hub-patterns.js` now uses `openNewsCrawlerDb`, fixed its local relative imports, and delegates article/place-hub DB reads to `db.dsplAnalysis`.
	- `src/data/db/DatabaseExporter.js` is now a compatibility/CLI wrapper around `news-crawler-db`.
	- `src/data/db/sqlite/v1/migrations/add_fts5_article_search.js` is now a migration compatibility wrapper around `news-crawler-db`.
- Added focused coverage:
	- `news-crawler-db/src/db/__tests__/unit/sqlite/crawlerAppDiagnostics.test.ts`
	- `news-crawler-db/src/db/__tests__/unit/sqlite/dsplAnalysis.test.ts`
	- `news-crawler-db/src/db/__tests__/unit/sqlite/databaseExporter.test.ts`
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacyFts5ArticleSearchMigration.test.ts`
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyFts5ArticleSearchMigration.test.ts src/db/__tests__/unit/sqlite/databaseExporter.test.ts src/db/__tests__/unit/sqlite/crawlerAppDiagnostics.test.ts src/db/__tests__/unit/sqlite/dsplAnalysis.test.ts` passed, 4 files / 10 tests. The known legacy news-source bootstrap warning still appears from copied seeder compatibility code.
	- news-crawler-db: `npm run build` passed after the changes.
	- news-crawler-db/copilot smoke: `require('news-crawler-db')` exposes `DatabaseExporter`, `runDatabaseExportCli`, `createSqliteCrawlerAppDiagnosticsAccess`, `createSqliteDsplAnalysisAccess`, and `runSqliteFts5ArticleSearchMigrationUp` as functions after build.
	- copilot-dl-news: `node --check src/data/db/sqlite/v1/migrations/add_fts5_article_search.js src/data/db/DatabaseExporter.js src/ui/electron/crawlerApp/main.js tools/lib/dspl/placeMetadata.js tools/analysis/analyze-country-hub-patterns.js` passed.
	- copilot-dl-news: focused scans of those five changed copilot files for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, `CREATE TABLE`, `INSERT INTO`, `SELECT`, `UPDATE`, `DELETE FROM`, `client.query`, `pool.query`, `require('pg')`, `ensureDatabase`, and `ensureDb` returned no matches.
	- copilot-dl-news: broad active-path scan now reports `1154` matches, down from `1234`.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; validation used in-memory or temporary-file DB fixtures, the DB package build, syntax checks, export smoke checks, and static scans.
- Remaining classified work after this pass:
	- Highest raw-SQL buckets are now URL-normalization migration/validation tooling, PostGIS exploration, gazetteer dedupe/ingestion, normalized-table phase migrations, download/admin verification checks, cloud-crawl scripts, schema-sync, compression tools, and remaining migration/import/validator compatibility modules.
	- The exporter move is only the first shared SQLite/Postgres side-by-side workflow. Importer, validator, schema-sync, URL-normalization, and PostGIS WIP paths still need staged DB-owned contracts or explicit classification.

## 2026-05-11 Continuation: URL Normalization Migration Tooling

- Added `news-crawler-db/src/db/sqlite/access/legacy-urlNormalizationMigration.ts` with DB-owned URL-normalization operations:
	- schema application and column/index inspection,
	- remaining-batch counting,
	- text-URL to `url_id` backfill migration,
	- migration validation and storage analysis,
	- old text URL column inspection and cleanup.
- Fixed a migrated control-flow bug from the old copilot script: failed ID-paginated batches no longer try to advance an undefined `offset` variable.
- Migrated copilot URL-normalization tools into no-SQL wrappers:
	- `tools/migrations/url-normalization.js`
	- `tools/migrations/validate-url-normalization.js`
	- `tools/migrations/url-normalization-schema.js`
	- `tools/migrations/drop-old-url-columns.js`
- Added focused coverage in `news-crawler-db/src/db/__tests__/unit/sqlite/legacyUrlNormalizationMigration.test.ts` for idempotent schema application, live migration with verification, dry-run migration, validation, remaining batch reporting, and old-column cleanup.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyUrlNormalizationMigration.test.ts` passed, 1 file / 4 tests. The known legacy news-source bootstrap warning still appears from copied seeder compatibility code.
	- news-crawler-db: `npm run build` passed.
	- news-crawler-db/copilot smoke: `require('news-crawler-db')` exposes `createUrlNormalizationMigrator`, `runUrlNormalizationValidation`, `applyUrlNormalizationSchema`, and `dropOldUrlColumns` as functions after build.
	- copilot-dl-news: `node --check tools/migrations/url-normalization.js tools/migrations/validate-url-normalization.js tools/migrations/url-normalization-schema.js tools/migrations/drop-old-url-columns.js` passed.
	- copilot-dl-news: focused scan of those four tools for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, `CREATE TABLE`, `INSERT INTO`, `SELECT`, `UPDATE`, `DELETE FROM`, `ensureDatabase`, `ensureDb`, and `openDatabase` returned no matches.
	- copilot-dl-news: broad active-path scan now reports `1096` matches, down from `1154`.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; validation used in-memory SQLite fixtures, the DB package build, syntax checks, export smoke checks, and static scans.
- Remaining classified work after this pass:
	- Highest remaining raw-SQL buckets include PostGIS exploration, gazetteer dedupe/ingestion, normalized-table phase migrations, download/admin verification checks, cloud-crawl scripts, schema-sync, compression tooling, migration/import/validator compatibility modules, and remaining generated/migration-only artifacts.
	- `tools/migrations/test-migration-schema.js` is now a lower-priority URL-normalization test harness candidate: it should either become a DB-owned fixture smoke or be explicitly classified as migration-test-only.

## 2026-05-11 Continuation: Normalized Phase Migration Tooling

- Added `news-crawler-db/src/db/sqlite/access/legacy-normalizedPhaseMigrations.ts` with DB-owned normalized phase migration operations:
	- phase 1 normalized table/index schema application,
	- phase 1 table verification,
	- schema migration version 2 recording,
	- phase 2 dual-write prerequisite verification,
	- compression type seed-count warning reporting,
	- schema migration version 3 recording.
- Migrated copilot phase scripts into no-SQL wrappers:
	- `tools/maintenance/phase-1-add-normalized-tables.js`
	- `tools/migrations/phase-2-enable-dual-write.js`
- Preserved the scripts' exported helper names (`createNormalizedTables`, `recordSchemaVersion2`, `verifyTablesExist`, `recordSchemaVersion3`, and `verifyDualWriteEnabled`) as compatibility delegators to `news-crawler-db`.
- Added focused coverage in `news-crawler-db/src/db/__tests__/unit/sqlite/legacyNormalizedPhaseMigrations.test.ts` for idempotent phase 1 schema application, schema migration recording, duplicate migration protection, phase 2 prerequisite checks, low compression seed warnings, and missing prerequisite failures.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyNormalizedPhaseMigrations.test.ts` passed, 1 file / 5 tests. The known legacy news-source bootstrap warning still appears from copied seeder compatibility code.
	- news-crawler-db: `npm run build` passed.
	- news-crawler-db/copilot smoke: `require('news-crawler-db')` exposes `applyNormalizedPhase1Schema`, `runNormalizedPhase1Migration`, `verifyNormalizedDualWritePrerequisites`, and `runNormalizedDualWriteMigration` as functions after build.
	- copilot-dl-news: `node --check tools/maintenance/phase-1-add-normalized-tables.js` passed.
	- copilot-dl-news: `node --check tools/migrations/phase-2-enable-dual-write.js` passed.
	- copilot-dl-news: focused scan of those two tools for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, `CREATE TABLE`, `INSERT INTO`, `SELECT`, `UPDATE`, `DELETE FROM`, `ensureDatabase`, `ensureDb`, and `openDatabase` returned no matches.
	- copilot-dl-news: broad active-path scan now reports `1076` matches, down from `1096`.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; validation used in-memory SQLite fixtures, the DB package build, syntax checks, export smoke checks, and static scans.
- Remaining classified work after this pass:
	- Highest remaining raw-SQL buckets include PostGIS exploration, gazetteer dedupe/ingestion, download/admin verification checks, cloud-crawl scripts, schema-sync, compression tooling, migration/import/validator compatibility modules, and remaining generated/migration-only artifacts.
	- Shared SQLite/Postgres import/export/migration APIs still need staged design and implementation so both backends can be interchangeable for normal callers and side by side for migration/export/import verification.

## 2026-05-11 Continuation: PostGIS Explorer Tooling

- Added `news-crawler-db/src/db/postgres/access/postgisExplorer.ts` with DB-owned PostGIS explorer contracts:
	- PostGIS connection config normalization,
	- pg client creation,
	- country listing,
	- country detail lookup,
	- ADM1 region lookup,
	- GeoJSON feature collection lookup with admin-area fallback,
	- database stats,
	- place search.
- Migrated `tools/dev/postgis-explore.js` into a presentation-only CLI wrapper. It now keeps argument parsing, console table formatting, and GeoJSON file writing locally while delegating connection and PostGIS queries to `news-crawler-db`.
- Fixed existing Postgres export usability in `news-crawler-db/src/db/postgres/access/postgresV1-pgPool.ts` by removing `createRequire(import.meta.url)`. The previous compiled CommonJS output contained `import.meta`, which made `createPostgresPool` and `normalizePostgresPoolOptions` appear as undefined to CommonJS consumers.
- Added focused fake-client coverage in `news-crawler-db/src/db/__tests__/unit/postgres/postgisExplorer.test.ts` for config defaults, country listing, country/ADM1 lookups, GeoJSON fallback, stats, and place search without connecting to a live PostGIS database.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/postgres/postgisExplorer.test.ts src/db/__tests__/unit/postgres/postgresV1Compat.test.ts` passed, 2 files / 10 tests. The known legacy news-source bootstrap warning still appears from copied seeder compatibility code.
	- news-crawler-db: `npm run build` passed.
	- news-crawler-db/copilot smoke: `require('news-crawler-db')` exposes `createPostgresPool`, `normalizePostgresPoolOptions`, `createPostgisExplorerAccess`, `createPostgisExplorerClient`, `normalizePostgisExplorerConfig`, and `applyNormalizedPhase1Schema` as functions after build.
	- copilot-dl-news: `node --check tools/dev/postgis-explore.js` passed.
	- copilot-dl-news: focused scan of `tools/dev/postgis-explore.js` for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, `CREATE TABLE`, `INSERT INTO`, `SELECT`, `UPDATE`, `DELETE FROM`, `client.query`, `pool.query`, and `require('pg')` returned no matches.
	- news-crawler-db: focused scan of the changed Postgres modules and built JS for `import.meta` and `createRequire` returned no matches.
	- copilot-dl-news: broad active-path scan now reports `1053` matches, down from `1076`.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db` or a live PostGIS database; validation used fake pg clients, syntax checks, the DB package build, export smoke checks, and static scans.
- Remaining classified work after this pass:
	- Highest remaining raw-SQL buckets include gazetteer dedupe/ingestion, download/admin verification checks, cloud-crawl scripts, schema-sync, compression tooling, migration/import/validator compatibility modules, and remaining generated/migration-only artifacts.

## 2026-05-11 Continuation: Classification And Task Status Migration Tooling

- Added `news-crawler-db/src/db/sqlite/access/legacy-classificationMigrations.ts` with DB-owned migration operations for:
	- `classification_types` schema creation,
	- known classification seed rows,
	- additional classification discovery from `content_analysis`,
	- classification type summary/usage reporting,
	- URL classification table/index schema application,
	- URL classification migration record insertion, rollback, applied-state checks, and table listing.
- Migrated copilot wrappers:
	- `tools/migrations/add-classification-types.js`
	- `tools/migrations/add-url-classification-tables.js`
- Added `news-crawler-db/src/db/sqlite/access/legacy-backgroundTaskStatusMigration.ts` with DB-owned background task status constraint migration operations:
	- schema inspection,
	- already-updated detection,
	- transactional table rewrite preserving rows,
	- index recreation,
	- missing-table reporting.
- Migrated `tools/migrations/update-task-status-constraint.js` into a no-SQL CLI wrapper around the DB-owned migration.
- Added focused coverage:
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacyClassificationMigrations.test.ts`
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacyBackgroundTaskStatusMigration.test.ts`
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyClassificationMigrations.test.ts src/db/__tests__/unit/sqlite/legacyBackgroundTaskStatusMigration.test.ts` passed, 2 files / 7 tests. The known legacy news-source bootstrap warning still appears from copied seeder compatibility code.
	- news-crawler-db: `npm run build` passed.
	- news-crawler-db/copilot smoke: `require('news-crawler-db')` exposes `runClassificationTypesMigration`, `applyUrlClassificationTablesMigration`, `migrateBackgroundTaskStatusConstraint`, and `isBackgroundTaskStatusConstraintUpdated` as functions after build.
	- copilot-dl-news: `node --check tools/migrations/add-classification-types.js tools/migrations/add-url-classification-tables.js tools/migrations/update-task-status-constraint.js` passed.
	- copilot-dl-news: focused scan of those three tools for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, `CREATE TABLE`, `INSERT INTO`, `SELECT`, `UPDATE`, `DELETE FROM`, `ensureDatabase`, `ensureDb`, and `openDatabase` returned no matches.
	- copilot-dl-news: broad active-path scan now reports `1012` matches, down from `1053`.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; validation used in-memory SQLite fixtures, syntax checks, the DB package build, export smoke checks, and static scans.
- Remaining classified work after this pass:
	- Highest remaining raw-SQL buckets include gazetteer dedupe/ingestion, download/admin verification checks, cloud-crawl scripts, schema-sync, compression tooling, import/validator compatibility modules, and remaining generated/migration-only artifacts.

## 2026-05-11 Continuation: Gazetteer Dedupe And Historical Names Tooling

- Extended `news-crawler-db/src/db/sqlite/access/legacy-gazetteer-deduplication.ts` with DB-owned operations for:
	- listing duplicate gazetteer clusters,
	- collecting candidate richness/relationship data for conflict scoring,
	- merging duplicate place rows into a survivor.
- Added `news-crawler-db/src/db/sqlite/access/legacy-gazetteer-historicalNames.ts` with DB-owned historical-name ingestion operations for:
	- finding places by Wikidata QID,
	- finding current-name/country matches,
	- linking existing places to Wikidata,
	- creating Wikidata-backed places with canonical names,
	- inserting or updating historical place names.
- Migrated copilot wrappers into no-SQL orchestration/presentation callers:
	- `tools/gazetteer-dedupe.js`
	- `tools/gazetteer/ingest-historical-names.js`
- Added focused in-memory coverage:
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacyGazetteerDedupeTool.test.ts`
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacyGazetteerHistoricalNames.test.ts`
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyGazetteerHistoricalNames.test.ts src/db/__tests__/unit/sqlite/legacyGazetteerDedupeTool.test.ts` passed, 2 files / 7 tests. The known legacy news-source bootstrap warning still appears from copied seeder compatibility code.
	- news-crawler-db: `npm run build` passed.
	- news-crawler-db/copilot smoke: `require('news-crawler-db')` resolves to `../news-crawler-db/dist/db/index.js` and exposes `listGazetteerDuplicateClusters`, `getGazetteerDedupeCandidates`, `mergeGazetteerDedupePlaces`, `findOrLinkHistoricalNamePlace`, `createHistoricalNameWikidataPlace`, and `ingestHistoricalPlaceNameForPlace` as functions after build.
	- copilot-dl-news: `node --check tools/gazetteer-dedupe.js && node --check tools/gazetteer/ingest-historical-names.js` passed.
	- copilot-dl-news: focused scan of those two tools for `ensureDatabase`, `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, `CREATE TABLE`, `INSERT INTO`, `SELECT`, `UPDATE`, `DELETE FROM`, and `openDatabase` returned `no direct DB/SQL matches`.
	- copilot-dl-news: broad active-path scan now reports `980` matches, down from `1012`.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db` or `data/gazetteer.db`; validation used in-memory SQLite fixtures, syntax checks, the DB package build, export smoke checks, and static scans.
- Remaining classified work after this pass:
	- Highest remaining raw-SQL buckets include download/admin verification checks, cloud-crawl scripts, schema-sync, compression tooling, import/validator compatibility modules, and remaining generated/migration-only artifacts.

## 2026-05-11 Continuation: Active Download/Admin Check Fixtures

- Extended DB-owned compatibility modules with explicit in-memory check fixture helpers:
	- `createDownloadVerificationCheckFixture` in `news-crawler-db/src/db/sqlite/access/legacy-downloadEvidence.ts`.
	- `createAdminDashboardCheckFixture` in `news-crawler-db/src/db/sqlite/access/legacy-adminAdapter.ts`.
- Migrated active copilot checks to stop creating tables or inserting fixture rows locally:
	- `src/ui/server/unifiedApp/checks/download-verification.check.js`.
	- `src/ui/server/adminDashboard/checks/admin-dashboard.check.js`.
- Updated compatibility wrappers:
	- `src/data/db/queries/downloadEvidence.js`.
	- `src/data/db/sqlite/v1/queries/adminAdapter.js`.
- Added focused in-memory coverage:
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacyCheckFixtures.test.ts`.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyCheckFixtures.test.ts src/db/__tests__/unit/sqlite/legacyGazetteerHistoricalNames.test.ts src/db/__tests__/unit/sqlite/legacyGazetteerDedupeTool.test.ts` passed, 3 files / 9 tests. The known legacy news-source bootstrap warning still appears from copied seeder compatibility code.
	- news-crawler-db: `npm run build` passed.
	- news-crawler-db/copilot smoke: `require('news-crawler-db')` resolves to `../news-crawler-db/dist/db/index.js` and exposes `createDownloadVerificationCheckFixture`, `createAdminDashboardCheckFixture`, `findOrLinkHistoricalNamePlace`, `createHistoricalNameWikidataPlace`, and `ingestHistoricalPlaceNameForPlace` as functions after build.
	- copilot-dl-news: `node --check src/ui/server/unifiedApp/checks/download-verification.check.js && node --check src/ui/server/adminDashboard/checks/admin-dashboard.check.js && node --check src/data/db/queries/downloadEvidence.js && node --check src/data/db/sqlite/v1/queries/adminAdapter.js` passed.
	- copilot-dl-news: `node src/ui/server/unifiedApp/checks/download-verification.check.js` passed against an in-memory DB fixture.
	- copilot-dl-news: `node src/ui/server/adminDashboard/checks/admin-dashboard.check.js` passed against an in-memory DB fixture.
	- copilot-dl-news: focused scan of those two check files and two compatibility wrappers for `ensureDatabase`, `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, `CREATE TABLE`, `INSERT INTO`, `SELECT`, `UPDATE`, `DELETE FROM`, and `openDatabase` returned `no direct DB/SQL matches`.
	- copilot-dl-news: broad active-path scan now reports `950` matches, down from `980`.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; validation used in-memory SQLite fixtures, syntax checks, the DB package build, export smoke checks, and static scans.
- Remaining classified work after this pass:
	- Highest remaining raw-SQL buckets include `tools/crawl/cloud-crawl-e2e.js`, downloads/dev tools (`tools/dev/downloads-bar-chart-server.js`, `tools/dev/db-downloads.js`), `tools/schema/schema-sync.js`, compression tooling, migration/import/validator compatibility modules, and remaining generated/migration-only artifacts.

## 2026-05-11 Continuation: Cloud Crawl And Downloads Dev Tooling

- Extended `news-crawler-db/src/db/sqlite/access/legacy-downloadEvidence.ts` with named read models for:
	- recent downloads,
	- today/hourly download stats,
	- global download summaries,
	- per-host download summaries,
	- minute-level download timelines,
	- URL evidence plus history bundles,
	- downloads bar-chart daily/cumulative series,
	- cloud-crawl e2e database snapshots,
	- cloud-crawl e2e recent evidence windows.
- Migrated copilot operational tooling to delegate DB reads:
	- `tools/dev/db-downloads.js`.
	- `tools/dev/downloads-bar-chart-server.js`.
	- `tools/crawl/cloud-crawl-e2e.js`.
	- `src/data/db/queries/downloadEvidence.js`.
- Added focused in-memory coverage:
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacyDownloadTooling.test.ts`.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyDownloadTooling.test.ts src/db/__tests__/unit/sqlite/legacyCheckFixtures.test.ts` passed, 2 files / 7 tests. The known legacy news-source bootstrap warning still appears from copied seeder compatibility code.
	- news-crawler-db: `npm run build` passed.
	- news-crawler-db/copilot smoke: `require('news-crawler-db')` resolves to `../news-crawler-db/dist/db/index.js` and exposes `listRecentDownloads`, `getTodayDownloadStats`, `getDownloadGlobalSummary`, `listDownloadHosts`, `listDownloadTimelineByMinute`, `getUrlDownloadEvidenceBundle`, `getDailyDownloadBars`, `getCloudCrawlDatabaseSnapshot`, and `getCloudCrawlRecentEvidence` as functions after build.
	- copilot-dl-news: `node --check tools/crawl/cloud-crawl-e2e.js && node --check tools/dev/db-downloads.js && node --check tools/dev/downloads-bar-chart-server.js && node --check src/data/db/queries/downloadEvidence.js` passed.
	- copilot-dl-news: focused scan of the three migrated tools and download-evidence wrapper for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, `CREATE TABLE`, `INSERT INTO`, `SELECT`, `UPDATE`, `DELETE FROM`, `client.query`, `pool.query`, and `require('pg')` returned `no direct DB/SQL matches`.
	- copilot-dl-news: `node tools/dev/db-downloads.js --help` passed without opening the live DB.
	- copilot-dl-news: `node tools/dev/downloads-bar-chart-server.js --help` passed without opening the live DB.
	- copilot-dl-news: `node tools/crawl/cloud-crawl-e2e.js --dry-run --artifact-dir tmp/cloud-crawl-e2e-dry-run --json` passed without DB or network work and produced `{ ok: true, mode: "dry-run", hasPlan: true, hasArtifact: true }`.
	- copilot-dl-news: broad active-path scan now reports `910` matches, down from `950`.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; validation used in-memory SQLite fixtures, syntax checks, the DB package build, export smoke checks, static scans, help-mode CLI checks, and a cloud-crawl dry run.
- Remaining classified work after this pass:
	- Highest remaining raw-SQL buckets include `tools/schema/schema-sync.js`, `tools/migrations/test-migration-schema.js`, `tools/dev/backup-place-hubs.js`, `tools/corrections/fix-article-place-relations.js`, compression tooling, `src/data/db/migration/*`, `src/data/db/DualDatabaseFacade.js`, `tools/crawl/crawl-remote.js`, and smaller active/dev utilities.

## 2026-05-11 Continuation: Schema Sync Tooling

- Added `news-crawler-db/src/db/sqlite/access/legacy-schemaSync.ts` with DB-owned schema-sync contracts:
	- SQLite schema object extraction,
	- table row-count collection,
	- idempotent generated schema-definition text,
	- schema stats JSON generation,
	- timestamp-insensitive drift hashing.
- Migrated `tools/schema/schema-sync.js` into a CLI/file-orchestration wrapper around `news-crawler-db`; it no longer queries `sqlite_master`, prepares statements, or owns generated schema contract text.
- Added focused in-memory coverage:
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacySchemaSync.test.ts`.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacySchemaSync.test.ts` passed, 1 file / 3 tests. The known legacy news-source bootstrap warning still appears from copied seeder compatibility code.
	- news-crawler-db: `npm run build` passed.
	- news-crawler-db/copilot smoke: `require('news-crawler-db')` resolves to `../news-crawler-db/dist/db/index.js` and exposes `extractSqliteSchema`, `getSqliteSchemaRowCounts`, `generateSqliteSchemaDefinitions`, `generateSqliteSchemaStats`, and `getSchemaSyncContentHash` as functions after build.
	- copilot-dl-news: `node --check tools/schema/schema-sync.js` passed.
	- copilot-dl-news: focused scan of `tools/schema/schema-sync.js` for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, `CREATE TABLE`, `INSERT INTO`, `SELECT`, `UPDATE`, and `DELETE FROM` returned `no direct DB/SQL matches`.
	- copilot-dl-news: `node tools/schema/schema-sync.js --help` passed without opening the live DB.
	- copilot-dl-news: broad active-path scan now reports `898` matches, down from `910`.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; validation used in-memory SQLite fixtures, syntax checks, the DB package build, export smoke checks, static scans, and help-mode CLI checks.
- Remaining classified work after this pass:
	- Highest remaining raw-SQL buckets include `tools/migrations/test-migration-schema.js`, `tools/dev/backup-place-hubs.js`, `tools/corrections/fix-article-place-relations.js`, compression tooling, `src/data/db/migration/*`, `src/data/db/DualDatabaseFacade.js`, `tools/crawl/crawl-remote.js`, `tools/migrations/seed-topics-and-skip-terms.js`, `tools/dev/url-classifications-export.js`, `tools/dev/place-hub-discover.js`, `tools/dev/db-clone-gazetteer.js`, and `checks/search-service.check.js`.

## 2026-05-11 Continuation: Schema Metadata, Redacted Export, Visual Diff, Query Telemetry, Diagnostics, And Rate-Limit Analysis

- Added DB-owned compatibility/access modules in `news-crawler-db`:
	- `legacy-schemaMetadata.ts` for schema metadata table/fingerprint/critical-table checks.
	- `legacy-redactExport.ts` for redacted snapshot preparation (`fetches`, optional URL columns).
	- `visualDiff.ts` for visual-diff page lookups and review queues.
	- `queryTelemetry.ts` for query telemetry writes, stats/recent reads, and statement instrumentation wrappers.
	- `diagnosticReports.ts` for document-count, gazetteer summary, and content-compression diagnostic reports.
	- `legacy-rateLimitAnalysis.ts` for 429/rate-limit analysis read models.
- Migrated copilot files into no-SQL wrappers/callers:
	- `src/data/db/sqlite/v1/schemaMetadata.js`.
	- `src/data/db/sqlite/queries/schema.js`.
	- `scripts/db/redact-export.js`.
	- `src/ui/server/visualDiff/server.js`.
	- `src/data/db/queryTelemetry.js`.
	- `src/data/db/sqlite/v1/instrumentation.js`.
	- `src/data/db/sqlite/v1/instrumentedDb.js`.
	- `tools/checks/check-doc-counts.js`.
	- `tools/gazetteer/gazetteer-summary.js`.
	- `tools/debug/check-compression-stats.js`.
	- `src/data/db/sqlite/queries/rateLimitAnalysis.js`.
- Added focused in-memory coverage:
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacySchemaMetadataInspection.test.ts`.
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacyRedactExport.test.ts`.
	- `news-crawler-db/src/db/__tests__/unit/sqlite/visualDiff.test.ts`.
	- `news-crawler-db/src/db/__tests__/unit/sqlite/queryTelemetry.test.ts`.
	- `news-crawler-db/src/db/__tests__/unit/sqlite/diagnosticReports.test.ts`.
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacyRateLimitAnalysis.test.ts`.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacySchemaMetadataInspection.test.ts src/db/__tests__/unit/sqlite/legacyRedactExport.test.ts src/db/__tests__/unit/sqlite/visualDiff.test.ts src/db/__tests__/unit/sqlite/queryTelemetry.test.ts src/db/__tests__/unit/sqlite/diagnosticReports.test.ts src/db/__tests__/unit/sqlite/legacyRateLimitAnalysis.test.ts` passed, 6 files / 17 tests. The known legacy news-source bootstrap warning still appears from copied seeder compatibility code.
	- news-crawler-db: `npm run build` passed.
	- news-crawler-db/copilot smoke: `require('/mnt/c/Users/james/Documents/repos/news-crawler-db/dist/db')` exposes `createSqliteVisualDiffAccess`, `recordQuery`, `wrapWithTelemetry`, `listDocumentCountsByEnabledWebsite`, `getContentCompressionDiagnosticReport`, `RateLimitAnalysisQueries`, `prepareRedactedExportSnapshotDb`, and `shouldUseFastPath` as functions after build.
	- copilot-dl-news: `node --check` passed for all 11 migrated copilot files listed above.
	- copilot-dl-news: focused scan of those 11 migrated files for `.prepare`, `.exec`, `.pragma`, `sqlite_master`, and common SQL statement/table patterns returned `no direct DB/SQL matches`.
	- copilot-dl-news: broad active-path scan now reports `601` matches, down from `665`.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; validation used in-memory SQLite fixtures, syntax checks, the DB package build, export smoke checks, and static scans.
- Remaining classified work after this pass:
	- Highest remaining raw-SQL buckets include `checks/analytics-dashboard.check.js`, analysis maintenance, gazetteer normalization, compression migration utilities, schema-sync Postgres tooling, smaller place-hub dev probes, webhook/unified app dev utilities, active debug helpers, generated/deploy SQL artifacts, and migration-only files that still need explicit classification or targeted DB APIs.

## 2026-05-11 Continuation: Analytics Fixtures, Country Normalization, Analysis Maintenance, Compression Cleanup, And FTS Backfill

- Migrated another active tool/check cluster into DB-owned named APIs without running validation against `data/news.db`.
- Added DB-owned APIs in `news-crawler-db`:
	- `createAnalyticsDashboardCheckFixture` for the analytics dashboard check's in-memory schema/data setup.
	- `listCountryCanonicalNameMismatches` and `updateCountryCanonicalNamesToEnglish` for gazetteer country canonical-name normalization.
	- `analysisMaintenanceTableExists`, current-analysis/version stats readers, compression status readers, and `collectAnalysisMaintenanceSnapshot`/`collectCurrentAnalysisVersionReport`.
	- Compression cleanup helpers for brotli compression-type lookup, uncompressed `content_storage` row selection, and update result persistence.
	- FTS backfill helpers for runtime pragmas, content-analysis column inspection, candidate article selection, and backfill updates.
- Migrated copilot files into no-SQL callers/wrappers:
	- `checks/analytics-dashboard.check.js`.
	- `tools/gazetteer/normalize-country-names.js`.
	- `tools/maintenance/analysis-maintenance-cycle.js`.
	- `tools/maintenance/current-analysis-version.js`.
	- `tools/compression/migrate-legacy-content.js`.
	- `tools/compression/compress-uncompressed-records.js`.
	- `tools/analysis/fts-backfill.js`.
- Added or extended focused in-memory coverage:
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacyCheckFixtures.test.ts`.
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacyGazetteerNormalizeCountryNames.test.ts`.
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacyAnalysisMaintenance.test.ts`.
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacyCompressionTooling.test.ts`.
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacyFtsBackfill.test.ts`.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyCheckFixtures.test.ts src/db/__tests__/unit/sqlite/legacyGazetteerNormalizeCountryNames.test.ts src/db/__tests__/unit/sqlite/legacyAnalysisMaintenance.test.ts src/db/__tests__/unit/sqlite/legacyCompressionTooling.test.ts src/db/__tests__/unit/sqlite/legacyFtsBackfill.test.ts` passed, 5 files / 14 tests. The known legacy news-source bootstrap warning still appears from copied seeder compatibility code.
	- news-crawler-db: `npm run build` passed.
	- news-crawler-db/copilot smoke: `require('/mnt/c/Users/james/Documents/repos/news-crawler-db/dist/db')` exposes `createAnalyticsDashboardCheckFixture`, `listCountryCanonicalNameMismatches`, `updateCountryCanonicalNamesToEnglish`, `collectAnalysisMaintenanceSnapshot`, `collectCurrentAnalysisVersionReport`, `getBrotliLevel6Window22CompressionType`, `listUncompressedContentStorageRecords`, `updateContentStorageCompressionCleanupResult`, `listFtsBackfillArticlesNeedingBackfill`, and `updateFtsBackfillArticles` as functions after build.
	- copilot-dl-news: `node --check` passed for all seven migrated copilot files listed above.
	- copilot-dl-news: focused scan of those seven migrated files for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, `CREATE TABLE`, `INSERT INTO`, `SELECT`, `UPDATE`, and `DELETE FROM` returned `no direct DB/SQL matches`.
	- copilot-dl-news: `node checks/analytics-dashboard.check.js` passed against an in-memory DB fixture, 17 checks passed / 0 failed. Only existing jsgui deprecation warnings appeared.
	- copilot-dl-news: broad active-path scan now reports `554` matches, down from `601`.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; validation used in-memory SQLite tests in `news-crawler-db`, syntax/static checks, the DB package build, an export smoke check, and the analytics dashboard's in-memory check fixture.
- Remaining classified work after this pass:
	- Highest remaining raw-SQL buckets include generated/deploy SQL artifacts, schema-sync Postgres tooling, migration-only schema scripts, backup/fix utilities not yet classified, smaller place-hub dev probes, webhook/unified app dev utilities, active debug helpers, and remaining generated/deprecated/test-only files that still need explicit classification or targeted DB APIs.

## 2026-05-11 Continuation: Postgres Schema Sync, NDJSON Migration Exporter, And Basic DB Check

- Migrated the Postgres schema-sync translator, legacy NDJSON migration exporter, and basic maintenance DB check into `news-crawler-db` named APIs.
- Added or extended DB-owned APIs in `news-crawler-db`:
	- Postgres schema-sync translation helpers: `translateSqliteColumnTypeToPostgres`, `translateSqliteCreateTableToPostgres`, `translateSqliteSchemaToPostgresSchema`, `extractPostgresSchemaFromSqliteDb`, and `generatePostgresSchemaDefinitions`.
	- `LegacyNdjsonDatabaseExporter` for the historical migration/exporter contract used by `src/data/db/migration/orchestrator.js`.
	- `db.maintenance.getBasicDatabaseCheckSnapshot` for table listing, key table counts, and sample article title lookup.
- Migrated copilot files into no-SQL callers/wrappers:
	- `tools/schema/schema-sync-postgres.js`.
	- `src/data/db/migration/exporter.js`.
	- `tools/maintenance/check-db.js`.
- Added or extended focused in-memory coverage:
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacySchemaSync.test.ts`.
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacyDataMigration.test.ts`.
	- `news-crawler-db/src/db/__tests__/unit/sqlite/maintenance.test.ts`.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacySchemaSync.test.ts src/db/__tests__/unit/sqlite/legacyDataMigration.test.ts src/db/__tests__/unit/sqlite/maintenance.test.ts` passed, 3 files / 9 tests. The known legacy news-source bootstrap warning still appears from copied seeder compatibility code.
	- news-crawler-db: `npm run build` passed.
	- news-crawler-db/copilot smoke: `require('/mnt/c/Users/james/Documents/repos/news-crawler-db/dist/db')` exposes `extractPostgresSchemaFromSqliteDb`, `generatePostgresSchemaDefinitions`, `translateSqliteCreateTableToPostgres`, `LegacyNdjsonDatabaseExporter`, and `createDbAdapter` as functions after build; `createDbAdapter({ type: 'sqlite', path: ':memory:' }).maintenance.getBasicDatabaseCheckSnapshot` is also a function.
	- copilot-dl-news: `node --check tools/schema/schema-sync-postgres.js && node --check src/data/db/migration/exporter.js && node --check tools/maintenance/check-db.js` passed.
	- copilot-dl-news: focused scan of those three migrated files for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, `information_schema`, `CREATE TABLE`, `INSERT INTO`, `SELECT`, `UPDATE`, `DELETE FROM`, `client.query`, `pool.query`, and `require('pg')` returned `no direct DB/SQL matches`.
	- copilot-dl-news: `node tools/schema/schema-sync-postgres.js --help` passed without opening the live DB.
	- copilot-dl-news: broad active-path scan now reports `536` matches, down from `554`.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; validation used in-memory SQLite tests in `news-crawler-db`, syntax/static checks, the DB package build, an export smoke check, and a help-mode CLI check.
- Remaining classified work after this pass:
	- Highest remaining raw-SQL buckets include generated/deploy SQL artifacts, migration-only schema scripts, smaller place-hub dev probes, webhook/unified app dev utilities, active debug helpers, `EnhancedDatabaseAdapter` coverage bridging, and remaining generated/deprecated/test-only files that still need explicit classification or targeted DB APIs.

## 2026-05-11 Continuation: Place-Hub Active Probe And Discovered-Hub Ingest

- Migrated the active place-hub probing/dev ingest DB reads and writes into the existing `news-crawler-db` place-hub discovery access module. Copilot still owns URL generation, network probing, JSON-file parsing, matching heuristics, and console output.
- Added DB-owned APIs in `news-crawler-db`:
	- `listPreferredCountryPlacesForActiveHubProbe`.
	- `listMissingPreferredCountryPlacesForActiveHubProbe`.
	- `listExistingPlacePageMappingUrlsForHost`.
	- `upsertPlaceHubActiveProbeMappings`.
	- `listPlaceNamesForDiscoveredHubIngest`.
	- `listPlacePageMappingKeysForHost`.
	- `insertVerifiedDiscoveredPlaceHubMappings`.
- Migrated copilot files into no-SQL callers:
	- `tools/dev/place-hub-active-probe.js`.
	- `tools/dev/place-hub-active-probe-gap-fill.js`.
	- `tools/dev/ingest-discovered-hubs.js`.
- Extended focused in-memory coverage:
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacyPlaceHubDiscoverTool.test.ts`.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyPlaceHubDiscoverTool.test.ts` passed, 1 file / 5 tests. The known legacy news-source bootstrap warning still appears from copied seeder compatibility code.
	- news-crawler-db: `npm run build` passed.
	- news-crawler-db/copilot smoke: `require('/mnt/c/Users/james/Documents/repos/news-crawler-db/dist/db')` exposes `listPreferredCountryPlacesForActiveHubProbe`, `listMissingPreferredCountryPlacesForActiveHubProbe`, `listExistingPlacePageMappingUrlsForHost`, `upsertPlaceHubActiveProbeMappings`, `listPlaceNamesForDiscoveredHubIngest`, `listPlacePageMappingKeysForHost`, and `insertVerifiedDiscoveredPlaceHubMappings` as functions after build.
	- copilot-dl-news: `node --check tools/dev/place-hub-active-probe.js && node --check tools/dev/place-hub-active-probe-gap-fill.js && node --check tools/dev/ingest-discovered-hubs.js` passed.
	- copilot-dl-news: focused scan of those three migrated files for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, `CREATE TABLE`, `INSERT INTO`, `SELECT`, `UPDATE`, `DELETE FROM`, `client.query`, `pool.query`, and `require('pg')` returned `no direct DB/SQL matches`.
	- copilot-dl-news: `node tools/dev/ingest-discovered-hubs.js --help` passed without opening the live DB.
	- copilot-dl-news: broad active-path scan now reports `518` matches, down from `536`.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; validation used in-memory SQLite tests in `news-crawler-db`, syntax/static checks, the DB package build, an export smoke check, and a help-mode CLI check. No network probe tools were executed.
- Remaining classified work after this pass:
	- Highest remaining raw-SQL buckets include generated/deploy SQL artifacts, migration-only schema scripts, webhook/unified app dev utilities, active debug helpers, `EnhancedDatabaseAdapter` coverage bridging, geo/gazetteer list/export utilities, and remaining generated/deprecated/test-only files that still need explicit classification or targeted DB APIs.

## 2026-05-11 Continuation: Webhook Bridge, Storage Failure Diagnostics, Layout Migration, And Regional Sources

- Migrated another active utility cluster into DB-owned named APIs and thin copilot callers.
- Added or extended DB-owned APIs in `news-crawler-db`:
	- `createAsyncSqliteIntegrationDb` and `createIntegrationAdapterFromSqliteHandle` for webhook/integration adapter initialization from a SQLite handle.
	- `listSampleStorageFailuresForHost`, `countPlaceholderContentStorageRecords`, and `getStorageFailureAnalysisSnapshot` for the storage failure debug tool.
	- `runLayoutTemplatesAndMasksMigration` for the `layout_templates`/`layout_masks` schema migration.
	- `listExistingNewsWebsiteParentDomains`, `planRegionalNewsSources`, `insertRegionalNewsSources`, and `countNewsWebsites` for regional news-source migration planning/insertion.
- Migrated copilot files into no-SQL callers/wrappers:
	- `src/ui/server/webhookDashboard/server.js`.
	- `src/data/db/sqlite/v1/queries/integrationAdapter.js`.
	- `tools/debug/analyze_failures.js`.
	- `tools/migrations/add-layout-templates-and-masks.js`.
	- `tools/migrations/add-regional-news-sources.js`.
- Added or extended focused in-memory coverage:
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacyAdaptersBatch2.test.ts`.
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacyContentStorageDiagnostics.test.ts`.
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacyLayoutAndUiQueries.test.ts`.
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacyNewsSourcesSeeder.test.ts`.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyAdaptersBatch2.test.ts src/db/__tests__/unit/sqlite/legacyContentStorageDiagnostics.test.ts` passed, 2 files / 14 tests. The known legacy news-source bootstrap warning still appears from copied seeder compatibility code.
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyLayoutAndUiQueries.test.ts src/db/__tests__/unit/sqlite/legacyNewsSourcesSeeder.test.ts` passed, 2 files / 5 tests. The known bootstrap warning appeared.
	- news-crawler-db: `npm run build` passed.
	- news-crawler-db/copilot smoke: `require('/mnt/c/Users/james/Documents/repos/news-crawler-db/dist/db')` exposes `runLayoutTemplatesAndMasksMigration`, `planRegionalNewsSources`, `insertRegionalNewsSources`, `countNewsWebsites`, `createIntegrationAdapterFromSqliteHandle`, and `getStorageFailureAnalysisSnapshot` as functions after build.
	- copilot-dl-news: `node --check` passed for all five migrated copilot files listed above.
	- copilot-dl-news: focused scan of those five migrated files for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, `CREATE TABLE`, `INSERT INTO`, `SELECT`, `UPDATE`, `DELETE FROM`, `client.query`, `pool.query`, and `require('pg')` returned `no direct DB/SQL matches`.
	- copilot-dl-news: broad active-path scan now reports `495` matches, down from `518`.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; validation used in-memory SQLite tests in `news-crawler-db`, syntax/static checks, the DB package build, and an export smoke check.
- Remaining classified work after this pass:
	- Highest remaining raw-SQL buckets include generated/deploy SQL artifacts, `EnhancedDatabaseAdapter` coverage bridging, `geo-import-alternates` in-memory check fixture setup, maintenance view/schema utilities, page/gazetteer export utilities, active debug/analysis helper scripts, and remaining generated/deprecated/test-only files that still need explicit classification or targeted DB APIs.

## 2026-05-11 Continuation: Maintenance Compatibility Views And Content-Storage Schema Snapshot

- Migrated the active maintenance view/schema utility cluster into DB-owned named APIs and presentation-only copilot scripts.
- Added DB-owned APIs in `news-crawler-db`:
	- `db.maintenance.createPlacesCompatibilityView`.
	- `db.maintenance.createFetchesCompatibilityView`.
	- `db.maintenance.getContentStorageSchemaSnapshot`.
	- Root exports for `createPlacesCompatibilityView`, `createFetchesCompatibilityView`, and `getContentStorageSchemaSnapshot`.
- Migrated copilot files into no-SQL callers:
	- `tools/maintenance/create-places-view.js`.
	- `tools/maintenance/create-fetches-view.js`.
	- `tools/maintenance/check_schema.js`.
- Added focused in-memory coverage:
	- `news-crawler-db/src/db/__tests__/unit/sqlite/maintenanceCompatibilityViews.test.ts`.
	- Extended the typed maintenance access surface covered alongside `news-crawler-db/src/db/__tests__/unit/sqlite/maintenance.test.ts`.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/maintenanceCompatibilityViews.test.ts src/db/__tests__/unit/sqlite/maintenance.test.ts` passed, 2 files / 4 tests.
	- news-crawler-db: `npm run build` passed.
	- copilot-dl-news: `node --check tools/maintenance/create-places-view.js && node --check tools/maintenance/create-fetches-view.js && node --check tools/maintenance/check_schema.js` passed.
	- copilot-dl-news: focused scan of those three migrated files for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, `CREATE TABLE`, `CREATE VIEW`, `DROP VIEW`, `INSERT INTO`, `SELECT`, `UPDATE`, `DELETE FROM`, and `PRAGMA` returned no matches.
	- copilot-dl-news: broad active-path scan now reports `480` matches, down from `495`.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; validation used in-memory SQLite tests in `news-crawler-db`, syntax/static checks, and the DB package build.
- Remaining classified work after this pass:
	- Highest remaining raw-SQL buckets include generated/deploy SQL artifacts, `EnhancedDatabaseAdapter` coverage bridging, `geo-import-alternates` in-memory check fixture setup, page/gazetteer export utilities, active debug/analysis helper scripts, and remaining generated/deprecated/test-only files that still need explicit classification or targeted DB APIs.

## 2026-05-11 Continuation: GeoImport Alternate-Names Check

- Migrated the active `geo-import-alternates` in-memory check off local schema/fixture/query SQL.
- Added DB-owned APIs in `news-crawler-db`:
	- `db.geoImport.ensureGeoImportCoreSchema`.
	- `db.geoImport.insertGeoImportPlace`.
	- `db.geoImport.linkGeoImportExternalId`.
	- `db.geoImport.importGeoNamesAlternateNameRows`.
	- `db.geoImport.listGeoImportPlaceNamesForPlace`.
	- Root exports for the same helpers.
- Kept copilot orchestration and parsing in `src/services/GeoImportService.js` by adding `importAlternateNames`, which reads the alternate-names file and delegates batch DB writes to `news-crawler-db`.
- Migrated copilot files into no-SQL callers:
	- `checks/geo-import-alternates.check.js`.
	- `src/services/GeoImportService.js`.
- Extended focused in-memory coverage:
	- `news-crawler-db/src/db/__tests__/unit/sqlite/geoImport.test.ts`.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/geoImport.test.ts` passed, 1 file / 4 tests.
	- news-crawler-db: `npm run build` passed.
	- copilot-dl-news: `node --check checks/geo-import-alternates.check.js && node --check src/services/GeoImportService.js` passed.
	- copilot-dl-news: focused scan of those two migrated files for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, `CREATE TABLE`, `CREATE VIEW`, `DROP VIEW`, `INSERT INTO`, `SELECT`, `UPDATE`, `DELETE FROM`, `PRAGMA`, and `applySchema` returned no matches.
	- copilot-dl-news: `node checks/geo-import-alternates.check.js` passed against `:memory:` only; it created/imported the temporary fixture and reported 6 processed, 5 inserted, 1 skipped.
	- copilot-dl-news: broad active-path scan now reports `474` matches, down from `480`.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; validation used in-memory SQLite tests in `news-crawler-db`, an in-memory copilot check, syntax/static checks, and the DB package build.
- Remaining classified work after this pass:
	- Highest remaining raw-SQL buckets include generated/deploy SQL artifacts, `EnhancedDatabaseAdapter` coverage bridging, page/gazetteer export utilities, active debug/analysis helper scripts, and remaining generated/deprecated/test-only files that still need explicit classification or targeted DB APIs.

## 2026-05-11 Continuation: Gazetteer Listing Tools

- Migrated the active gazetteer listing CLIs off local query construction and local SQLite imports.
- Added DB-owned read-model APIs in `news-crawler-db`:
	- `getCountryByCode` is now used through the DB package boundary by these tools.
	- `listGazetteerRegionsForCountry`.
	- `listGazetteerCitiesForCountry`.
	- `listGazetteerCapitalCities`.
	- `listGazetteerCountryNames`.
	- `listGazetteerPlaceHubsForDomain`.
- Migrated copilot files into no-SQL callers:
	- `tools/gazetteer/list-regions.js`.
	- `tools/gazetteer/list-cities.js`.
	- `tools/gazetteer/list-capital-cities.js`.
	- `tools/gazetteer/list-place-hubs.js`.
- Added focused in-memory coverage:
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacyGazetteerToolQueries.test.ts`.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyGazetteerToolQueries.test.ts` passed, 1 file / 2 tests. The known legacy news-source bootstrap warning still appears from copied seeder compatibility code.
	- news-crawler-db: `npm run build` passed.
	- copilot-dl-news: `node --check tools/gazetteer/list-regions.js && node --check tools/gazetteer/list-cities.js && node --check tools/gazetteer/list-capital-cities.js && node --check tools/gazetteer/list-place-hubs.js` passed.
	- copilot-dl-news: focused scan of those four migrated files for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, `CREATE TABLE`, `INSERT INTO`, `SELECT`, `UPDATE`, `DELETE FROM`, `ensureDatabase`, and `src/data/db/sqlite` returned no matches.
	- copilot-dl-news: broad active-path scan now reports `458` matches, down from `474`.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; validation used in-memory SQLite tests in `news-crawler-db`, syntax/static checks, and the DB package build.
- Remaining classified work after this pass:
	- Highest remaining raw-SQL buckets include generated/deploy SQL artifacts, `EnhancedDatabaseAdapter` coverage bridging, page/export utilities, active debug/analysis helper scripts, remaining gazetteer export/correction utilities, and remaining generated/deprecated/test-only files that still need explicit classification or targeted DB APIs.

## 2026-05-11 Continuation: Missing Content Storage Debug Snapshot

- Migrated `tools/debug/check_missing_storage.js` from local diagnostic SQL to a named DB-owned snapshot API.
- Added DB-owned APIs in `news-crawler-db`:
	- `listHttpResponsesWithoutStorage`.
	- `listStorageCountsForUrls`.
	- `getMissingContentStorageDebugSnapshot`.
- Migrated copilot file into a no-SQL caller:
	- `tools/debug/check_missing_storage.js`.
- Extended focused in-memory coverage:
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacyContentStorageDiagnostics.test.ts`.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyContentStorageDiagnostics.test.ts` passed, 1 file / 7 tests. The known legacy news-source bootstrap warning still appears from copied seeder compatibility code.
	- news-crawler-db: `npm run build` passed.
	- copilot-dl-news: `node --check tools/debug/check_missing_storage.js` passed.
	- copilot-dl-news: focused scan of `tools/debug/check_missing_storage.js` for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, `CREATE TABLE`, `INSERT INTO`, `SELECT`, `UPDATE`, and `DELETE FROM` returned no matches.
	- copilot-dl-news: broad active-path scan now reports `454` matches, down from `458`.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; validation used in-memory SQLite tests in `news-crawler-db`, syntax/static checks, and the DB package build.
- Remaining classified work after this pass:
	- Highest remaining raw-SQL buckets include generated/deploy SQL artifacts, `EnhancedDatabaseAdapter` coverage bridging, page/export utilities, active debug/analysis helper scripts, remaining gazetteer export/correction utilities, and remaining generated/deprecated/test-only files that still need explicit classification or targeted DB APIs.

## 2026-05-11 Continuation: Schema Maintenance Script Cluster

- Migrated four small schema/maintenance scripts from local SQL to explicit DB-owned operations.
- Added or extended DB-owned APIs in `news-crawler-db`:
	- `db.maintenance.ensurePerformanceIndexes` and root `ensureSqlitePerformanceIndexes`.
	- `SQLITE_PERFORMANCE_INDEX_DEFINITIONS`.
	- `migratePlacesAddWikidataColumns`.
	- `PLACES_WIKIDATA_COLUMNS` and `PLACES_WIKIDATA_INDEXES`.
	- `resetSqlitePlaceHubCandidatesSchema`.
	- Reused existing `fixArticlePlaceRelationsForeignKey`.
- Migrated copilot files into no-SQL callers:
	- `tools/maintenance/create-performance-indexes.js`.
	- `tools/maintenance/fix-foreign-key.js`.
	- `tools/migrations/migrate-places-add-wikidata-columns.js`.
	- `tools/schema/fix-place-candidates-schema.js`.
- Added or extended focused in-memory coverage:
	- `news-crawler-db/src/db/__tests__/unit/sqlite/maintenanceCompatibilityViews.test.ts`.
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacySmallSchemaMigrations.test.ts`.
	- `news-crawler-db/src/db/__tests__/unit/sqlite/placeHubCandidatesStore.test.ts`.
	- Existing article-place relation coverage in `news-crawler-db/src/db/__tests__/unit/sqlite/legacyMigrationMaintenanceUtilities.test.ts`.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/maintenanceCompatibilityViews.test.ts src/db/__tests__/unit/sqlite/legacySmallSchemaMigrations.test.ts src/db/__tests__/unit/sqlite/placeHubCandidatesStore.test.ts src/db/__tests__/unit/sqlite/legacyMigrationMaintenanceUtilities.test.ts` passed, 4 files / 16 tests. The known legacy news-source bootstrap warning still appears from copied seeder compatibility code.
	- news-crawler-db: `npm run build` passed.
	- copilot-dl-news: `node --check tools/maintenance/create-performance-indexes.js && node --check tools/maintenance/fix-foreign-key.js && node --check tools/migrations/migrate-places-add-wikidata-columns.js && node --check tools/schema/fix-place-candidates-schema.js` passed.
	- copilot-dl-news: focused scan of those four migrated files for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, `CREATE TABLE`, `INSERT INTO`, `SELECT`, `UPDATE`, `DELETE FROM`, `ensureDatabase`, `src/data/db/sqlite`, `PRAGMA`, `ALTER TABLE`, `CREATE INDEX`, and `DROP TABLE` returned no matches.
	- copilot-dl-news: broad active-path scan now reports `438` matches, down from `454`.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; validation used in-memory SQLite tests in `news-crawler-db`, syntax/static checks, and the DB package build.
- Remaining classified work after this pass:
	- Highest remaining raw-SQL buckets include generated/deploy SQL artifacts, `EnhancedDatabaseAdapter` coverage bridging, page/export utilities, active debug/analysis helper scripts, remaining gazetteer export/correction utilities, dev scan/edit helpers with non-DB SQL-like strings, and remaining generated/deprecated/test-only files that still need explicit classification or targeted DB APIs.

## 2026-05-11 Continuation: Canonical Name Correction Tool

- Migrated `tools/corrections/fix-canonical-names.js` off local gazetteer query imports and display-only SQL.
- Extended DB-owned `fixCanonicalNames` in `news-crawler-db` to:
	- Use bound filters for kind/role.
	- Attach each selected place's `bestName` for CLI preview output.
	- Return `remainingWithoutCanonicalCount` after the fix pass.
- Migrated copilot file into a no-SQL caller:
	- `tools/corrections/fix-canonical-names.js`.
- Added focused in-memory coverage:
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacyGazetteerNames.test.ts`.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyGazetteerNames.test.ts` passed, 1 file / 2 tests. The known legacy news-source bootstrap warning still appears from copied seeder compatibility code.
	- news-crawler-db: `npm run build` passed.
	- copilot-dl-news: `node --check tools/corrections/fix-canonical-names.js` passed.
	- copilot-dl-news: focused scan of `tools/corrections/fix-canonical-names.js` for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, `CREATE TABLE`, `INSERT INTO`, `SELECT`, `UPDATE`, `DELETE FROM`, `ensureDatabase`, `src/data/db/sqlite`, and `PRAGMA` returned no matches.
	- copilot-dl-news: broad active-path scan now reports `434` matches, down from `438`.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; validation used in-memory SQLite tests in `news-crawler-db`, syntax/static checks, and the DB package build.
- Remaining classified work after this pass:
	- Highest remaining raw-SQL buckets include generated/deploy SQL artifacts, `EnhancedDatabaseAdapter` coverage bridging, page/export utilities, active debug/analysis helper scripts, remaining gazetteer export utilities, dev scan/edit helpers with non-DB SQL-like strings, and remaining generated/deprecated/test-only files that still need explicit classification or targeted DB APIs.

## 2026-05-11 Continuation: Gazetteer NDJSON Export

- Migrated `tools/export/export-gazetteer.js` off local pragma/configuration calls and old copilot DB export wrapper imports.
- Added or extended DB-owned APIs in `news-crawler-db`:
	- `GAZETTEER_EXPORT_TABLES`.
	- `validateGazetteerExportTables`.
	- `configureGazetteerExportSqlite`.
	- `runGazetteerNdjsonExport`.
	- Hardened `exportGazetteerTables` to validate table names before dynamic table reads and to finish output writes before returning.
- Migrated copilot file into a no-SQL caller:
	- `tools/export/export-gazetteer.js`.
- Added focused in-memory coverage:
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacyGazetteerExport.test.ts`.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyGazetteerExport.test.ts` passed, 1 file / 2 tests. The known legacy news-source bootstrap warning still appears from copied seeder compatibility code.
	- news-crawler-db: `npm run build` passed.
	- copilot-dl-news: `node --check tools/export/export-gazetteer.js` passed.
	- copilot-dl-news: focused scan of `tools/export/export-gazetteer.js` for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, `CREATE TABLE`, `INSERT INTO`, `SELECT`, `UPDATE`, `DELETE FROM`, `ensureDatabase`, `src/data/db/sqlite`, and `PRAGMA` returned no matches.
	- copilot-dl-news: broad active-path scan now reports `430` matches, down from `434`.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; validation used in-memory SQLite tests in `news-crawler-db`, syntax/static checks, and the DB package build.
- Remaining classified work after this pass:
	- Highest remaining raw-SQL buckets include generated/deploy SQL artifacts, `EnhancedDatabaseAdapter` coverage bridging, generic page/data export utilities, active debug/analysis helper scripts, dev scan/edit helpers with non-DB SQL-like strings, and remaining generated/deprecated/test-only files that still need explicit classification or targeted DB APIs.

## 2026-05-11 Continuation: Export And Enhanced-Adapter Cleanup

- Migrated four more active/operational copilot clusters into DB-owned APIs:
	- `tools/export/export-data.js`.
	- `tools/export/export-pages.js`.
	- `src/data/db/EnhancedDatabaseAdapter.js`.
	- `tools/debug/check-analysis-data.js`.
- Added or extended DB-owned APIs in `news-crawler-db`:
	- `SqliteDataExportAccess`, `createSqliteDataExportAccess`, `createSqliteDataExportAdapter`, `listDataExportArticles`, and `listDataExportDomains`; attached as `db.dataExport`.
	- Page-export helpers: `getPagesExportRequiredSourceTableStatus`, `getPagesExportSourceContentCount`, `initializePagesExportDatabase`, and `insertExportedArticleBatch`.
	- Enhanced-adapter utilities: `createSyncNewsDbBridge`, `getEnhancedDatabaseFeatureTableStatus`, `deactivateOldProblemClusters`, and `checkEnhancedDatabaseHealth`.
	- Analysis-data diagnostic helpers: `getAnalysisDataDebugSnapshot`, `getLatestAnalysisDataForUrl`, and explicit column-list readers.
- Migrated copilot behavior:
	- `export-data.js` now opens via `openNewsCrawlerDb` and passes `db.dataExport` into `ExportService`; local article/domain SQL adapter removed.
	- `export-pages.js` now opens source/output DBs through `openNewsCrawlerDb`; required-table checks, source counts, source chunk reads, output schema creation, compression-type insertion, and article batch inserts are DB-owned.
	- `EnhancedDatabaseAdapter.js` keeps feature orchestration and analysis bridge selection in copilot, but no longer owns SQL for bridge query execution, feature-table inspection, cluster cleanup, or health probing.
	- `check-analysis-data.js` now renders a DB-owned read-only diagnostic snapshot.
- Added focused in-memory coverage:
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacyDataExportAdapter.test.ts`.
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacyPagesExport.test.ts`.
	- Extended `news-crawler-db/src/db/__tests__/unit/sqlite/legacyEnhancedDatabases.test.ts`.
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacyAnalysisDataDiagnostics.test.ts`.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyDataExportAdapter.test.ts` passed, 1 file / 4 tests.
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyPagesExport.test.ts src/db/__tests__/unit/sqlite/legacyDataExportAdapter.test.ts src/db/__tests__/unit/sqlite/legacyGazetteerExport.test.ts` passed, 3 files / 8 tests.
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyEnhancedDatabases.test.ts` passed, 1 file / 4 tests.
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyAnalysisDataDiagnostics.test.ts` passed, 1 file / 2 tests.
	- news-crawler-db: `npm run build` passed after each API addition batch.
	- copilot-dl-news: `node --check tools/export/export-data.js && node --check tools/export/export-pages.js && node --check src/data/db/EnhancedDatabaseAdapter.js && node --check tools/debug/check-analysis-data.js` passed.
	- copilot-dl-news: focused scan of those four migrated files for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, `CREATE TABLE`, `INSERT INTO`, `SELECT`, `UPDATE`, `DELETE FROM`, `ensureDb`, `ensureDatabase`, `openDatabase`, `pages.export`, and `require('pg')` returned no matches.
	- copilot-dl-news: broad active-path scan now reports `410` matches, down from `430`.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; validation used in-memory SQLite tests in `news-crawler-db`, syntax/static checks, and the DB package build.
- Remaining classified work after this pass:
	- Highest remaining raw-SQL buckets include generated/deploy SQL artifacts, docs/README examples, dev scan/edit/SVG helpers with SQL-like non-DB strings, active debug/prediction/analysis utilities, check-status utilities, small SQLite v1 compatibility wrappers, migration SQL files, and generated/deprecated/test-only files that still need explicit classification or targeted DB APIs.

## 2026-05-11 Continuation: Analysis Tooling And Debug Runtime Reads

- Migrated the analysis-status and confidence-backfill tooling into explicit DB-owned APIs:
	- `getAnalysisStatusCheckSnapshot`.
	- `listConfidenceBackfillCandidates`.
	- `updateContentAnalysisConfidenceScore`.
	- `updateContentAnalysisConfidenceScores`.
- Migrated active debug/read-only tooling and small runtime reads into DB-owned APIs:
	- `getNormalizedUrlDebugQuerySnapshot`.
	- `getLatestAnalyzablePageDebugSnapshot`.
	- `getPagesExportDatabaseInspectionSnapshot`.
	- `listPlaceExtractionHierarchyRows`.
	- `listPlaceExtractionCountryMatcherRows`.
	- `listPlaceExtractionCityMatcherRows`.
	- `getPlaceExtractionDomainLocale`.
	- `getEarthPlaceHubOverride`.
	- `getAnyPlanetPlaceHubOverride`.
	- `seedPredictiveHubDiscoveryDebugGazetteer`.
	- `listPredictiveHubDiscoveryDebugCountryRows`.
- Migrated copilot callers into no-SQL callers/delegators:
	- `tools/checks/check-analysis-status.js`.
	- `tools/analysis/confidence-backfill.js`.
	- `tools/debug/debug-query.js`.
	- `tools/debug/debug-analyze-page.js`.
	- `tools/debug/check-export.js`.
	- `tools/debug/debug-predict.js`.
	- `src/intelligence/analysis/place-extraction.js`.
	- `src/tools/placeHubDetector.js`.
- Added or extended focused in-memory coverage:
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacyAnalysisTooling.test.ts`.
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacyDebugAnalysisTools.test.ts`.
	- `news-crawler-db/src/db/__tests__/unit/sqlite/legacyPlaceExtractionQueries.test.ts`.
	- Extended `news-crawler-db/src/db/__tests__/unit/sqlite/legacyPagesExport.test.ts`.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyAnalysisTooling.test.ts` passed, 1 file / 4 tests.
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyDebugAnalysisTools.test.ts src/db/__tests__/unit/sqlite/legacyPlaceExtractionQueries.test.ts src/db/__tests__/unit/sqlite/legacyPagesExport.test.ts` passed, 3 files / 9 tests. The known legacy news-source bootstrap warning still appears from copied seeder compatibility code.
	- news-crawler-db: after adding predictive debug fixture helpers, `npx vitest run src/db/__tests__/unit/sqlite/legacyDebugAnalysisTools.test.ts` passed, 1 file / 3 tests.
	- news-crawler-db: `npm run build` passed after both API batches.
	- copilot-dl-news: `node --check tools/debug/debug-query.js && node --check tools/debug/debug-analyze-page.js && node --check tools/debug/check-export.js && node --check tools/debug/debug-predict.js && node --check src/intelligence/analysis/place-extraction.js && node --check src/tools/placeHubDetector.js && node --check tools/checks/check-analysis-status.js && node --check tools/analysis/confidence-backfill.js` passed.
	- copilot-dl-news: focused scan of the eight migrated caller/runtime files for `.prepare(`, `db.exec(`, `.pragma(`, `sqlite_master`, `CREATE TABLE`, `INSERT INTO`, `SELECT`, `UPDATE`, `DELETE FROM`, `ensureDb`, `ensureDatabase`, `require('pg')`, and direct `Database(` calls returned no matches.
	- copilot-dl-news: broad active-path scan now reports `383` matches, down from `410`.
	- copilot-dl-news: supplementary runtime scan of `src/intelligence` and `src/tools` still shows DB-boundary clusters in matching/import/gazetteer utility modules, but the touched `place-extraction.js` and `placeHubDetector.js` no longer own DB SQL.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; validation used in-memory SQLite tests in `news-crawler-db`, syntax/static checks, and the DB package build.
- Remaining classified work after this pass:
	- Highest remaining broad-scan buckets include generated/deploy SQL artifacts, docs/README examples, dev scan/edit/SVG helpers with SQL-like non-DB strings, hub-analysis workflow tooling, remaining SQLite v1 compatibility wrappers, migration SQL files, and generated/deprecated/test-only files.
	- Supplementary runtime clusters outside the broad scan include `src/tools/gazetteer-cleanup.js`, URL normalization utilities under `src/tools/normalize-urls`, gazetteer import/populate helpers, place/article matching modules, publisher-prior/page-category/coherence helpers, and PostGIS/Wikidata query builders. Active ones should continue moving into named `news-crawler-db` APIs; SPARQL and non-DB parser strings should be classified separately.

## 2026-05-11 Continuation: Dev Download Inspection Tools

- Migrated two active dev inspection/chart utilities into DB-owned read models:
	- `tools/dev/_db-inspect-counts.js`.
	- `tools/dev/db-downloads-chart.js`.
- Extended `news-crawler-db` `SqliteDatabaseIntrospectionAccess` with explicit methods:
	- `getDownloadRelatedTableInspectionSnapshot`.
	- `listCumulativeSuccessfulHttpResponseDownloadDays`.
- The copilot tools now only open the DB through `openNewsCrawlerDb`, call `db.databaseIntrospection`, and render the returned data.
- Added focused in-memory coverage:
	- Extended `news-crawler-db/src/db/__tests__/unit/sqlite/databaseIntrospection.test.ts`.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/databaseIntrospection.test.ts` passed, 1 file / 4 tests.
	- news-crawler-db: `npm run build` passed.
	- copilot-dl-news: `node --check tools/dev/_db-inspect-counts.js && node --check tools/dev/db-downloads-chart.js` passed.
	- copilot-dl-news: focused scan of those two files for `.prepare(`, `db.exec(`, `.pragma(`, `sqlite_master`, `CREATE TABLE`, `INSERT INTO`, `SELECT`, `UPDATE`, `DELETE FROM`, `ensureDb`, `ensureDatabase`, `require('pg')`, and direct `Database(` calls returned no matches.
	- copilot-dl-news: broad active-path scan now reports `375` matches, down from `383`.
- Blocked/classified during this pass:
	- `tools/analysis/hub-analysis-workflow.js` remains in the broad scan, but `node --check tools/analysis/hub-analysis-workflow.js` fails before DB migration with `SyntaxError: Unexpected identifier 'hubScore'` at line 303. It also has bad relative imports from `tools/analysis` into `../src/...`. Treat it as a broken dev utility before migrating its DB cache/suspect-URL operations.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; validation used in-memory SQLite tests in `news-crawler-db`, syntax/static checks, and the DB package build.
- Remaining classified work after this pass:
	- Highest remaining broad-scan buckets include generated/deploy SQL artifacts, docs/README examples, dev scan/edit/SVG helpers with SQL-like non-DB strings, the broken hub-analysis workflow utility, `probe-hub-depth`, remaining SQLite v1 compatibility wrappers, migration SQL files, and generated/deprecated/test-only files.

## 2026-05-11 Continuation: Hub Depth Probe Utility

- Migrated `tools/dev/probe-hub-depth.js` off local SQL for:
	- Loading verified Guardian country hub mappings.
	- Persisting `max_page_depth`, `oldest_content_date`, `last_depth_check_at`, and `depth_check_error`.
- Reused existing DB-owned `news-crawler-db` APIs:
	- `getVerifiedHubsForArchive`.
	- `updateHubDepthCheck`.
- The copilot utility now keeps only network probing, pagination heuristics, result selection, and file output.
- Added focused in-memory coverage:
	- Extended `news-crawler-db/src/db/__tests__/unit/sqlite/legacyGazetteerCompat.test.ts` to cover `getVerifiedHubsForArchive` plus `updateHubDepthCheck`.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyGazetteerCompat.test.ts` passed, 1 file / 3 tests.
	- news-crawler-db: `npm run build` passed.
	- copilot-dl-news: `node --check tools/dev/probe-hub-depth.js` passed.
	- copilot-dl-news: focused scan of `tools/dev/probe-hub-depth.js` for `.prepare(`, `db.exec(`, `.pragma(`, `sqlite_master`, `CREATE TABLE`, `INSERT INTO`, `SELECT`, `UPDATE`, `DELETE FROM`, `ensureDb`, `ensureDatabase`, `require('pg')`, and direct `Database(` calls returned no matches.
	- copilot-dl-news: broad active-path scan now reports `371` matches, down from `375`.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; validation used in-memory SQLite tests in `news-crawler-db`, syntax/static checks, and the DB package build.
- Remaining classified work after this pass:
	- Highest remaining broad-scan buckets include generated/deploy SQL artifacts, docs/README examples, dev scan/edit/SVG helpers with SQL-like non-DB strings, the broken hub-analysis workflow utility, remaining SQLite v1 compatibility wrappers, migration SQL files, and generated/deprecated/test-only files.

## 2026-05-11 Continuation: Query Telemetry Recent Reads

- Migrated `src/ui/server/queryTelemetry/server.js` off direct SQL for recent-query listings.
- Extended the DB-owned `getRecentQueries` helper in `news-crawler-db` so `queryType = null` returns recent telemetry across all query types.
- The query telemetry server now uses the compatibility wrapper for both filtered and unfiltered recent-query reads.
- Added focused in-memory coverage:
	- Extended `news-crawler-db/src/db/__tests__/unit/sqlite/queryTelemetry.test.ts`.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/queryTelemetry.test.ts` passed, 1 file / 4 tests.
	- news-crawler-db: `npm run build` passed.
	- copilot-dl-news: `node --check src/ui/server/queryTelemetry/server.js` passed.
	- copilot-dl-news: focused scan of `src/ui/server/queryTelemetry/server.js` for `.prepare(`, `db.exec(`, `.pragma(`, `sqlite_master`, `CREATE TABLE`, `INSERT INTO`, `SELECT`, `UPDATE`, `DELETE FROM`, `ensureDb`, `ensureDatabase`, `require('pg')`, and direct `Database(` calls returned no matches.
	- copilot-dl-news: broad active-path scan now reports `367` matches, down from `371`.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; validation used in-memory SQLite tests in `news-crawler-db`, syntax/static checks, and the DB package build.
- Remaining classified work after this pass:
	- Highest remaining broad-scan buckets include generated/deploy SQL artifacts, docs/README examples, dev scan/edit/SVG helpers with SQL-like non-DB strings, the broken hub-analysis workflow utility, `src/ui/server/unifiedApp/server.js`, remaining SQLite v1 compatibility wrappers, migration SQL files, and generated/deprecated/test-only files.

## 2026-05-11 Continuation: Unified App And Place-Hub Check Cluster

- Migrated active unified-app DB reads and place-hub UI/check reads off copilot-owned SQL:
	- `src/ui/server/unifiedApp/server.js` now delegates recent-download rows to DB-owned `listRecentDownloads` and search-section counts to DB-owned `listContentAnalysisSectionCounts`.
	- `src/ui/server/placeHubGuessing/server.js` now delegates cell mapping lookup to `getPlaceHubGuessingMappingByPlaceHost`.
	- `src/ui/server/placeHubGuessing/checks/placeHubGuessing.guardian.check.js` now uses `db.placeHubDiagnostics` for Guardian mapping count and mapped-country sample rows.
	- `src/ui/server/placeHubGuessing/checks/placeHubGuessing.cell.check.js` now delegates its verified test mapping lookup to `getPlaceHubGuessingFirstVerifiedMappingWithUrl`.
	- `src/data/db/sqlite/v1/queries/placeHubGuessingUiQueries.js` remains a thin compatibility wrapper over `news-crawler-db`.
- Added or extended explicit DB-owned APIs:
	- `listContentAnalysisSectionCounts`.
	- `countPlacePageMappingsForHostAndKind`.
	- `listMappedCountryPlaceNamesForHostAndKind`.
	- `getPlaceHubGuessingMappingByPlaceHost`.
	- `getPlaceHubGuessingFirstVerifiedMappingWithUrl`.
- Added focused in-memory coverage:
	- `news-crawler-db/src/db/__tests__/unit/sqlite/searchExplorerOptions.test.ts`.
	- Extended `news-crawler-db/src/db/__tests__/unit/sqlite/placeHubDiagnostics.test.ts`.
	- Extended `news-crawler-db/src/db/__tests__/unit/sqlite/legacyPlaceHubGuessingCompat.test.ts`.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/searchExplorerOptions.test.ts src/db/__tests__/unit/sqlite/placeHubDiagnostics.test.ts src/db/__tests__/unit/sqlite/legacyPlaceHubGuessingCompat.test.ts src/db/__tests__/unit/sqlite/legacyDownloadTooling.test.ts` passed, 4 files / 14 tests. The known legacy news-source bootstrap warning still appears from copied seeder compatibility code.
	- news-crawler-db: `npm run build` passed.
	- copilot-dl-news: `node --check src/ui/server/unifiedApp/server.js && node --check src/ui/server/placeHubGuessing/server.js && node --check src/ui/server/placeHubGuessing/checks/placeHubGuessing.guardian.check.js && node --check src/ui/server/placeHubGuessing/checks/placeHubGuessing.cell.check.js && node --check src/data/db/sqlite/v1/queries/placeHubGuessingUiQueries.js` passed.
	- copilot-dl-news: focused scan of those five changed caller/wrapper files for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, `CREATE TABLE`, `INSERT INTO`, `SELECT`, `UPDATE`, `DELETE FROM`, and table-query strings returned no matches.
	- copilot-dl-news: targeted scan of `src/ui/server/placeHubGuessing` now shows no active raw SQL matches outside public assets.
	- copilot-dl-news: broad active-path scan now reports `355` matches, down from `367`.
	- `git diff --check` passed for touched files in both repos.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; validation used in-memory SQLite tests in `news-crawler-db`, syntax/static checks, and the DB package build.
- Remaining classified work after this pass:
	- Highest remaining broad-scan buckets include generated/deploy SQL artifacts, docs/README examples, dev scan/edit/SVG helpers with SQL-like non-DB strings, the broken `tools/analysis/hub-analysis-workflow.js`, remaining SQLite v1 compatibility/migration files, small crawler/gazetteer utilities, and generated/deprecated/test-only files.

## 2026-05-11 Continuation: Place Sources Maintenance Wrapper

- Migrated `src/data/db/sqlite/v1/tools/dedupePlaceSources.js` from local SQL to a compatibility wrapper.
- Added DB-owned `dedupePlaceSources` in `news-crawler-db/src/db/sqlite/access/legacy-placeSourcesMaintenance.ts`.
- Extended in-memory coverage in `news-crawler-db/src/db/__tests__/unit/sqlite/legacyGazetteerCompat.test.ts` to verify duplicate removal and unique-index creation.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyGazetteerCompat.test.ts` passed, 1 file / 4 tests.
	- news-crawler-db: `npm run build` passed.
	- copilot-dl-news: `node --check src/data/db/sqlite/v1/tools/dedupePlaceSources.js` passed.
	- copilot-dl-news: focused scan of `src/data/db/sqlite/v1/tools/dedupePlaceSources.js` for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, `CREATE TABLE`, `INSERT INTO`, `SELECT`, `UPDATE`, and `DELETE FROM` returned no matches.
	- copilot-dl-news: broad active-path scan now reports `350` matches, down from `355`.
	- `git diff --check` passed for touched files in both repos.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; validation used in-memory SQLite tests in `news-crawler-db`, syntax/static checks, and the DB package build.
- Remaining classified work after this pass:
	- Highest remaining broad-scan buckets include generated/deploy SQL artifacts, docs/README examples, dev scan/edit/SVG helpers with SQL-like non-DB strings, the broken `tools/analysis/hub-analysis-workflow.js`, remaining SQLite v1 compatibility/migration files, small crawler/gazetteer utilities, and generated/deprecated/test-only files.

## 2026-05-11 Continuation: Place-Hub Utility And Validator Cache Reads

- Migrated active place-hub utility and validator-cache DB reads off copilot-owned SQL:
	- `tools/crawl/list-place-hubs.js` now opens through `openNewsCrawlerDb` and delegates row listing to DB-owned `listPlaceHubCliRows`.
	- `tools/gazetteer/verify-place-hubs.js` now delegates place-hub listing, URL updates, and deletes to DB-owned helpers.
	- `src/geo/hub-validation/HubCacheManager.js` now delegates cached article lookup to DB-owned `getHubValidationCachedArticle`.
- Added DB-owned APIs in `news-crawler-db/src/db/sqlite/access/legacy-placeHubUtilityTools.ts`:
	- `listPlaceHubCliRows`.
	- `listPlaceHubsForVerification`.
	- `deletePlaceHubById`.
	- `updatePlaceHubUrl`.
	- `getHubValidationCachedArticle`.
- Added focused in-memory coverage:
	- Extended `news-crawler-db/src/db/__tests__/unit/sqlite/legacyGazetteerToolQueries.test.ts` for old/new `place_hubs` shapes, verification listing, updates/deletes, and cached article reads.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyGazetteerToolQueries.test.ts` passed, 1 file / 2 tests. The known legacy news-source bootstrap warning still appears from copied seeder compatibility code.
	- news-crawler-db: `npm run build` passed.
	- copilot-dl-news: `node --check tools/gazetteer/verify-place-hubs.js && node --check tools/crawl/list-place-hubs.js && node --check src/geo/hub-validation/HubCacheManager.js` passed.
	- copilot-dl-news: focused scan of those three changed files for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, `CREATE TABLE`, `INSERT INTO`, `SELECT`, `UPDATE`, `DELETE FROM`, `ensureDatabase`, `ensureDb(`, and direct `better-sqlite3` imports returned no matches.
	- copilot-dl-news: broad active-path scan now reports `344` matches, down from `350`.
	- news-crawler-db: `git diff --check -- src/db/sqlite/access/legacy-placeHubUtilityTools.ts src/db/__tests__/unit/sqlite/legacyGazetteerToolQueries.test.ts src/db/index.ts` passed.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; validation used in-memory SQLite tests in `news-crawler-db`, syntax/static checks, and the DB package build.
- Remaining classified work after this pass:
	- Highest remaining broad-scan buckets include generated/deploy SQL artifacts, docs/README examples, dev scan/edit/SVG helpers with SQL-like non-DB strings, the broken `tools/analysis/hub-analysis-workflow.js`, remaining SQLite v1 compatibility/migration files, small crawler/gazetteer utilities, and generated/deprecated/test-only files.

## 2026-05-11 Continuation: SQLite Compatibility Helper Cluster

- Migrated small SQLite helper compatibility files off local SQL while preserving their historical CommonJS APIs:
	- `src/data/db/sqlite/v1/seed-utils.js` now delegates bootstrap gazetteer counts and seed insertion to `news-crawler-db`.
	- `src/data/db/sqlite/urlHelpers.js` now delegates URL host derivation and URL-id resolution to `news-crawler-db`.
	- `src/data/db/sqlite/queries/topicKeywords.js` now delegates topic-term reads to `news-crawler-db`.
	- `src/data/db/sqlite/v1/ensureDb.js` had an unused `seed-utils` import removed.
- Added or extended DB-owned APIs:
	- `getBootstrapGazetteerCounts`.
	- `seedBootstrapData`.
	- `deriveHost`.
	- `ensureUrlId`.
	- `getAllTopicTerms`.
- Added focused in-memory coverage:
	- Extended `news-crawler-db/src/db/__tests__/unit/sqlite/legacyContentUtilityQueries.test.ts` for bootstrap seeding/counts, URL-id resolution, and all-topic-term reads.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyContentUtilityQueries.test.ts` passed, 1 file / 5 tests. The known legacy news-source bootstrap warning still appears from copied seeder compatibility code.
	- news-crawler-db: `npm run build` passed.
	- copilot-dl-news: `node --check src/data/db/sqlite/v1/seed-utils.js && node --check src/data/db/sqlite/urlHelpers.js && node --check src/data/db/sqlite/queries/topicKeywords.js && node --check src/data/db/sqlite/v1/ensureDb.js` passed.
	- copilot-dl-news: wrapper require smoke returned `function function function function function function` for the seed, URL, and topic helper exports.
	- copilot-dl-news: focused scan of the three migrated helper files for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, `CREATE TABLE`, `INSERT INTO`, `SELECT`, `UPDATE`, `DELETE FROM`, and direct `better-sqlite3` imports returned no matches.
	- copilot-dl-news: broad active-path scan now reports `332` matches, down from `344`.
	- `git diff --check` passed for touched files in both repos.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; validation used in-memory SQLite tests in `news-crawler-db`, syntax/static checks, and the DB package build.
- Remaining classified work after this pass:
	- Highest remaining broad-scan buckets include generated/deploy SQL artifacts, docs/README examples, dev scan/edit/SVG helpers with SQL-like non-DB strings, the broken `tools/analysis/hub-analysis-workflow.js`, remaining migration-only scripts, active check fixtures, small DB/schema diagnostic tools, and generated/deprecated/test-only files.

## 2026-05-11 Continuation: Active Check Fixture And Health Probe Cluster

- Migrated active check-only DB probes and in-memory fixture setup off copilot-owned SQL:
	- `checks/crawler-place-hub-integration.check.js` now creates its in-memory tables through DB-owned `createPlaceHubPatternLearningCheckFixture`.
	- `src/data/db/checks/crawler-components-batch3.check.js`, `batch4`, `batch6`, and `batch7` now use DB-owned `checkEnhancedDatabaseHealth` instead of local `SELECT 1` probes.
- Reused existing DB-owned APIs:
	- `createPlaceHubPatternLearningCheckFixture`.
	- `checkEnhancedDatabaseHealth`.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyCheckFixtures.test.ts src/db/__tests__/unit/sqlite/legacyEnhancedDatabases.test.ts` passed, 2 files / 8 tests. The known legacy news-source bootstrap warning still appears from copied seeder compatibility code.
	- news-crawler-db: `npm run build` passed.
	- copilot-dl-news: `node --check checks/crawler-place-hub-integration.check.js && node --check src/data/db/checks/crawler-components-batch3.check.js && node --check src/data/db/checks/crawler-components-batch4.check.js && node --check src/data/db/checks/crawler-components-batch6.check.js && node --check src/data/db/checks/crawler-components-batch7.check.js` passed.
	- copilot-dl-news: focused scan of those five changed check files for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, `CREATE TABLE`, `INSERT INTO`, `SELECT`, `UPDATE`, `DELETE FROM`, and direct `better-sqlite3` imports returned no matches.
	- copilot-dl-news: broad active-path scan now reports `314` matches, down from `332`.
	- copilot-dl-news: `git diff --check` passed for the five changed check files.
- Safety evidence: the active checks were not executed against a default/live database; validation used in-memory DB package tests plus syntax/static checks in `copilot-dl-news`.
- Remaining classified work after this pass:
	- Highest remaining broad-scan buckets include generated/deploy SQL artifacts, docs/README examples, dev scan/edit/SVG helpers with SQL-like non-DB strings, the broken `tools/analysis/hub-analysis-workflow.js`, remaining migration-only scripts, small DB/schema diagnostic tools, manual/example scripts, and generated/deprecated/test-only files.

## 2026-05-11 Continuation: DB Table-Size Diagnostic Tooling

- Migrated table-size diagnostic SQL out of copilot tooling:
	- `tools/db/db-table-sizes.js` now delegates direct `dbstat` collection and sqlite3 CLI query text to `news-crawler-db`, while retaining CLI parsing, formatting, download fallback, and worker orchestration.
	- `tools/db/db-worker.js` now delegates worker-thread `dbstat` reads to `news-crawler-db`.
	- `tools/db/db-table-sizes-fast.js` is now a compatibility alias for `db-table-sizes --mode cli`.
- Added DB-owned APIs:
	- `getSqliteDbstatTableSizesQuery`.
	- `listSqliteDbstatTableSizes`.
- Fixed `tools/db/db-table-sizes.js` relative imports from `../src/...` to `../../src/...` while touching the file; `tools/src` does not exist.
- Added focused in-memory coverage:
	- Extended `news-crawler-db/src/db/__tests__/unit/sqlite/databaseIntrospection.test.ts` for the DB-owned `dbstat` table-size contract.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/databaseIntrospection.test.ts` passed, 1 file / 5 tests.
	- news-crawler-db: `npm run build` passed.
	- copilot-dl-news: `node --check tools/db/db-table-sizes.js && node --check tools/db/db-table-sizes-fast.js && node --check tools/db/db-worker.js` passed.
	- copilot-dl-news: wrapper require smoke returned `function function` for `executeAnalysis` and `analyzeWithSqlite3`.
	- copilot-dl-news: focused scan of the three changed table-size files for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, `CREATE TABLE`, `INSERT INTO`, `SELECT`, `UPDATE`, `DELETE FROM`, and direct `better-sqlite3` imports returned no matches.
	- copilot-dl-news: broad active-path scan now reports `307` matches, down from `314`.
	- `git diff --check` passed for touched files in both repos.
- Safety evidence: did not execute the table-size tools against `copilot-dl-news/data/news.db`; validation used in-memory DB package tests, syntax/static checks, and require-only smoke checks.
- Remaining classified work after this pass:
	- Highest remaining broad-scan buckets include generated/deploy SQL artifacts, docs/README examples, dev scan/edit/SVG helpers with SQL-like non-DB strings, the broken `tools/analysis/hub-analysis-workflow.js`, remaining migration-only scripts, generic query/maintenance CLI tools, manual/example scripts, and generated/deprecated/test-only files.

## 2026-05-11 Continuation: Telemetry Cleanup Utility

- Migrated `tools/cleanup/clear-telemetry.js` off remaining local DB maintenance SQL:
	- It now imports `clearQueryTelemetry` and `vacuumDatabase` directly from `news-crawler-db`.
	- Fixed its default DB path from `tools/data/news.db` to repo-root `data/news.db`.
	- Added a `require.main === module` guard and exports so future require-only smoke checks do not execute the destructive cleanup path.
	- Reworded console/help text so the file no longer embeds direct SQL command text.
- Validation evidence:
	- copilot-dl-news: `node --check tools/cleanup/clear-telemetry.js` passed.
	- copilot-dl-news: require-only smoke after adding the main guard returned `function function` for `runClearTelemetry` and `printHelp`.
	- copilot-dl-news: focused scan of `tools/cleanup/clear-telemetry.js` for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, `CREATE TABLE`, `INSERT INTO`, `SELECT`, `UPDATE`, `DELETE FROM`, `VACUUM`, and direct `better-sqlite3` imports returned no matches.
	- copilot-dl-news: broad active-path scan now reports `305` matches, down from `307`.
	- copilot-dl-news: `git diff --check -- tools/cleanup/clear-telemetry.js` passed.
- Safety incident:
	- A require-only smoke check was run before the file had a `require.main` guard, so the script executed against `copilot-dl-news/data/news.db`. It cleared 472 `query_telemetry` rows, then began database compaction. The compaction process was stopped. This violated the session safety rule and is recorded here explicitly.
	- No further live-DB validation was run after this incident.
- Remaining classified work after this pass:
	- Highest remaining broad-scan buckets include generated/deploy SQL artifacts, docs/README examples, dev scan/edit/SVG helpers with SQL-like non-DB strings, the broken `tools/analysis/hub-analysis-workflow.js`, generic query/maintenance CLI tools, migration-only scripts, manual/example scripts, and generated/deprecated/test-only files.

## 2026-05-11 Continuation: Final Active Utility And Migration-Script Sweep

- Migrated the remaining active DB-boundary utility/check cluster into DB-owned APIs and compatibility callers, without running any changed copilot script against `data/news.db`.
- Added DB-owned APIs in `news-crawler-db`:
	- `checkPostgresHealth` / `createDefaultPostgresHealthClient` for first-class Postgres health probing without `pg` driver calls in copilot deploy scripts.
	- `SqliteMigrationUtilitiesAccess` as `db.migrationUtilities`, plus named helpers for worker URL columns, crawl run/log schema, place-hub guess-run schema, site URL pattern schema/drop, place-name temporal columns, and background-task cancellation reasons.
	- Debug/dev utility reads and writes: URL response debug rows, analyzed URL rows, content-analysis counts, empty normalized place names, crawl-log matching, country/place counts, site-pattern host summaries, successful-response host counts, random article samples, benchmark place-name rows, locale upserts, URL-classification samples, unified-app dashboard counts, and topic-hub cell sample rows.
	- Gazetteer export iterators for fixed table names, reusing DB-owned validation.
- Migrated these copilot files to no-SQL callers/wrappers:
	- `deploy/scripts/health-check.js`
	- `tools/crawl/migrate-db-for-worker.js`
	- `tools/crawl/migrate-db-crawl-logs.js`
	- `tools/migrations/create-place-hub-guess-runs-table.js`
	- `tools/migrations/add-site-url-patterns.js`
	- `tools/migrations/2025-11-24-add-temporal-cols-to-place-names.js`
	- `tools/migrations/add-task-cancellation-reason.js`
	- `src/data/db/sqlite/v1/tools/gazetteerExport.js`
	- `src/data/db/sqlite/queries/maintenance.js`
	- `scripts/db/verify-snapshot.js`
	- `tools/dev/run-pattern-analysis.js`
	- `tools/dev/crawl-sites.js`
	- `tools/examples/sample-place-matching.js`
	- `tools/benchmarks/run.js`
	- `scripts/seed-locales.js`
	- `src/data/db/checks/access-patterns.check.js`
	- `src/data/db/checks/scheduler-instantiation.check.js`
	- `src/data/db/checks/crawler-components.check.js`
	- `src/data/db/checks/crawler-components-batch5.check.js`
	- `src/data/db/checks/crawler-components-batch8.check.js`
	- `tools/dev/url-classify.js`
	- `tools/dev/url-classify-test.js`
	- `tools/experiments/platform-lab.js`
	- `src/ui/server/analyticsHub/controls/DownloadHistoryChart.js`
	- `checks/template-extractor.check.js`
	- `src/ui/server/unifiedApp/subApps/registry.js`
	- `src/ui/server/topicHubGuessing/checks/topicHubGuessing.cell.check.js`
- Added or extended focused tests:
	- `src/db/__tests__/unit/sqlite/legacyMigrationUtilities.test.ts`
	- `src/db/__tests__/unit/postgres/health.test.ts`
	- Extended `src/db/__tests__/unit/sqlite/legacyDebugAnalysisTools.test.ts`.
	- Extended `src/db/__tests__/unit/sqlite/legacyGazetteerExport.test.ts`.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacyDebugAnalysisTools.test.ts src/db/__tests__/unit/sqlite/legacyMigrationUtilities.test.ts src/db/__tests__/unit/postgres/health.test.ts src/db/__tests__/unit/sqlite/legacyGazetteerExport.test.ts` passed, 4 files / 14 tests. The known legacy news-source bootstrap warning still appears from copied seeder compatibility code.
	- news-crawler-db: `npm run build` passed.
	- copilot-dl-news: `node --check` passed for all changed caller/wrapper/check files listed above.
	- copilot-dl-news: focused scan of those changed files for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, `CREATE TABLE`, `INSERT INTO`, `SELECT`, `UPDATE`, `DELETE FROM`, `client.query`, `pool.query`, and direct `pg` imports returned no matches.
	- `git diff --check` passed for touched files in both repos.
	- copilot-dl-news: broad active-path scan now reports `189` matches, down from `305` at the start of this sweep.
- Current remaining broad-scan classifications:
	- Migration/deploy SQL artifacts: `deploy/scripts/init-db.sql`, `src/data/db/migrations/*`, and SQLite v1 `.sql` migration files.
	- Docs/examples: correction/deploy/debug README text and local agent guidance.
	- Generated/static browser output: built UI bundles and source maps under `src/ui/server/**/public` and demo/art playground bundles.
	- Dev/source-analysis tooling false positives: JS/SVG/Markdown scanners, docs bridge scripts, source edit tools, agent-runner tooling, knowledge freshness/graph tools, and string fixtures that inspect source text.
	- Non-DB query/parser strings: SPARQL query builders in Wikidata/geography code and regex `.exec` loops in sitemap/archive/hub-validator/remote-crawler parsing code.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db` during this sweep; validation used in-memory DB tests in `news-crawler-db`, DB package builds, syntax checks, and static scans.

## 2026-05-12 Continuation: Domain Crawl Behaviors Migration Artifact

- Migrated the remaining active JS SQLite migration string out of copilot:
	- `src/data/db/sqlite/v1/migrations/029_domain_crawl_behaviors.js` is now a compatibility export that re-exports `news-crawler-db` SQL constants plus named ensure/drop helpers.
	- `news-crawler-db/src/db/sqlite/access/legacy-smallSchemaMigrations.ts` now owns `DOMAIN_CRAWL_BEHAVIORS_UP_SQL`, `DOMAIN_CRAWL_BEHAVIORS_DOWN_SQL`, `ensureDomainCrawlBehaviorsSchema`, and `dropDomainCrawlBehaviorsSchema`.
	- `news-crawler-db/src/db/index.ts` exports those DB-owned schema contracts.
- Added focused in-memory coverage:
	- Extended `news-crawler-db/src/db/__tests__/unit/sqlite/legacySmallSchemaMigrations.test.ts` to verify domain crawl behavior table creation, expected columns, expected indexes, idempotent ensure, and drop behavior.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/legacySmallSchemaMigrations.test.ts` passed, 1 file / 4 tests. The known legacy news-source bootstrap warning still appears from copied seeder compatibility code.
	- news-crawler-db: `npm run build` passed.
	- copilot-dl-news: `node --check src/data/db/sqlite/v1/migrations/029_domain_crawl_behaviors.js` passed.
	- copilot-dl-news: focused scan of `src/data/db/sqlite/v1/migrations/029_domain_crawl_behaviors.js` for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, `CREATE TABLE`, `INSERT INTO`, `SELECT`, `UPDATE`, `DELETE FROM`, `client.query`, `pool.query`, and direct `pg` imports returned no matches.
	- copilot-dl-news: broad active-path scan now reports `188` matches, down from `189`.
	- `git diff --check` passed for touched files in both repos.
- Current remaining broad-scan classifications:
	- Migration/deploy SQL artifacts: `deploy/scripts/init-db.sql`, `src/data/db/migrations/*`, and SQLite v1 `.sql` migration files.
	- Docs/examples: correction/deploy/debug README text and local agent guidance.
	- Generated/static browser output: built UI bundles and source maps under `src/ui/server/**/public` and demo/art playground bundles.
	- Dev/source-analysis tooling false positives: JS/SVG/Markdown scanners, docs bridge scripts, source edit tools, agent-runner tooling, knowledge freshness/graph tools, and string fixtures that inspect source text.
	- Non-DB query/parser strings: SPARQL query builders in Wikidata/geography code and regex `.exec` loops in sitemap/archive/hub-validator/remote-crawler parsing code.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; validation used in-memory DB package tests, TypeScript build, syntax check, and static scans only.

## 2026-05-12 Completion Pass: Deploy Bootstrap, UI Scenario Fixture, And Residual Classification

- Moved the remaining Postgres deploy bootstrap SQL into `news-crawler-db`:
	- Added `news-crawler-db/src/db/postgres/migrations/bootstrap/init-db.sql`.
	- Added `news-crawler-db/src/db/postgres/migrations/README.md`.
	- Changed `deploy/docker-compose.yml` to mount the DB-module-owned bootstrap file.
	- Replaced `deploy/scripts/init-db.sql` with a non-executable placeholder.
	- Updated `deploy/README.md` to point at the DB-module-owned bootstrap asset.
- Migrated the remaining active UI scenario fixture SQL:
	- `scripts/ui/scenarios/url-filter-toggle.suite.js` now calls `createUrlFilterToggleScenarioFixture` from `news-crawler-db`.
	- `tools/dev/check_all_coverage.js` now uses `db.placeHubDiagnostics.getCountryMappingCoverageByHosts`, has a `require.main` guard, and no longer runs on require.
	- Added `createUrlFilterToggleScenarioFixture` to `news-crawler-db/src/db/sqlite/access/legacy-ui-analytics.ts`.
	- Added `getCountryMappingCoverageByHosts` to `news-crawler-db/src/db/sqlite/access/placeHubDiagnostics.ts`.
- Added final residual scan classification:
	- `config/db-boundary-residual-classifications.json` records every remaining broad-scan path as external SPARQL, regex parser loops, generated/static bundles, source-analysis tooling, docs/guidance, UI lab checks, or a deprecated source mutator.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/placeHubDiagnostics.test.ts src/db/__tests__/unit/sqlite/legacyCheckFixtures.test.ts` passed, 2 files / 9 tests. The known legacy news-source bootstrap warning still appears from copied seeder compatibility code.
	- news-crawler-db: `npm run build` passed.
	- copilot-dl-news: `node --check scripts/ui/scenarios/url-filter-toggle.suite.js && node --check tools/dev/check_all_coverage.js` passed.
	- copilot-dl-news: `config/db-boundary-residual-classifications.json` parsed successfully.
	- copilot-dl-news: focused scan of `deploy/scripts/init-db.sql`, `scripts/ui/scenarios/url-filter-toggle.suite.js`, `tools/dev/check_all_coverage.js`, relocated migration placeholders, and archived SQL placeholder returned no matches.
	- copilot-dl-news: broad active-path scan now reports `125` matches.
	- copilot-dl-news: residual classification verification reported `classified-ok 62 residual paths`.
	- `git diff --check` passed for touched files in both repos.
- Current DB-boundary status:
	- Active runtime, UI, checks, and operational tools no longer own meaningful SQLite/Postgres SQL, schema contracts, DB fixture SQL, or driver calls in `copilot-dl-news`.
	- Remaining broad-scan matches are classified non-DB-boundary residuals: SPARQL/external query strings, regex parser `.exec` loops, source-analysis/dev tooling strings, generated/static bundles, docs/guidance, UI lab checks, and one deprecated source mutator.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; validation used in-memory DB package tests, TypeScript build, syntax checks, path checks, JSON parsing, and static scans only.

## 2026-05-12 Continuation: Legacy SQLite SQL Migration Artifact Relocation

- Relocated remaining copilot-owned SQLite/manual `.sql` artifacts into `news-crawler-db`:
	- Added DB-owned copies under `news-crawler-db/src/db/sqlite/migrations/copilot-legacy/root`.
	- Added DB-owned copies under `news-crawler-db/src/db/sqlite/migrations/copilot-legacy/v1`.
	- Added the archived manual `temp_delete.sql` under `news-crawler-db/src/db/sqlite/migrations/copilot-legacy/manual`.
	- Added `news-crawler-db/src/db/sqlite/migrations/copilot-legacy/README.md` describing the artifact ownership boundary.
	- Replaced the 24 historical copilot `.sql` files in `src/data/db/migrations` and `src/data/db/sqlite/v1/migrations` with non-executable placeholders pointing to `news-crawler-db`.
	- Replaced `tools/manual-tests/archive/temp_delete.sql` with a non-executable placeholder.
- Verification evidence:
	- A copy verification script compared all 24 new DB-module SQL files against `git show HEAD:<old copilot path>` and reported `Verified 24 copied migrations against copilot HEAD content.`
	- `tools/manual-tests/archive/temp_delete.sql` was verified with `cmp` against the new DB-module archive copy.
	- news-crawler-db: `npm run build` passed.
	- copilot-dl-news: focused SQL-pattern scan of `src/data/db/migrations`, `src/data/db/sqlite/v1/migrations`, and `tools/manual-tests/archive/temp_delete.sql` returned no matches.
	- copilot-dl-news: broad active-path scan now reports `139` matches, down from `186`.
	- `git diff --check` passed for the changed copilot migration paths.
- Current remaining broad-scan classifications:
	- Deployment/Postgres bootstrap artifact: `deploy/scripts/init-db.sql`, still mounted by `deploy/docker-compose.yml`; this should move only when the deployment flow can consume a DB-module owned Postgres init artifact.
	- Docs/examples: correction/deploy/debug README text and local agent guidance.
	- Generated/static browser output: built UI bundles and source maps under `src/ui/server/**/public` and demo/art playground bundles.
	- Dev/source-analysis tooling false positives: JS/SVG/Markdown scanners, docs bridge scripts, source edit tools, agent-runner tooling, knowledge freshness/graph tools, and string fixtures that inspect source text.
	- Non-DB query/parser strings: SPARQL query builders in Wikidata/geography code and regex `.exec` loops in sitemap/archive/hub-validator/remote-crawler parsing code.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; validation used content-copy verification, TypeScript build, and static scans only.

## 2026-05-12 Continuation: Query Time Budget Helper

- Migrated the remaining copilot-owned query timing wrapper into `news-crawler-db`:
	- `src/data/db/sqlite/v1/queries/helpers/queryTimeBudget.js` is now a compatibility wrapper with no local prepared-statement or SQL ownership.
	- `news-crawler-db/src/db/sqlite/access/queryTelemetry.ts` now exports `timedQuery`, `instrumentStatement`, `createTimedDb`, and `DEFAULT_QUERY_TIME_BUDGET_THRESHOLD_MS`.
	- `news-crawler-db/src/db/index.ts` re-exports those timing helpers for compatibility callers.
- Added focused in-memory coverage:
	- Extended `news-crawler-db/src/db/__tests__/unit/sqlite/queryTelemetry.test.ts` to cover slow-query warning payloads, statement timing wrappers, and `createTimedDb`.
- Validation evidence:
	- news-crawler-db: `npx vitest run src/db/__tests__/unit/sqlite/queryTelemetry.test.ts` passed, 1 file / 5 tests.
	- news-crawler-db: `npm run build` passed.
	- copilot-dl-news: `node --check src/data/db/sqlite/v1/queries/helpers/queryTimeBudget.js` passed.
	- copilot-dl-news: focused scan of `src/data/db/sqlite/v1/queries/helpers/queryTimeBudget.js` for `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, `CREATE TABLE`, `INSERT INTO`, `SELECT`, `UPDATE`, `DELETE FROM`, `client.query`, `pool.query`, and direct `pg` imports returned no matches.
	- copilot-dl-news: broad active-path scan now reports `186` matches, down from `188`.
	- `git diff --check` passed for touched files in both repos.
- Current remaining broad-scan classifications:
	- Migration/deploy SQL artifacts: `deploy/scripts/init-db.sql`, `src/data/db/migrations/*`, and SQLite v1 `.sql` migration files.
	- Docs/examples: correction/deploy/debug README text and local agent guidance.
	- Generated/static browser output: built UI bundles and source maps under `src/ui/server/**/public` and demo/art playground bundles.
	- Dev/source-analysis tooling false positives: JS/SVG/Markdown scanners, docs bridge scripts, source edit tools, agent-runner tooling, knowledge freshness/graph tools, and string fixtures that inspect source text.
	- Non-DB query/parser strings: SPARQL query builders in Wikidata/geography code and regex `.exec` loops in sitemap/archive/hub-validator/remote-crawler parsing code.
- Safety evidence: no validation was run against `copilot-dl-news/data/news.db`; validation used in-memory DB package tests, TypeScript build, syntax check, and static scans only.
