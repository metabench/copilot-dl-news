'use strict';
// Commit + push copilot: A7 — register the remaining built-in tasks in the
// mounted background-task subsystem.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});
git(['add', '--',
  'src/server/background-tasks/mountBackgroundTasks.js',
  'src/server/background-tasks/__tests__/mountBackgroundTasks.test.js',
  'tools/dev-bridge/checks/commit-a7-register-builtins.js',
]);
git(['commit', '-m',
  'A7: register the remaining built-in background tasks\n\n' +
  'The mount registered only ingest-admin-areas; now every taskType with\n' +
  'a real class is registered via a BUILTIN_TASKS map — which IS the\n' +
  'canonical taskType->class mapping (there is none elsewhere; grep:\n' +
  'registerTaskType only in tests + the mount). Mappings: backfill-dates\n' +
  '-> BackfillDatesTask, analysis-run -> AnalysisTask, guess-place-hubs\n' +
  '-> GuessPlaceHubsTask, article-compression -> CompressionTask (Brotli/\n' +
  'article, NOT CompressionLifecycleTask age-tiering), ingest-admin-areas\n' +
  '-> IngestAdminAreasTask. Left out: database-export / gazetteer-import /\n' +
  'database-vacuum (orphan defs, no class) and CompressionLifecycleTask\n' +
  '(orphan class, no def) — reconcile later.\n\n' +
  'Registration is a Map.set; construction/execution only on\n' +
  'createTask+startTask, so infra-heavy tasks are safe to make available.\n' +
  'Per-task try/catch keeps a failing require from dropping the others.\n\n' +
  'Verified: jest 4/4 (BUILTIN_TASKS map completeness = all 5; jest-safe\n' +
  'subset ingest/guess/compression register with correct class + createTask\n' +
  '-- analysis-run/backfill-dates transitively require jsdom/parse5 which\n' +
  'throws under the jest transform, the KNOWN pre-existing issue, but\n' +
  'register fine in production node). LIVE (app restarted, httpOk): POST\n' +
  'create backfill-dates -> pending task #68 (registered); article-\n' +
  'compression + guess-place-hubs param-validate (resolved = registered).\n' +
  'All 5 class-backed taskTypes are now live.',
]);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '--porcelain']).split('\n').filter(l => /^.?[DM]/.test(l)).slice(0, 4).join('\n') || '(no stray tracked changes)');
