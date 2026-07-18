'use strict';
// Commit + push copilot: B11d — dead DB classes deleted, placeHub store
// wrappers retired onto ncdb's short names, TaskEventWriter relocated to
// its long-advertised src/db home. Deletions staged by git rm.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});
git(['add', '--',
  'src/db/TaskEventWriter.js',
  'src/core/crawler/telemetry/TelemetryIntegration.js',
  'tests/crawler/scheduler/CrawlScheduler.test.js',
  'tools/crawl/crawl-remote.js',
  'src/services/PlaceHubPatternLearningService.js',
  'src/services/__tests__/PlaceHubPatternLearningService.test.js',
  'tests/tools/crawl/guardian-place-hubs.test.js',
  'tools/crawl/guardian-place-hubs.js',
  'tools/crawl/lib/guardian-place-hubs.js',
  'src/core/orchestration/dependencies.js',
  'tools/dev-bridge/checks/smoke-uapp-db-repoint.js',
  'tools/dev-bridge/checks/commit-b11d-stores-taskeventwriter.js'
]);
git(['commit', '-m',
  'B11d: dead DB classes + store wrappers retired; TaskEventWriter home\n\n' +
  'CoverageDatabase + QueueDatabase: zero importers, deleted.\n\n' +
  'placeHubUrlPatternsStore + placeHubCandidatesStore were pure compat\n' +
  'wrappers and ncdb exports BOTH the short and Sqlite-prefixed names —\n' +
  'six consumers repoint with no aliases. tools/crawl/lib/\n' +
  'guardian-place-hubs.js embeds the wrapper PATH in plan-metadata\n' +
  'strings its test asserts — strings + expectation updated to name\n' +
  'news-crawler-db directly.\n\n' +
  'TaskEventWriter (548 ln, docblock already claimed\n' +
  '@module src/db/TaskEventWriter): the one-line src/db shim was the\n' +
  'twin of the real file — shim deleted, real file git-mv d into place,\n' +
  'its openNewsCrawlerDb require now same-dir; 3 consumers repointed\n' +
  '(data/db/TaskEventWriter -> db/TaskEventWriter, uniform depth).\n\n' +
  'Verified: TaskEventWriter + consumers load-proofs; jest 72/72\n' +
  '(guardian-place-hubs, PlaceHubPatternLearningService,\n' +
  'CrawlScheduler); smoke 276 fns + 12 consts; sweep clean; all 5\n' +
  'deletions verified staged (no stash cycle this chunk).\n' +
  'src/data/db: 66 -> 61 js files.']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n').slice(0, 8).join('\n'));
