'use strict';
// B6+B6b: git rm 13 pure v1 gazetteer shims + the renamed-adapter trio
// (searchAdapter consumers repointed with aliases; workspaceAdapter's
// renamed generateSlug consumed nowhere; userAdapter had no live
// consumers). Old-layer sqlite/queries/gazetteer.places.js became a named
// re-export from ncdb (it previously re-required the dying v1 shim).
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 5 * 60 * 1000
});
const BASE = 'src/data/db/sqlite/v1/queries';
const FILES = ['gazetteer.attributes', 'gazetteer.deduplication', 'gazetteer.duplicates',
  'gazetteer.export', 'gazetteer.ingest', 'gazetteer.names', 'gazetteer.osm',
  'gazetteer.places', 'gazetteer.populateTool', 'gazetteer.progress',
  'gazetteer.search', 'gazetteer.utils', 'gazetteerPlaceNames',
  'searchAdapter', 'userAdapter', 'workspaceAdapter'];
for (const n of FILES) {
  try { git(['rm', '-q', '--', `${BASE}/${n}.js`]); console.log('removed:', n); }
  catch (e) { console.log('rm skip', n, (e.stderr || e.message || '').split('\n')[0]); }
}
const staged = git(['diff', '--cached', '--name-status']).trim().split('\n').filter(Boolean);
console.log(`staged deletions: ${staged.filter((l) => l.startsWith('D')).length}`);
