'use strict';
// Commit + push deprecated-ui unwiring step 1 (coordination-point migration):
// ncdb gains listAnalysisRuns/getAnalysisRun, copilot repoints all importers.
// ncdb lands first — copilot's tree depends on it.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const gitIn = (repo) => (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, repo), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});

// ---- 1. news-crawler-db ----
const ncdb = gitIn('news-crawler-db');
ncdb(['add', '--',
  'src/db/index.ts',
  'src/db/sqlite/access/legacy-analysisRuns.ts',
  'src/db/__tests__/unit/sqlite/legacyAnalysisRunsListGet.test.ts'
]);
ncdb(['commit', '-m',
  'analysisRuns: add listAnalysisRuns + getAnalysisRun (+ diagnostics)\n\n' +
  'Ports the last two functions from copilot-dl-news\'s deprecated-ui\n' +
  'analysisRuns service, which was a stale fork of this module (5/7\n' +
  'functions already identical here):\n' +
  '- listAnalysisRuns(db, {limit, offset, includeDetails}): paged\n' +
  '  newest-first listing with the slim column set when details are off.\n' +
  '- getAnalysisRun(db, id, {limitEvents}): composite {run, events},\n' +
  '  events newest-first and bounded — the shape the copilot analysis\n' +
  '  HTTP API serves.\n' +
  '- normalizeRunRow now surfaces `diagnostics` (from summary/lastProgress)\n' +
  '  like the deprecated-ui copy did; additive for existing callers.\n\n' +
  'This makes news-crawler-db the single home of the analysis_runs access\n' +
  'layer so copilot-dl-news can drop its deprecated-ui duplicate\n' +
  '(coordination-point migration, deprecated-ui recipe step 1).\n\n' +
  'vitest: legacyAnalysisRunsListGet.test.ts 3/3.']);
console.log('ncdb committed:', ncdb(['rev-parse', '--short', 'HEAD']).trim());
console.log('ncdb push:', (ncdb(['push']) || 'pushed').trim() || 'pushed');

// ---- 2. copilot-dl-news ----
const cdn = gitIn('copilot-dl-news');
try { cdn(['rm', '-f', '--', 'src/deprecated-ui/shared/propertyEditor.js']); console.log('removed old propertyEditor'); }
catch (e) { console.log('rm skip:', (e.stderr || e.message || '').split('\n')[0]); }
cdn(['add', '--',
  'src/api/routes/analysis.js',
  'src/tools/analysis-run.js',
  'tools/analysis/upgrade-analysis-schema.js',
  'src/background/tasks/taskDefinitions.js',
  'src/deprecated-ui/express/services/analysisRuns.js',
  'src/shared/propertyEditor.js',
  'tests/server/api/analysis.test.js',
  'tools/dev-bridge/checks/probe-ncdb-analysisruns.js',
  'tools/dev-bridge/checks/smoke-analysis-imports.js',
  'tools/dev-bridge/checks/commit-depui-step1.js',
  'docs/plans/2026-07-17-coordination-point-migration.md',
  'docs/sessions/2026-07-14-recursive-crawl-loop/LOOP_STATE.md'
]);
cdn(['commit', '-m',
  'Unwire deprecated-ui step 1: analysisRuns -> news-crawler-db, propertyEditor -> src/shared\n\n' +
  'Coordination-point migration (docs/plans/2026-07-17-…md), deprecated-ui\n' +
  'removal recipe step 1:\n\n' +
  '- analysisRuns: the deprecated-ui service was a stale fork of ncdb\'s\n' +
  '  legacy-analysisRuns (5/7 fns identical). The missing two\n' +
  '  (listAnalysisRuns, getAnalysisRun) + diagnostics now live in ncdb;\n' +
  '  live importers require(\'news-crawler-db\') directly: routes/analysis,\n' +
  '  tools/analysis-run, tools/analysis/upgrade-analysis-schema (a 4th\n' +
  '  importer the plan survey missed). The deprecated-ui file is now a\n' +
  '  re-export shim for internal deprecated-ui consumers and dies with\n' +
  '  the tree in step 3.\n' +
  '- propertyEditor: moved verbatim to src/shared/propertyEditor.js\n' +
  '  (src/shared is the established live home for cross-cutting utils);\n' +
  '  taskDefinitions repointed. No server-side consumer remained inside\n' +
  '  deprecated-ui; its public/js browser copy is untouched.\n' +
  '- tests/server/api/analysis.test.js mocks news-crawler-db instead of\n' +
  '  the deprecated-ui path.\n\n' +
  'Requires news-crawler-db @ HEAD (listAnalysisRuns/getAnalysisRun).\n' +
  'Green: ncdb vitest 3/3; jest analysis 13/13, background-tasks 22/22,\n' +
  'v1 analysisRuns 5/5; checks/smoke-analysis-imports.js PASS.\n\n' +
  'Remaining deprecated-ui blocker: src/api/server.js (+ analyticsHub /\n' +
  'qualityDashboard liveness) — recipe step 2.']);
console.log('copilot committed:', cdn(['rev-parse', '--short', 'HEAD']).trim());
console.log('copilot push:', (cdn(['push']) || 'pushed').trim() || 'pushed');
console.log(cdn(['status', '-sb']).split('\n').slice(0, 4).join('\n'));
