'use strict';
// Commit + push DB-consolidation slice 2: delete four pure re-export shims
// (crawlTypes, uiThemes, errors, analysisRuns); path-swap their 6 consumers
// to news-crawler-db. Deletions staged by retire-slice2-shims.js. Explicit
// pathspecs — owner concurrently editing .claude/settings*, wysiwyg
// bundle.js*, docs/INDEX.md, docs/sessions/SESSIONS_HUB.md.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});

git(['add', '--',
  'src/ui/homeCardData.js',
  'src/ui/server/services/themeService.js',
  'src/ui/server/services/metricsService.js',
  'src/ui/server/dataExplorerServer.js',
  'src/ui/server/dataExplorer/views/errors.js',
  'src/data/db/sqlite/v1/__tests__/analysisRuns.test.js',
  'tools/dev-bridge/checks/smoke-uapp-db-repoint.js',
  'tools/dev-bridge/checks/retire-slice2-shims.js',
  'tools/dev-bridge/checks/syntax-check-slice2.js',
  'tools/dev-bridge/checks/commit-db-slice2.js',
  'docs/plans/2026-07-17-coordination-point-migration.md',
  'docs/sessions/2026-07-14-recursive-crawl-loop/LOOP_STATE.md'
]);
git(['commit', '-m',
  'DB-consolidation slice 2: delete crawlTypes/uiThemes/errors/analysisRuns shims\n\n' +
  'Coordination-point migration, DB-consolidation phase\n' +
  '(docs/plans/2026-07-17-…md). Mechanic: repoint-then-delete-shim. All\n' +
  'four are pure re-export shims with NO renames, so every repoint is a\n' +
  'require-path swap; consumer-local aliases (themeService\'s\n' +
  'createThemeInDb etc.) pass through untouched.\n\n' +
  '- Delete queries/ui/crawlTypes.js (zero importers).\n' +
  '- Delete queries/ui/uiThemes.js; repoint themeService.js.\n' +
  '- Delete queries/ui/errors.js; repoint homeCardData.js,\n' +
  '  metricsService.js (inline require), dataExplorerServer.js,\n' +
  '  dataExplorer/views/errors.js.\n' +
  '- Delete queries/analysisRuns.js; repoint its jest test in place\n' +
  '  (src/data/db/sqlite/v1/__tests__/analysisRuns.test.js) — it now\n' +
  '  exercises ncdb\'s functions directly and migrates out whenever the\n' +
  '  sqlite/v1 tree is retired.\n\n' +
  'Verification: surface smoke extended to slices 0+1+2 (39 functions +\n' +
  '4 constants on ncdb\'s runtime surface); analysisRuns jest 5/5 on\n' +
  ':memory: through the repointed require; node --check 6/6\n' +
  '(checks/syntax-check-slice2.js).\n\n' +
  'src/data/db: 197 -> 193 files.']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n').slice(0, 12).join('\n'));
