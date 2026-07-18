'use strict';
// Commit + push copilot: B11a — queryTelemetry + analysisQueries retired,
// four ledger failures cleared at their roots. ncdb side: 8b4203f + 3727b55.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});
// Deletions of queryTelemetry.js + queries/analysisQueries.js are already
// staged by git rm (git add on a vanished path errors).
git(['add', '--',
  'src/api/routes/analysis.js',
  'tests/server/api/analysis.test.js',
  'src/background/tasks/AnalysisTask.js',
  'src/tools/analysis-run.js',
  'src/data/db/sqlite/index.js',
  'src/intelligence/planner/plugins/QueryCostEstimatorPlugin.js',
  'src/intelligence/planner/__tests__/QueryCostEstimatorPlugin.test.js',
  'src/ui/server/queryTelemetry/server.js',
  'src/data/db/__tests__/queryTelemetry.test.js',
  'tools/dev-bridge/checks/apply-latest-fetch-view.js',
  'tools/dev-bridge/checks/smoke-uapp-db-repoint.js',
  'tools/dev-bridge/checks/commit-b11a-telemetry-analysis.js',
  'docs/sessions/2026-07-14-recursive-crawl-loop/LOOP_STATE.md',
  'docs/plans/2026-07-17-coordination-point-migration.md'
]);
git(['commit', '-m',
  'B11a: queryTelemetry + analysisQueries retired; 4 ledger fails fixed\n\n' +
  'latest_fetch ROOT CAUSE: five ncdb modules query the view; no schema\n' +
  'path nor the live DB ever created it (sqlite_master probe: absent in\n' +
  'any form — urlListing try/catch fallbacks masked it in prod;\n' +
  'getArticlesNeedingAnalysis threw everywhere). ncdb 3727b55 adds the\n' +
  'canonical view; applied to the live DB app-stopped via\n' +
  'checks/apply-latest-fetch-view.js -> 52,631 rows serving, app\n' +
  'restarted httpOk.\n\n' +
  '_getWriterForDb: always exported by ncdb queryTelemetry.ts at module\n' +
  'level, dropped by the index block — surfaced (8b4203f).\n\n' +
  'queryTelemetry.js was pure ncdb delegation; queries/analysisQueries\n' +
  'was a handle-coercion facade -> absorbed as ncdb\n' +
  'legacy-analysisQueriesFacade (vitest 5/5). Both retired; 9 consumers\n' +
  'repointed (analysis route folds into one ncdb destructure;\n' +
  'analysis.test merges the facade fakes into its existing full\n' +
  "jest.mock('news-crawler-db')). BONUS: QueryCostEstimatorPlugin.test\n" +
  "ghost '../../../plugins/' requires fixed (planner/plugins is real).\n\n" +
  'NOW GREEN (previously ledgered): queryTelemetry.test,\n' +
  'domain-helpers, QueryCostEstimatorPlugin 5/5, analysis 13/13.\n' +
  'Smoke 273 fns + 12 consts. src/data/db: 71 -> 69 js files;\n' +
  'the queries/ dir no longer exists.']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n').slice(0, 8).join('\n'));
