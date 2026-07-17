'use strict';
// Commit + push deprecated-ui recipe step-3 FINALE: delete the doomed tree
// (src/deprecated-ui + tests/deprecated-ui, 368 files, already staged by
// retire-deprecated-ui.js) plus the smoke-check edit and memory updates.
// Explicit pathspecs keep the owner's concurrent dirty files (.claude/
// settings*, wysiwyg bundle.js) out of the commit.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 50 * 1024 * 1024, timeout: 10 * 60 * 1000
});

// The 368 tree deletions are already staged. Add only the modified/new files.
git(['add', '--',
  'tools/dev-bridge/checks/smoke-analysis-imports.js',
  'tools/dev-bridge/checks/retire-deprecated-ui.js',
  'tools/dev-bridge/checks/commit-depui-step3-final.js',
  'docs/plans/2026-07-17-coordination-point-migration.md',
  'docs/sessions/2026-07-14-recursive-crawl-loop/LOOP_STATE.md'
]);
git(['commit', '-m',
  'Remove src/deprecated-ui tree (deprecated-ui recipe step-3 finale)\n\n' +
  'Coordination-point migration, deprecated-ui removal recipe step 3\n' +
  '(docs/plans/2026-07-17-…md): delete the doomed tree now that every\n' +
  'importer reaching into it has been repointed/retired (steps 1-2 + the\n' +
  'step-3 blocker pass).\n\n' +
  '- git rm -r src/deprecated-ui + tests/deprecated-ui (368 files).\n' +
  '- Pre-delete audit: the only require()s of the tree lived INSIDE it\n' +
  '  (both jest-ignored via package.json testPathIgnorePatterns\n' +
  '  /src/deprecated-ui/ + /tests/deprecated-ui/). No live/mounted app\n' +
  '  code imported it — src/api/server.js, its last non-test src importer,\n' +
  '  was retired in step 2. tests/tools js-scan.test.js uses a separate\n' +
  '  `deprecated-ui-root` fixture, not this tree.\n' +
  '- checks/smoke-analysis-imports.js: drop the analysisRuns re-export shim\n' +
  '  require (the shim died with the tree); the ncdb surface assertions\n' +
  '  above are now the canonical guard for the analysisRuns relocation.\n\n' +
  'Verified post-delete via the bridge: smoke-analysis-imports.js PASS,\n' +
  'tests/server/api/analysis.test.js 13/13.\n\n' +
  'Harmless no-op leftovers for a later tidy sweep: test-config.json still\n' +
  'defines a `deprecated-ui` run-tests profile + /deprecated-ui/ ignore\n' +
  'entries; jest.careful.config and the main jest testPathIgnorePatterns\n' +
  'still list the now-absent paths; backgroundTasksMonitor/main.js comments\n' +
  'reference a `ui:deprecated` server.']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n').slice(0, 10).join('\n'));
