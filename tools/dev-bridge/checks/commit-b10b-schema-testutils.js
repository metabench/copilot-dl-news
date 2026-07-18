'use strict';
// Commit + push copilot: B10b — sqlite/schema.js outer shim + v1/test-utils
// retired. v1/schema.js deliberately SURVIVES as connection.js's jest-spy
// seam (connection.fast-path.test spies the shared module object; ncdb's
// tsc dist exports are getter-shaped and not reliably spyable) — it dies
// with connection.js in the endgame.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});
git(['add', '--',
  'src/data/db/sqlite/schema.js',
  'src/data/db/sqlite/v1/test-utils.js',
  'src/data/db/sqlite/v1/index.js',
  'src/data/db/__tests__/queryTelemetry.test.js',
  'src/intelligence/planner/__tests__/QueryCostEstimatorPlugin.test.js',
  'src/data/db/sqlite/v1/__tests__/gazetteer.attributes.test.js',
  'src/data/db/sqlite/v1/__tests__/getTopCitiesPerCountry.test.js',
  'src/data/db/sqlite/v1/__tests__/placePageMappings.test.js',
  'src/data/db/sqlite/v1/__tests__/article-cache-404.test.js',
  'src/data/db/sqlite/v1/__tests__/domain-helpers.test.js',
  'src/data/db/sqlite/v1/__tests__/ensureDatabase.fast-path.test.js',
  'src/data/db/sqlite/v1/__tests__/fetch-history.test.js',
  'src/data/db/sqlite/v1/__tests__/layout-tables.test.js',
  'src/services/__tests__/ArticleXPathService.test.js',
  'src/intelligence/analysis/__tests__/page-analyzer-xpath.test.js',
  'tests/e2e-features/guardian-1000-page-crawl-persists-to-db.e2e.test.js',
  'tests/e2e-online/live-crawl-persists-to-db.manual.test.js',
  'tests/integration/__tests__/live-guardian-crawl.test.js',
  'tools/dev-bridge/checks/smoke-uapp-db-repoint.js',
  'tools/dev-bridge/checks/commit-b10b-schema-testutils.js'
]);
git(['commit', '-m',
  'B10b: sqlite/schema outer shim + v1/test-utils retired\n\n' +
  'sqlite/schema.js (pure shim over v1/schema) deleted; its 2 test\n' +
  'importers + 6 other v1/schema consumers now alias the SqliteV1-infix\n' +
  'ncdb sources back to the historical short names\n' +
  '(initializeSqliteV1Schema, initSqliteV1GazetteerTables).\n' +
  'v1/schema.js itself SURVIVES with exactly 2 importers as the jest-spy\n' +
  'seam for connection.js (spyOn needs the shared mutable module object;\n' +
  'ncdb dist exports are getter-shaped) — retires with connection.js.\n\n' +
  'v1/test-utils.js deleted: createTempDb (returns a PATH) mapped onto\n' +
  'src/test-utils/db-helpers createTempDbPath — same contract; the\n' +
  'name-twin db-helpers.createTempDb returns a HANDLE, so consumers\n' +
  'alias createTempDbPath: createTempDb (8 files: 5 v1 __tests__ + 3\n' +
  'e2e/manual suites). The 2 remaining test-utils references live in\n' +
  'long-ghosted suites (StructureMiner, layoutAdapter — every require\n' +
  'in them points at the pre-migration src/db tree; fix-or-retire pass).\n\n' +
  'Verified: smoke 263 fns + 12 consts; 10 repointed suites green incl.\n' +
  'connection.fast-path (spy seam intact); db-helpers contract probe.\n' +
  'PRE-EXISTING at HEAD (stash-baselined): queryTelemetry +\n' +
  'QueryCostEstimatorPlugin fail on private _getWriterForDb API drift\n' +
  '(5 tests) — untouched by this repoint.\n' +
  'src/data/db: 87 -> 85 js files.']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n').slice(0, 8).join('\n'));
