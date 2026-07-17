'use strict';
// DB-consolidation slice 4: git rm five pure shims at sqlite/v1/queries/
// top level (consumers repointed to news-crawler-db; renames preserved as
// consumer-side aliases: buildTopicHubMatrixModel→buildMatrixModel,
// selectTopicHubCellRows→selectCellRows, normalizeNonGeoTopicSlug*→
// normalizeLang/SearchQuery).
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 5 * 60 * 1000
});
const BASE = 'src/data/db/sqlite/v1/queries';
for (const n of ['placeHubGuessingUiQueries', 'topicHubGuessingUiQueries',
  'nonGeoTopicSlugsUiQueries', 'guessPlaceHubsQueries', 'crawlObserverUiQueries']) {
  try { git(['rm', '-q', '--', `${BASE}/${n}.js`]); console.log('removed:', n); }
  catch (e) { console.log('rm skip', n, (e.stderr || e.message || '').split('\n')[0]); }
}
const staged = git(['diff', '--cached', '--name-status']).trim().split('\n').filter(Boolean);
console.log(`staged deletions: ${staged.filter((l) => l.startsWith('D')).length}`);
console.log('non-deletion staged:', staged.filter((l) => !l.startsWith('D')).join(' | ') || '(none)');
