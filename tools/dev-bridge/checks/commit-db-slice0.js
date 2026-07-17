'use strict';
// Commit + push DB-consolidation slice 0: corrected audit map + first repoint
// (unifiedApp/server.js cloud-crawl + download-evidence -> ncdb direct).
// Explicit pathspecs: the owner is concurrently editing .claude/settings*,
// wysiwyg bundle.js*, docs/INDEX.md and docs/sessions/SESSIONS_HUB.md — none
// of those may be swept into this commit.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});

git(['add', '--',
  'src/ui/server/unifiedApp/server.js',
  'tools/dev-bridge/checks/probe-ncdb-surface.js',
  'tools/dev-bridge/checks/smoke-uapp-db-repoint.js',
  'tools/dev-bridge/checks/commit-db-slice0.js',
  'docs/plans/2026-07-17-coordination-point-migration.md',
  'docs/sessions/2026-07-14-recursive-crawl-loop/LOOP_STATE.md'
]);
git(['commit', '-m',
  'DB-consolidation slice 0: corrected audit + first unifiedApp repoint to ncdb\n\n' +
  'Coordination-point migration, DB-consolidation phase\n' +
  '(docs/plans/2026-07-17-…md):\n\n' +
  'AUDIT (overturns the plan\'s premise): src/data/db is not a 199-file\n' +
  'internal duplicate of news-crawler-db — it is mostly a compatibility\n' +
  'SHIM layer. 143/199 files require ncdb and largely re-export it;\n' +
  'SQLiteNewsDatabase.js is a documented wrapper ("SQL and facade\n' +
  'ownership live in news-crawler-db"). Real-logic residue is small:\n' +
  'TaskEventWriter, EnhancedDatabaseAdapter, migration/orchestrator,\n' +
  'dbAccess, connection, barrels, a few query files, tests. Consumers of\n' +
  'src/data/db paths: ~157 src + 41 tools + 27 tests files (~330\n' +
  'requires). Migration mechanic: repoint consumers, then delete shims.\n\n' +
  'REPOINT (first of the phase): unifiedApp/server.js now takes the\n' +
  'cloud-crawl trio (DEFAULT_CLOUD_CRAWL_TARGETS,\n' +
  'getCloudCrawlStatusSnapshot, normalizeCloudCrawlDomains as\n' +
  'normalizeDomains) and the seven download-evidence functions straight\n' +
  'from news-crawler-db, dropping its requires of the\n' +
  'queries/ui/cloudCrawl and queries/downloadEvidence shims. The\n' +
  'getGlobalStats alias preserves the shim\'s historical rename. Its only\n' +
  'remaining src/data/db import is dbAccess.openNewsDb (real logic).\n\n' +
  'VERIFICATION: checks/smoke-uapp-db-repoint.js proves reference\n' +
  'identity (shim fn === ncdb fn for all 10 names) — a behavioral no-op\n' +
  'by construction. tests/ui/unifiedApp.registry.test.js completed once\n' +
  'with the change (module loads; 2 failures are pre-existing\n' +
  '"Available Apps" HTML-count drift, unrelated to imports) but the ui\n' +
  'suites currently watchdog-timeout on the bridge even at HEAD while\n' +
  'the Electron app holds the 28GB WAL DB — recorded in the plan as a\n' +
  'verification caveat; run them with the app stopped.\n\n' +
  'New bridge utilities: checks/probe-ncdb-surface.js (runtime export\n' +
  'surface of ncdb), checks/smoke-uapp-db-repoint.js (identity smoke).']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n').slice(0, 12).join('\n'));
