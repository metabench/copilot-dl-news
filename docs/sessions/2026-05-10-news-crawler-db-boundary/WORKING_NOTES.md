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
	- Postgres legacy runtime: `src/data/db/postgres/v1/PostgresNewsDatabase.js` and `queries/analysis.analysePagesCore.js`.
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
	- Postgres legacy runtime: `src/data/db/postgres/v1/PostgresNewsDatabase.js` and `queries/analysis.analysePagesCore.js`.
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
