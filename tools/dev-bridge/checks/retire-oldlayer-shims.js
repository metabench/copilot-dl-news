'use strict';
// B7: git rm the old-layer sqlite/queries/* shims. topicKeywords.js STAYS
// (real error-tolerance wrapper logic — migrate-later). Consumers of the
// deleted files repointed to ncdb with Classic-prefixed sources preserved.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 5 * 60 * 1000
});
const BASE = 'src/data/db/sqlite/queries';
for (const n of ['gazetteer.attributes', 'gazetteer.deduplication', 'gazetteer.ingest',
  'gazetteer.places', 'gazetteer.utils', 'gazetteerPlaceNames',
  'maintenance', 'schema', 'rateLimitAnalysis']) {
  try { git(['rm', '-q', '--', `${BASE}/${n}.js`]); console.log('removed:', n); }
  catch (e) { console.log('rm skip', n, (e.stderr || e.message || '').split('\n')[0]); }
}
const staged = git(['diff', '--cached', '--name-status']).trim().split('\n').filter(Boolean);
console.log(`staged deletions: ${staged.filter((l) => l.startsWith('D')).length}`);
