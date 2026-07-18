'use strict';
// Commit + push copilot: B10c — the v1 core is gone. ncdb side is 10a9d56
// (legacy-connection). Deletions were staged by git rm; stash baselines may
// have unstaged them — explicit pathspecs restage everything.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});
git(['add', '--',
  // deletions (13)
  'src/data/db/sqlite/v1/index.js',
  'src/data/db/sqlite/v1/connection.js',
  'src/data/db/sqlite/v1/ensureDb.js',
  'src/data/db/sqlite/v1/schema.js',
  'src/data/db/sqlite/v1/schemaMetadata.js',
  'src/data/db/sqlite/v1/seeders.js',
  'src/data/db/sqlite/v1/seed-utils.js',
  'src/data/db/sqlite/v1/instrumentation.js',
  'src/data/db/sqlite/v1/instrumentedDb.js',
  'src/data/db/sqlite/v1/tools/dedupePlaceSources.js',
  'src/data/db/sqlite/v1/__tests__/connection.fast-path.test.js',
  'src/data/db/sqlite/v1/__tests__/ensureDatabase.fast-path.test.js',
  'src/data/db/sqlite/v1/__tests__/exports.test.js',
  // new wrapper + rewired barrels
  'src/db/ensureNewsDb.js',
  'src/data/db/sqlite/index.js',
  'src/data/db/sqlite/ensureDb.js',
  // repointed consumers
  'tools/db/db-query.js',
  'tools/db/db-table-sizes.js',
  'tools/db/vacuum-db.js',
  'checks/place-context-filter.check.js',
  'checks/enhanced-place-extraction.check.js',
  'wip/labs/gazetteer-loading/experiments/001-matcher-performance/run.js',
  'wip/labs/gazetteer-loading/experiments/002-incremental-loading/run.js',
  'wip/labs/gazetteer-loading/experiments/003-query-patterns/run.js',
  'src/__tests__/db.adapters.test.js',
  'src/shared/utils/CompressionAnalytics.js',
  'src/tools/milestones.js',
  'src/tools/maintain-db.js',
  'src/tools/analyze-post-run.js',
  'src/bootstrap/bootstrapDbLoader.js',
  'tests/test-place-matching.js',
  'src/data/db/sqlite/v1/__tests__/article-cache-404.test.js',
  'src/data/db/sqlite/v1/__tests__/domain-helpers.test.js',
  'src/data/db/sqlite/v1/__tests__/fetch-history.test.js',
  'src/data/db/sqlite/v1/__tests__/layout-tables.test.js',
  'src/test-utils/db-helpers.js',
  'src/core/crawler/CountryHubBehavioralProfile.js',
  'src/data/db/newsCrawlerDbCompat.js',
  'src/data/db/queries/analysisQueries.js',
  'src/services/__tests__/CountryHubMatcher.test.js',
  'tools/compression/find-compression-settings.js',
  'tools/migration-cli.js',
  'tools/schema/check-schema-smoke.js',
  // tooling + docs
  'tools/dev-bridge/checks/smoke-uapp-db-repoint.js',
  'tools/dev-bridge/checks/commit-b10c-v1core.js',
  'docs/sessions/2026-07-14-recursive-crawl-loop/LOOP_STATE.md',
  'docs/plans/2026-07-17-coordination-point-migration.md'
]);
git(['commit', '-m',
  'B10c: the v1 core is gone — connection orchestration lives in ncdb\n\n' +
  'ncdb 10a9d56 (legacy-connection) absorbed connection.js: it was pure\n' +
  'orchestration over mechanisms ncdb already exported. The fast-path\n' +
  'jest suites are ported BEHAVIORALLY to vitest (fingerprint row +\n' +
  'verbose-log observation), so the v1/schema spy seam retires properly.\n\n' +
  'NEW src/db/ensureNewsDb.js = the project wiring the core carried:\n' +
  'findProjectRoot bootstrap discovery, default data/news.db path, and\n' +
  'the schema-ensured createSQLiteDatabase factory (ncdb exports a\n' +
  'same-named factory that does NOT ensure schema — not interchangeable).\n' +
  'The sqlite/ barrel + sqlite/ensureDb.js survive, rewired onto it, and\n' +
  'now export ensureGazetteer — NewsCrawler always destructured it from\n' +
  'the barrel and silently got undefined at HEAD.\n\n' +
  '26 consumers repointed (8 openDatabase -> openSqliteNewsDatabase\n' +
  'alias, fixing 5 ghost src/db paths; the rest -> ensureNewsDb). A\n' +
  'post-delete grep sweep caught 7 stragglers beyond the index-importer\n' +
  'census (CountryHubBehavioralProfile lazy require, newsCrawlerDbCompat,\n' +
  'queries/analysisQueries, CountryHubMatcher.test,\n' +
  'find-compression-settings, migration-cli, check-schema-smoke).\n\n' +
  'Deleted 13 files. Verified: smoke 266 fns + 12 consts; end-to-end\n' +
  'temp ensureDb (schema + real bootstrap planet seed + fingerprint);\n' +
  'NewsCrawler load proof; jest 90 passed across affected suites — all\n' +
  '4 failures stash-baselined pre-existing (article-cache-404,\n' +
  'domain-helpers, CountryHubMatcher x2 = place_hubs.url test drift).\n' +
  'src/data/db: 85 -> 71 js files.']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n').slice(0, 8).join('\n'));
