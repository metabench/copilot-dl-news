'use strict';
// Commit + push DB-consolidation slice 3: delete 21 shim files, repoint 10
// consumers to news-crawler-db. Deletions staged by retire-slice3-shims.js.
// Explicit pathspecs — owner concurrently editing .claude/settings*, wysiwyg
// bundle.js*, docs/INDEX.md, docs/sessions/SESSIONS_HUB.md.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});

git(['add', '--',
  'src/ui/server/dataExplorerServer.js',
  'src/ui/server/dataExplorer/views/crawls.js',
  'src/ui/server/dataExplorer/views/config.js',
  'src/ui/server/dataExplorer/views/classifications.js',
  'src/ui/homeCardData.js',
  'src/ui/server/services/metricsService.js',
  'src/ui/server/analyticsHub/PatternSharingService.js',
  'src/ui/server/analyticsHub/AnalyticsService.js',
  'src/ui/server/qualityDashboard/QualityMetricsService.js',
  'src/data/db/sqlite/v1/queries/ui/__tests__/queues.performance.test.js',
  'tools/dev-bridge/checks/smoke-uapp-db-repoint.js',
  'tools/dev-bridge/checks/retire-slice3-shims.js',
  'tools/dev-bridge/checks/syntax-check-slice3.js',
  'tools/dev-bridge/checks/commit-db-slice3.js',
  'docs/plans/2026-07-17-coordination-point-migration.md',
  'docs/sessions/2026-07-14-recursive-crawl-loop/LOOP_STATE.md'
]);
git(['commit', '-m',
  'DB-consolidation slice 3: delete 21 ui-query shims, repoint 10 consumers\n\n' +
  'Coordination-point migration (docs/plans/2026-07-17-…md), mechanic:\n' +
  'repoint-then-delete-shim.\n\n' +
  '- Delete 19 pure re-export shims under sqlite/v1/queries/ui/ (crawls,\n' +
  '  crawlEvents, configuration, storage, recentDomains, domainDetails,\n' +
  '  domainCounts, domainListing, domainSummary, urlDetails, placeHubs,\n' +
  '  queues, gazetteerPlace, gazetteerCountry, analytics, qualityMetrics,\n' +
  '  patternSharing, classificationTypes, uiCachedMetrics) and the 2\n' +
  '  old-layer shims-of-shims under sqlite/queries/ui/ (crawlEvents,\n' +
  '  classificationTypes — zero importers). gazetteerPlace/Country carried\n' +
  '  full rename maps but had zero consumers: delete-only.\n' +
  '- Repoint 10 consumers; dataExplorerServer\'s nine ui-shim requires\n' +
  '  collapse into ONE news-crawler-db destructure. Shim renames preserved\n' +
  '  as consumer-side aliases: normalizeDomainListingSortColumn/Direction\n' +
  '  -> normalizeSortColumn/Direction, resolveUiCachedMetricsDbHandle ->\n' +
  '  resolveDbHandle.\n' +
  '- Deliberately NOT touched (real logic, migrate-later candidates):\n' +
  '  queries/ui/urlListingNormalized.js and queries/ui/articleViewer.js\n' +
  '  (decompression + HtmlArticleExtractor composition over ncdb queries).\n\n' +
  'Verified: surface smoke 75 fns + 4 consts (slices 0-3,\n' +
  'checks/smoke-uapp-db-repoint.js); dataExplorerServer jest 30/30 with\n' +
  'the app stopped (full server boot through the consolidated require);\n' +
  'queues.performance 6/6 through the repointed require; node --check\n' +
  '10/10.\n\n' +
  'src/data/db: 193 -> 172 files.']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n').slice(0, 10).join('\n'));
