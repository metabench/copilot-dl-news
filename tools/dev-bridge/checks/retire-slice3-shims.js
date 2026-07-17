'use strict';
// DB-consolidation slice 3: git rm 19 pure re-export shims under
// sqlite/v1/queries/ui/ (consumers repointed to news-crawler-db; rename
// maps preserved via consumer-side aliases: domainListing's
// normalizeSortColumn/Direction, uiCachedMetrics' resolveDbHandle) plus the
// 2 old-layer shims-of-shims under sqlite/queries/ui/ (zero importers).
// NOT touched: urlListingNormalized (real logic, migration candidate) and
// articleViewer (real decompression/extraction logic over ncdb queries).
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 5 * 60 * 1000
});

const V1 = 'src/data/db/sqlite/v1/queries/ui';
const OLD = 'src/data/db/sqlite/queries/ui';
const FILES = [
  ...['crawls', 'crawlEvents', 'configuration', 'storage', 'recentDomains',
    'domainDetails', 'domainCounts', 'domainListing', 'domainSummary',
    'urlDetails', 'placeHubs', 'queues', 'gazetteerPlace', 'gazetteerCountry',
    'analytics', 'qualityMetrics', 'patternSharing', 'classificationTypes',
    'uiCachedMetrics'].map((n) => `${V1}/${n}.js`),
  `${OLD}/crawlEvents.js`,
  `${OLD}/classificationTypes.js`
];
for (const f of FILES) {
  try { git(['rm', '-q', '--', f]); console.log('removed:', f); }
  catch (e) { console.log('rm skip', f, (e.stderr || e.message || '').split('\n')[0]); }
}
const staged = git(['diff', '--cached', '--name-status']).trim().split('\n').filter(Boolean);
console.log(`staged deletions: ${staged.filter((l) => l.startsWith('D')).length}`);
console.log('non-deletion staged:', staged.filter((l) => !l.startsWith('D')).join(' | ') || '(none)');
