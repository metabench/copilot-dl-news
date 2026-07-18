'use strict';
// Commit + push copilot: B10a — v1-root retirement begins: 7 dead files +
// the SQLiteNewsDatabase compat shim. Also completes a B6 miss (two
// sibling-relative gazetteer test requires the codemod never matched).
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});
git(['add', '--',
  // deletions (a stash cycle unstaged the earlier git rm; add restages)
  'src/data/db/sqlite/v1/ArticleOperations.js',
  'src/data/db/sqlite/v1/SchemaInitializer.js',
  'src/data/db/sqlite/v1/StatementManager.js',
  'src/data/db/sqlite/v1/UtilityFunctions.js',
  'src/data/db/sqlite/v1/newsSourcesSeeder.js',
  'src/data/db/sqlite/v1/access.js',
  'src/data/db/sqlite/v1/schema-definitions.js',
  'src/data/db/sqlite/v1/SQLiteNewsDatabase.js',
  // repointed consumers
  'src/data/db/dbAccess.js',
  'src/data/db/newsCrawlerDbCompat.js',
  'src/data/db/sqlite/v1/index.js',
  'src/intelligence/analysis/__tests__/page-analyzer-xpath.test.js',
  'src/services/__tests__/ArticleXPathService.test.js',
  // B6-miss repairs
  'src/data/db/sqlite/v1/__tests__/getTopCitiesPerCountry.test.js',
  'src/data/db/sqlite/v1/__tests__/gazetteer.attributes.test.js',
  // tooling
  'tools/dev-bridge/checks/smoke-uapp-db-repoint.js',
  'tools/dev-bridge/checks/commit-b10a-v1root.js'
]);
git(['commit', '-m',
  'B10a: v1-root retirement — 7 dead files + SQLiteNewsDatabase shim\n\n' +
  'Deleted (importer-census-verified zero consumers): ArticleOperations,\n' +
  'SchemaInitializer, StatementManager, UtilityFunctions,\n' +
  'newsSourcesSeeder, access (4 Sqlite-infix renames, no consumers),\n' +
  'schema-definitions (7 renames, no consumers).\n\n' +
  'SQLiteNewsDatabase.js retired: 5 consumers (dbAccess,\n' +
  'newsCrawlerDbCompat, v1/index, 2 xpath test suites) now resolve\n' +
  'ncdb.NewsDatabase || ncdb.SQLiteNewsDatabase inline — the exact\n' +
  'resolution the shim performed.\n\n' +
  'B6 MISS COMPLETED: getTopCitiesPerCountry.test + gazetteer.attributes\n' +
  '.test used sibling-relative ../queries/gazetteer.* requires the B6\n' +
  'codemod regex never matched (anchored on the deep path) — silently\n' +
  'unloadable for two turns; repointed (shim-verified identical names)\n' +
  'and green again: 7/7.\n\n' +
  'Verified: smoke 261 fns + 12 consts; v1 barrel + dbAccess +\n' +
  'newsCrawlerDbCompat require-load proof; node --check clean.\n' +
  'PRE-EXISTING at HEAD (stash-baselined, not regressions): both xpath\n' +
  'suites die on jsdom nested parse5 ESM (jest transform drift);\n' +
  'article-cache-404 + domain-helpers each have 1 behavior failure\n' +
  '(missing latest_fetch view / db-404 contract drift). Small-batch.\n' +
  'src/data/db: 95 -> 87 js files.']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n').slice(0, 8).join('\n'));
