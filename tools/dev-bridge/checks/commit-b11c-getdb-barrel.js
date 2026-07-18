'use strict';
// Commit + push copilot: B11c — the data/db barrel (adapter registry +
// getDb singleton) relocated to src/db/index.js; newsCrawlerDbCompat moves
// with it. 33 consumers codemodded.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});
git(['add', '--',
  'src/db/index.js',
  'src/db/newsCrawlerDbCompat.js',
  'src/core/crawler/AdaptiveExplorer.js',
  'src/core/crawler/BudgetAllocator.js',
  'src/core/crawler/CrawlPlaybookService.js',
  'src/core/crawler/CrawlStrategyTemplates.js',
  'src/core/crawler/dbClient.js',
  'src/core/crawler/gazetteer/GazetteerPriorityScheduler.js',
  'src/core/crawler/gazetteer/ingestors/WikidataCountryIngestor.js',
  'src/core/crawler/HierarchicalPlanner.js',
  'src/core/crawler/MultiGoalOptimizer.js',
  'src/core/crawler/operations/sequenceContext.js',
  'src/core/crawler/planner/CountryHubPlanner.js',
  'src/core/crawler/PredictiveHubDiscovery.js',
  'src/core/crawler/TemporalPatternLearner.js',
  'src/core/crawler/__tests__/deepUrlAnalysis.test.js',
  'src/core/crawler/__tests__/placeHubs.data.test.js',
  'src/data/db/checks/access-patterns.check.js',
  'src/data/db/checks/crawler-components-batch9.check.js',
  'src/services/CityHubGapAnalyzer.js',
  'src/services/PatternLearner.js',
  'src/services/PlaceHubPatternLearningService.js',
  'src/services/RegionHubGapAnalyzer.js',
  'src/services/shared/PredictionStrategyManager.js',
  'src/services/TopicHubGapAnalyzer.js',
  'src/services/UrlClassificationService.js',
  'src/services/UrlPatternLearningService.js',
  'src/tools/analyse-pages-core.js',
  'src/tools/analysis-run.js',
  'src/tools/analyze-domains.js',
  'src/tools/__tests__/analysis-run.logging.test.js',
  'src/tools/__tests__/analysis-run.run.test.js',
  'src/__tests__/db.adapters.test.js',
  'src/__tests__/db.latest_fetch.test.js',
  'src/__tests__/db.stream.test.js',
  'tools/dev-bridge/checks/codemod-getdb-barrel-repoint.js',
  'tools/dev-bridge/checks/commit-b11c-getdb-barrel.js'
]);
git(['commit', '-m',
  'B11c: data/db barrel relocated to src/db/index.js — 33 consumers\n\n' +
  'The barrel is an adapter registry (sqlite/legacy-sqlite/postgres/\n' +
  'news-crawler-db aliases) + the getDb process singleton with env-var\n' +
  'engine selection and default-path discovery — coordination wiring,\n' +
  'not DB logic. It becomes src/db/index.js (src/db had no index, so\n' +
  'directory-requires resolve it and the codemod transform stays the\n' +
  'uniform data/db -> db at identical relative depths).\n' +
  'newsCrawlerDbCompat (the default sqlite adapter over ensureNewsDb)\n' +
  'moves alongside; legacy-sqlite/postgres factories lazily reach back\n' +
  'into src/data/db. The never-called resolveNewsCrawlerDbFactory\n' +
  'speculative-probe died in transit.\n\n' +
  'checks/codemod-getdb-barrel-repoint.js rewrote exactly the 33\n' +
  'census files (bare directory-requires only — data/db/sqlite etc.\n' +
  'untouched).\n\n' +
  'Verified: barrel load-proof (7 fns + facade class + registry lists\n' +
  '5 adapters); dbClient/CityHubGapAnalyzer/compat load; sweep clean;\n' +
  'jest 6 passed (db.adapters, db.latest_fetch, db.stream,\n' +
  'analysis-run.logging + 2 more) — 3 fails all stash-baselined\n' +
  'pre-existing (placeHubs.data known; deepUrlAnalysis +\n' +
  'analysis-run.run fail identically at HEAD).\n' +
  'src/data/db: 66 js files remain.']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n').slice(0, 8).join('\n'));
