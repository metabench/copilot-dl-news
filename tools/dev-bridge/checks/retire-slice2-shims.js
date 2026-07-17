'use strict';
// DB-consolidation slice 2: git rm four pure re-export shims (no renames)
// whose consumers are repointed to news-crawler-db directly.
// - queries/ui/crawlTypes.js: zero importers.
// - queries/ui/uiThemes.js: 1 importer (themeService) repointed.
// - queries/ui/errors.js: 4 importers repointed.
// - queries/analysisRuns.js: 1 importer (its own test) repointed.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 5 * 60 * 1000
});

for (const f of [
  'src/data/db/sqlite/v1/queries/ui/crawlTypes.js',
  'src/data/db/sqlite/v1/queries/ui/uiThemes.js',
  'src/data/db/sqlite/v1/queries/ui/errors.js',
  'src/data/db/sqlite/v1/queries/analysisRuns.js'
]) {
  try { git(['rm', '-q', '--', f]); console.log('removed:', f); }
  catch (e) { console.log('rm skip', f, (e.stderr || e.message || '').split('\n')[0]); }
}
console.log(git(['status', '--porcelain']).trim());
