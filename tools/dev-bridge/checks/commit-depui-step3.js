'use strict';
// Commit + push deprecated-ui recipe step-3 BLOCKER CLEARING: relocate
// IntelligentCrawlerManager into src/core/crawler beside its live testers
// (fixing the relative require the naive git mv left dangling) + git rm the
// remaining dead consumers of the doomed tree. Explicit pathspecs only, so
// the owner's concurrent dirty files (.claude/settings*, wysiwyg bundle.js)
// and untracked tests/fixtures/smoke-tests are NOT swept in.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});

// Stage only the modified/new files of this chunk. The rename of ICM and the
// five `git rm` deletions (server-connection.test.js, benchmarks/run.js, the
// three manual-tests) were already staged by clear-depui-blockers.js and
// remain in the index — re-adding now-absent paths errors, so they are not
// listed. Explicit pathspecs keep the owner's dirty .claude/settings* and
// wysiwyg bundle.js out of the commit.
git(['add', '--',
  'src/core/crawler/IntelligentCrawlerManager.js',
  'src/core/crawler/__tests__/IntelligentCrawlerManager.dynamic-replanning.test.js',
  'src/core/crawler/__tests__/phase-123-integration.test.js',
  'package.json',
  'tools/dev-bridge/checks/clear-depui-blockers.js',
  'tools/dev-bridge/checks/commit-depui-step3.js',
  'docs/plans/2026-07-17-coordination-point-migration.md',
  'docs/sessions/2026-07-14-recursive-crawl-loop/LOOP_STATE.md'
]);
git(['commit', '-m',
  'Clear deprecated-ui recipe step-3 blockers (relocate ICM + retire dead consumers)\n\n' +
  'Coordination-point migration, deprecated-ui removal recipe step 3\n' +
  '(docs/plans/2026-07-17-…md) — clear the importers that still reached\n' +
  'into src/deprecated-ui so the tree can be deleted next.\n\n' +
  '- Relocate IntelligentCrawlerManager.js from\n' +
  '  src/deprecated-ui/express/services/ to src/core/crawler/ (its only\n' +
  '  live testers are the two src/core/crawler/__tests__ suites). The\n' +
  '  naive git mv left the module\'s lone relative require\n' +
  '  (../../../shared/utils/domainUtils) dangling at the new, shallower\n' +
  '  depth — invisible while it lived under the jest-ignored deprecated-ui\n' +
  '  tree, fatal once it ran under src/core. Recalibrated to ../../ .\n' +
  '- Repoint both core tests (dynamic-replanning, phase-123-integration)\n' +
  '  to ../IntelligentCrawlerManager. Green: 27/27 + 9/9.\n' +
  '- git rm dead consumers with no live importer: tools/benchmarks/run.js\n' +
  '  (and its now-dead `benchmarks` package.json script),\n' +
  '  tools/manual-tests/{test-gazetteer-aware-planning,test-geography-crawl,\n' +
  '  verify-queues-impl}.js, and tests/server-connection.test.js (a running\n' +
  '  suite that imported deprecated-ui/express/server).\n\n' +
  'deprecated-ui/express/server.js and the deprecated-ui ICM tests still\n' +
  'name the old module path, but /src/deprecated-ui/ is jest-ignored\n' +
  '(package.json testPathIgnorePatterns) and is deleted in the step-3\n' +
  'finale. Pre-existing, unrelated failures in src/core/crawler/__tests__\n' +
  '(placeHubs.data, ProblemResolutionService, utils.safeCall) are left for\n' +
  'a later core-crawler test-drift pass.']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n').slice(0, 12).join('\n'));
