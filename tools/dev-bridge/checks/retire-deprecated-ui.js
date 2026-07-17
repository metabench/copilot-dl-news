'use strict';
// Step-3 FINALE: delete the doomed src/deprecated-ui tree + its test dir.
// Precondition audit (this turn): the only require()s of the tree live INSIDE
// it (both jest-ignored via package.json testPathIgnorePatterns
// /src/deprecated-ui/ + /tests/deprecated-ui/); the sole external runtime
// consumer, checks/smoke-analysis-imports.js, had its shim require removed
// first. No live/mounted app code imports the tree (src/api/server.js — its
// last non-test src importer — was retired in step 2). So this is a pure
// git rm -r with no repoint needed.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 50 * 1024 * 1024, timeout: 10 * 60 * 1000
});

for (const dir of ['src/deprecated-ui', 'tests/deprecated-ui']) {
  try {
    const out = git(['rm', '-r', '-q', '--', dir]);
    console.log('removed:', dir, out ? out.trim() : '');
  } catch (e) { console.log('rm skip', dir, (e.stderr || e.message || '').split('\n')[0]); }
}
// Summarise the staged deletion counts without dumping hundreds of paths.
const staged = git(['diff', '--cached', '--name-status']).trim().split('\n').filter(Boolean);
const deleted = staged.filter((l) => l.startsWith('D')).length;
console.log(`staged deletions: ${deleted}`);
console.log('non-deletion staged entries:');
console.log(staged.filter((l) => !l.startsWith('D')).join('\n') || '(none)');
