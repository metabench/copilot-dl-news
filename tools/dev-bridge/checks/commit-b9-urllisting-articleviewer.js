'use strict';
// Commit + push copilot: B9 — queries/ui residue resolved; the v1/queries
// tree is GONE. urlListingNormalized consumers repointed onto ncdb's new
// legacy facade (ncdb cb4038e); articleViewer relocated to
// src/ui/server/services (composition, not DB logic); queues perf test
// moved out of the dying tree. Deletions/moves staged by git mv/rm.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});
git(['add', '--',
  // codemod-rewritten consumers (7)
  'src/ui/render-url-table.js',
  'src/ui/server/dataExplorer/views/shared.js',
  'src/ui/server/dataExplorer/views/urlListing.js',
  'src/ui/server/dataExplorerServer.js',
  'src/ui/server/factsServer.js',
  'src/ui/server/services/metricsService.js',
  'tests/db/sqlite/ui/urlListingNormalized.contract.test.js',
  // moves (recalibrated relatives) — sources staged by git mv
  'src/ui/server/services/articleViewer.js',
  'tests/db/sqlite/ui/queues.performance.test.js',
  'tests/db/sqlite/ui/queues.performance.test.js.disabled',
  // manual repairs (ghost src/db paths + wip lab)
  'wip/labs/news-crawler-db/experiments/002-db-handle-compat.js',
  'scripts/perf/ui-aggregates-bench.js',
  'scripts/ui/capture-url-table-screenshots.js',
  'scripts/ui/capture-data-explorer-screenshots.js',
  // tooling
  'tools/dev-bridge/checks/codemod-adapter-repoint.js',
  'tools/dev-bridge/checks/smoke-uapp-db-repoint.js',
  'tools/dev-bridge/checks/commit-b9-urllisting-articleviewer.js'
]);
git(['commit', '-m',
  'B9: queries/ui residue resolved — the sqlite/v1/queries tree is gone\n\n' +
  'urlListingNormalized.js (11 consumers) had NO SQL of its own — the\n' +
  'B7-era "real logic" note was stale; every query already lived in\n' +
  'ncdb SqliteUrlListingAccess. Its db-first function surface (15\n' +
  'historical names incl. standalone normalizeHostMode/parseHosts) now\n' +
  'lives in ncdb legacy-ui-urlListingNormalized (cb4038e, vitest 6/6);\n' +
  'consumers codemodded (6 src + contract test) or hand-repaired: wip\n' +
  'lab + 3 scripts whose src/db/sqlite ghost requires were broken at\n' +
  'HEAD (capture-*.js, ui-aggregates-bench).\n\n' +
  'articleViewer.js (MIXED: 4 ncdb re-exports + decompress/extract\n' +
  'composition over shared/utils) relocated to\n' +
  'src/ui/server/services/articleViewer.js — composition belongs in\n' +
  'the coordination point, not the DB repo. Relative requires\n' +
  'recalibrated for the new depth (the B7 ICM lesson); sole consumer\n' +
  'dataExplorerServer repointed.\n\n' +
  'queues.performance.test.js (+.disabled) moved to tests/db/sqlite/ui\n' +
  'with its openNewsCrawlerDb relative recalibrated; queries/README.md\n' +
  'retired with the tree.\n\n' +
  'Verified: surface smoke 259 fns + 12 consts; jest 10/10 (contract 4\n' +
  '+ queues perf 6, 123s on host); node --check clean on 14 files;\n' +
  'articleViewer + dataExplorerServer require-resolve proof. \n' +
  'src/data/db: 97 -> 95 js files; sqlite/v1/queries/ no longer exists.']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n').slice(0, 8).join('\n'));
