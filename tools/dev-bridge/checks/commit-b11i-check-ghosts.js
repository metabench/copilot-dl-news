'use strict';
// Commit + push copilot: B11i — fix the two ghost requires in
// src/data/db/checks/ left by the B11c barrel relocation.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});
git(['add', '--',
  'src/data/db/checks/crawler-components.check.js',
  'src/data/db/checks/scheduler-instantiation.check.js',
  'tools/dev-bridge/checks/commit-b11i-check-ghosts.js',
]);
git(['commit', '-m',
  'B11i: fix two ghost requires in data/db/checks (barrel relocation)\n\n' +
  "crawler-components.check.js and scheduler-instantiation.check.js\n" +
  "still required '../index' — the data/db barrel relocated to src/db\n" +
  'in B11c. Their 9 sibling checks were codemodded to require\n' +
  "'../../../db' at the time; these two used the bare-index form the\n" +
  'codemod regex did not match (the recurring dot/index blind spot).\n' +
  'Repointed to match the siblings; a load-test now passes for all 11\n' +
  'files in the directory. These are dormant diagnostics (no\n' +
  'package.json / test-config / runner reference), kept for parity\n' +
  'with the 9 siblings the migration retained rather than retired.',
]);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '--porcelain']).split('\n').filter(l => /^.?[DM]/.test(l)).slice(0, 4).join('\n') || '(no stray tracked changes)');
