'use strict';
// Stage the retirement of src/api/server.js (unlaunched duplicate of the
// unifiedApp serving surface; last src/ importer of deprecated-ui) and its
// only consumer, tests/api/crawl-status-page.test.js. git rm removes the
// working files so the affected jest suite can prove the tree is coherent
// BEFORE the commit script runs.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 5 * 60 * 1000
});

for (const f of ['src/api/server.js', 'tests/api/crawl-status-page.test.js']) {
  try { git(['rm', '-f', '--', f]); console.log('removed:', f); }
  catch (e) { console.log('rm skip', f, (e.stderr || e.message || '').split('\n')[0]); }
}
console.log(git(['status', '--porcelain']).trim());
