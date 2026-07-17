'use strict';
// DB-consolidation slice 1: git rm the two re-export shims whose consumers
// are now repointed to news-crawler-db directly.
// - queries/ui/cloudCrawl.js: zero importers since slice 0.
// - queries/downloadEvidence.js: 10 importers repointed this slice.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 5 * 60 * 1000
});

for (const f of [
  'src/data/db/sqlite/v1/queries/ui/cloudCrawl.js',
  'src/data/db/queries/downloadEvidence.js'
]) {
  try { git(['rm', '-q', '--', f]); console.log('removed:', f); }
  catch (e) { console.log('rm skip', f, (e.stderr || e.message || '').split('\n')[0]); }
}
console.log(git(['status', '--porcelain']).trim());
