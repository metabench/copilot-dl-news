'use strict';
// Commit + push copilot: B8 queries/* sweep — 25 v1/queries shims +
// v1/rateLimitAdapter retired. Deletions staged by git rm; this stages the
// repointed consumers + tooling with explicit pathspecs (owner's dirty
// files excluded: .claude/settings*, wysiwyg bundle.js*, docs/INDEX.md,
// SESSIONS_HUB.md, tests/fixtures/smoke-tests/).
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});
git(['add', '--',
  // codemod-rewritten consumers (21)
  'src/api/routes/places.js',
  'src/core/crawler/multimodal/multiModalQueries.js',
  'src/core/orchestration/DomainProcessor.js',
  'src/data/extraction/TemplateExtractionService.js',
  'src/geo/hub-validation/HubValidationEngine.js',
  'src/intelligence/analysis/place-extraction.js',
  'src/services/CountryHubGapAnalyzer.js',
  'src/services/CountryHubMatcher.js',
  'src/services/HubTaskGenerator.js',
  'src/services/IntelligentCrawlServer.js',
  'src/services/PatternLearner.js',
  'src/services/PlacePlaceHubGapAnalyzer.js',
  'src/tools/analyse-pages-core.js',
  'src/tools/backfill-dates-core.js',
  'src/tools/backfill-dates.js',
  'src/tools/show-analysis.js',
  'src/ui/server/templateTeacher/server.js',
  'tools/analysis/unified-hub-discovery.js',
  'tools/corrections/drop-legacy-tables.js',
  'tools/crawl/crawl-place-hubs.js',
  'tools/db/vacuum-db.js',
  // manual alias / ghost-path repairs
  'tools/gazetteer/reconcile-country-hubs.js',
  'tools/gazetteer/match-country-hubs.js',
  'src/core/crawler/utils/puppeteerDetection.js',
  'tools/compression/find-compression-settings.js',
  'tools/analysis/upgrade-analysis-schema.js',
  'tools/db/db-schema.js',
  'checks/multi-language-places.check.js',
  'tests/db/sqlite/v1/queries/queryTimeBudget.test.js',
  'src/data/db/__tests__/multiModalCrawlQueries.test.js',
  'src/data/db/sqlite/v1/__tests__/backgroundTasks.test.js',
  'src/data/db/sqlite/v1/__tests__/layout-tables.test.js',
  'src/data/db/sqlite/v1/__tests__/placePageMappings.test.js',
  'src/ui/server/rateLimitDashboard/server.js',
  // tooling
  'tools/dev-bridge/checks/codemod-adapter-repoint.js',
  'tools/dev-bridge/checks/smoke-uapp-db-repoint.js',
  'tools/dev-bridge/checks/commit-b8-queries-sweep.js'
]);
git(['commit', '-m',
  'B8: v1/queries shim sweep — 25 shims + rateLimitAdapter retired\n\n' +
  'Fleet audit of all 46 remaining src/data/db sqlite/v1 files (one\n' +
  'agent per file: pureness + importer census) found the queries tree\n' +
  'almost entirely pure shims. Retired 26 files:\n' +
  '- 9 dead (zero importers): analysis.analysePagesCore,\n' +
  '  articleXPathPatterns, helpers.js, telemetry, pages.export, common\n' +
  '  (dead local utils), compression/schema had only ghost-path\n' +
  '  importers (see below).\n' +
  '- 12 no-rename shims codemodded (checks/codemod-adapter-repoint.js\n' +
  '  B8 list, 21 consumer files rewritten in one pass).\n' +
  '- 5 renamed shims via consumer-side aliases (historical names kept\n' +
  '  per convention): normalizeHost<-normalizePlaceHubCandidateHost x3,\n' +
  '  ensureTable<-ensureDomainCrawlBehaviorsTable (puppeteerDetection\n' +
  '  alias object), getCompressionStats<-getCompressionUsageStats,\n' +
  '  tableExists<-schemaInspectionTableExists,\n' +
  '  DEFAULT_THRESHOLD_MS<-DEFAULT_QUERY_TIME_BUDGET_THRESHOLD_MS.\n' +
  '- v1/rateLimitAdapter.js (1 consumer, identical name).\n\n' +
  'BONUS: 6 tools were broken at HEAD by ghost ../src/ requires\n' +
  '(resolve to nonexistent tools/src/): find-compression-settings,\n' +
  'upgrade-analysis-schema (line 13), db-schema (CliFormatter too),\n' +
  'vacuum-db, unified-hub-discovery, multi-language-places.check\n' +
  '(src/db form) — all repaired by the repoint.\n\n' +
  'Verified: surface smoke 244 fns + 12 consts (all renamed ncdb\n' +
  'sources present); node --check clean on 36 edited files; jest 17\n' +
  'passed across the 5 repointed suites (multiModalCrawlQueries\n' +
  'conditional-skips pre-existing). src/data/db: 123 -> 97 js files.\n' +
  'Queries tree residue: ui/articleViewer (MIXED, 1 consumer),\n' +
  'ui/urlListingNormalized (facade, 11 consumers) -> B9.']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n').slice(0, 8).join('\n'));
