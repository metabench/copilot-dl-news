'use strict';
// DB-consolidation slices 0+1+2: deleted re-export shims (cloudCrawl,
// downloadEvidence, ui/errors, ui/uiThemes, ui/crawlTypes, analysisRuns);
// consumers require news-crawler-db directly. This smoke asserts ncdb's
// runtime surface carries every name those repointed consumers use. (The
// original slice-0 version proved reference identity shim fn === ncdb fn
// while the shims still existed — with the shims gone, surface presence +
// repointed-consumer checks are the guard.)
// Consumers covered: unifiedApp/server.js, unifiedApp/checks/
// download-verification.check.js, tools/dev/{verified-crawl,db-downloads,
// downloads-bar-chart-server}.js, tools/crawl/cloud-crawl-e2e.js,
// tools/crawl/lib/{sample-db-signals,monitored-small-crawl,
// crawl-progress-monitor,crawl-packet,crawl-backend}.js
const assert = require('assert');
const ncdb = require('news-crawler-db');

const FNS = [
  // unifiedApp/server.js (slice 0)
  'listContentAnalysisSectionCounts',
  'getCloudCrawlStatusSnapshot',
  'normalizeCloudCrawlDomains',
  'getDownloadStats',
  'getDownloadEvidence',
  'verifyDownloadClaim',
  'getDownloadTimeline',
  'getGlobalDownloadStats',
  'getRecentDownloadVerifications',
  'listRecentDownloads',
  // slice-1 consumers
  'createDownloadVerificationCheckFixture',
  'getCloudCrawlDatabaseSnapshot',
  'getCloudCrawlRecentEvidence',
  'getUrlDownloadEvidenceBundle',
  'getTodayDownloadStats',
  'getDownloadGlobalSummary',
  'listDownloadHosts',
  'listDownloadTimelineByMinute',
  'getDownloadBarChartSourceLabel',
  'getDailyDownloadBars',
  // slice-2 consumers (errors, uiThemes, analysisRuns, crawlTypes shims)
  'listRecentErrors',
  'dailyHostHistogram',
  'ensureUiThemesTable',
  'ensureSystemThemes',
  'listThemes',
  'getThemeRow',
  'getDefaultThemeRow',
  'createTheme',
  'updateTheme',
  'setDefaultTheme',
  'deleteTheme',
  'ensureAnalysisRunSchema',
  'createAnalysisRun',
  'updateAnalysisRun',
  'addAnalysisRunEvent',
  'getAnalysisRunById',
  'getAnalysisRunEvents',
  'getLatestAnalysisRunVersion',
  'listCrawlTypes',
  // slice-3 consumers (dataExplorer, homeCardData, metricsService,
  // analyticsHub, qualityDashboard, queues perf test) + A1 placeHubsTable
  'getArticleCount',
  'getFetchCountDirect',
  'getFetchCountViaJoin',
  'selectDomainCountsByHosts',
  'selectDomainPage',
  'countDomains',
  'normalizeDomainListingSortColumn',
  'normalizeDomainListingSortDirection',
  'listRecentCrawls',
  'selectUrlById',
  'selectFetchHistory',
  'selectFetchById',
  'selectHostSummary',
  'selectHostDownloads',
  'listConfiguration',
  'listClassificationsWithCounts',
  'getClassificationByName',
  'getDocumentsForClassification',
  'countDocumentsForClassification',
  'getRandomDocumentsForClassification',
  'listPlaceHubs',
  'countPlaceHubs',
  'getPlaceHubsByKind',
  'getPlaceHubsByHost',
  'getPlaceHubHosts',
  'selectRecentDomains',
  'getStorageTotals',
  'resolveUiCachedMetricsDbHandle',
  'ensureUiCachedMetricsTable',
  'selectMetricRow',
  'upsertCachedMetricRow',
  'createAnalyticsQueries',
  'createQualityMetricsQueries',
  'createPatternSharingQueries',
  'listQueues',
  'getQueueDetail',
  // slice-4 consumers (placeHubGuessing ×3, topicHubGuessing, topicLists,
  // guess-place-hubs, orchestration deps, crawlObserver ×2)
  'buildMatrixModel',
  'getCellModel',
  'upsertCellVerification',
  'computeAgeLabel',
  'getMappingOutcome',
  'normalizePlaceKind',
  'normalizePageKind',
  'normalizeHost',
  'clampInt',
  'parseEvidenceJson',
  'normalizeOutcome',
  'selectHosts',
  'selectPlaces',
  'selectCountriesByContinent',
  'listContinents',
  'extractPathPattern',
  'getHubArticleMetrics',
  'getRecentHubArticles',
  'getPlaceNameVariants',
  'generateUrlPatterns',
  'getHostUrlPatterns',
  'getHostAnalysisFreshness',
  'getPlaceById',
  'getPlaceHubGuessingMappingByPlaceHost',
  'getPlaceHubGuessingFirstVerifiedMappingWithUrl',
  'getUncheckedHostsForPlace',
  'getMappingsForPlace',
  'getHostPageCounts',
  'getHostsAboveThreshold',
  'getHostsBelowThreshold',
  'getHostPageCount',
  'getHostPageCountMap',
  'getSitePatterns',
  'generateCandidateHubUrls',
  'buildTopicHubMatrixModel',
  'selectTopicHubCellRows',
  'normalizeTopicHubLang',
  'selectTopicHubHosts',
  'selectTopicSlugRows',
  'selectTopicLanguages',
  'upsertTopicSlugRow',
  'deleteTopicSlugRow',
  'normalizeNonGeoTopicSlugLang',
  'normalizeNonGeoTopicSlugSearchQuery',
  'createGuessPlaceHubsQueries',
  'createCrawlObserverUiQueries',
  // A-quirks maintenance
  'fixPlaceHubKinds',
  'backfillHubValidationsFromMappings',
  // slice-5 adapter-cluster consumers (19 pure adapter shims retired)
  'createAdminAdapter',
  'ensureAdminSchema',
  'createAlertAdapter',
  'createApiKeyAdapter',
  'createArticlesAdapter',
  'createBillingAdapter',
  'getCurrentPeriod',
  'createCoverageAdapter',
  'recordHealingEvent',
  'getHealingStats',
  'createIntegrationAdapter',
  'createIntegrationAdapterFromSqliteHandle',
  'createLayoutAdapter',
  'createPushAdapter',
  'createRecommendationAdapter',
  'createSimilarityAdapter',
  'createSummaryAdapter',
  'createTagAdapter',
  'createTopicAdapter',
  // slice-6: gazetteer cluster (names lifted from the retired v1 shims —
  // any failure here means the shim was silently exporting undefined)
  'getAllCountries', 'getTopCountries', 'getTopRegions', 'getTopCities',
  'getCountryByName', 'getCountryByCode', 'getPlaceCountByKind',
  'getPlacesByCountryAndKind', 'getPlaceHierarchy',
  'getPlaceNameVariantsForHubDiscovery', 'getPlaceNamesByLanguages',
  'getAllCountriesWithNameVariants', 'getTopCitiesPerCountry',
  'createIngestionStatements', 'createAttributeStatements',
  'createDeduplicationStatements', 'createOsmBoundaryStatements',
  'createPopulateGazetteerQueries', 'exportGazetteerTables',
  'findNameDuplicates', 'findExternalIDDupes', 'findOSMDuplicates',
  'findWikidataDuplicates', 'mergeDuplicatePlaces', 'mergeDuplicateCapitals',
  'searchPlacesByName', 'getAllPlaceNames', 'normalizeName',
  'getTotalPlaceCount', 'getPlaceCountsByKind',
  // slice-6b: renamed-adapter trio sources (shim-verified via git show)
  'createSqliteArticleSearchAdapter', 'sanitizeSqliteArticleSearchQuery',
  // B7 old-layer sweep: Classic-gazetteer sources (shim-verified from the
  // old-layer bodies; ncdb also exports SHORT ingest names from the modern
  // surface — consumers stay bound to Classic*)
  'getAllClassicGazetteerPlaceNames',
  'normalizeClassicGazetteerName',
  'createClassicGazetteerIngestionStatements',
  'upsertClassicGazetteerPlace',
  'insertClassicGazetteerPlaceName',
  'insertClassicGazetteerExternalId',
  'setClassicGazetteerCanonicalName',
  'registerPlaceSource',
  'listWikidataCountryIngestionRows',
  'getAdm1CodeForWikidataRegion',
  'getRegionPlaceIdByAdm1Code',
  'insertAdminParentHierarchy',
  'getTopicTermsForLanguage',
  'getAllTopicTerms',
  // B8 queries/* sweep (2026-07-18): names lifted from the 25 retired
  // v1/queries shims + v1/rateLimitAdapter (shim-verified from the shim
  // bodies at HEAD). Renamed ncdb sources consumers now alias locally:
  // normalizePlaceHubCandidateHost (was normalizeHost),
  // ensureDomainCrawlBehaviorsTable (was ensureTable),
  // getCompressionUsageStats (was getCompressionStats),
  // schemaInspectionTableExists (was tableExists),
  // DEFAULT_QUERY_TIME_BUDGET_THRESHOLD_MS (was DEFAULT_THRESHOLD_MS).
  'createShowAnalysisQueries', 'createBackfillDatesQueries',
  'createLayoutMasksQueries', 'createLayoutSignaturesQueries',
  'createLayoutTemplatesQueries',
  'vacuumDatabase', 'getDatabaseSize', 'dropLegacyTables',
  'createMultiModalCrawlQueries', 'createPatternLearningQueries',
  'createCrawlPlaceHubsQueries',
  'getCountryHubCoverage', 'getPlacePlaceHubCoverage',
  'markPlacePageMappingVerified', 'upsertPlacePageMapping',
  'upsertAbsentPlacePageMapping', 'getVerifiedHubsForArchive',
  'updateHubDepthCheck', 'getArchiveCrawlStats', 'getHubsNeedingArchive',
  'getSkipTermsForLanguage', 'createMultiLanguagePlaceQueries',
  'getCountryHubCandidates', 'normalizePlaceHubCandidateHost',
  'ensureDomainCrawlBehaviorsTable', 'getDomainBehavior',
  'checkPuppeteerNeeded', 'recordPuppeteerNeeded', 'recordPuppeteerSuccess',
  'recordHttpSuccess', 'recordHeadNotSupported', 'getPuppeteerDomains',
  'getDomainBehaviorStats', 'clearPuppeteerRequirement',
  'findTablesWithCompression', 'getTableRecordCount',
  'getCompressionUsageStats',
  'getTableInfo', 'getTableIndexes', 'getIndexInfo', 'getTableIndexNames',
  'getAllTablesAndViews', 'schemaInspectionTableExists', 'getAllIndexes',
  'getForeignKeys', 'getAllTables', 'getTableRowCount',
  'timedQuery', 'instrumentStatement', 'createTimedDb',
  'createRateLimitAdapter',
  'ensureBackgroundTaskSchema', 'createBackgroundTask',
  'updateBackgroundTask', 'getBackgroundTaskById', 'normalizeBackgroundTaskRow',
  // B9: urlListingNormalized facade absorbed into ncdb (cb4038e) — the 15
  // historical db-first names, consumed by dataExplorer/facts/metrics/
  // render-url-table + contract test + scripts/wip labs.
  'selectInitialUrls', 'selectUrlPage', 'selectUrlPageByHost', 'countUrls',
  'countUrlsByHost', 'selectFetchedUrlPage', 'selectFetchedUrlPageByHost',
  'countFetchedUrls', 'countFetchedUrlsByHost', 'selectUrlPageFiltered',
  'countUrlsFiltered', 'selectFetchedUrlPageFiltered',
  'countFetchedUrlsFiltered', 'normalizeHostMode', 'parseHosts',
  // B10a: v1/SQLiteNewsDatabase shim retired — consumers resolve
  // NewsDatabase || SQLiteNewsDatabase from ncdb directly (both classes).
  'NewsDatabase', 'SQLiteNewsDatabase',
  // B10b: sqlite/schema.js outer shim retired; v1/schema stays ONLY as
  // connection.js's jest-spy seam. Other consumers alias the SqliteV1
  // sources back to the historical short names.
  'initializeSqliteV1Schema', 'initSqliteV1GazetteerTables',
  // B10c: v1 connection core absorbed into ncdb (10a9d56); the spy seam
  // and its schema/metadata/seeder deps died with it. src/db/ensureNewsDb
  // is the copilot wrapper; openDatabase consumers alias the ncdb name.
  'openSqliteNewsDatabase', 'ensureSqliteNewsDatabase', 'dedupePlaceSources',
  // B11: queryTelemetry facade + queries/analysisQueries retired — both
  // were pure delegations; _getWriterForDb newly surfaced on the index
  // (ncdb 8b4203f) fixing the two-suite drift.
  'recordQuery', 'getQueryStats', 'getRecentQueries', '_getWriterForDb',
  'countArticlesNeedingAnalysis', 'getAnalysisStatusCounts',
  'getArticlesNeedingAnalysis',
  // A6 slice 3: kind-generic settlement selection for hub guessing
  'getTopSettlementsByKind'
];
for (const fn of FNS) {
  assert.strictEqual(typeof ncdb[fn], 'function', `ncdb.${fn} missing/not a function`);
}
console.log(`functions: ok (${FNS.length})`);

const CONSTS = ['DEFAULT_CLOUD_CRAWL_TARGETS', 'DOWNLOAD_BAR_CHART_VALID_SOURCES',
  'DOWNLOAD_BAR_CHART_VALID_MODES', 'DOWNLOAD_BAR_CHART_SOURCE_LABELS',
  'SQLITE_ARTICLE_SEARCH_BM25_WEIGHTS',
  'ROLES', 'ROLE_HIERARCHY', 'ACTIVITY_ACTIONS', 'ANNOTATION_TYPES',
  'PLANS', 'METRICS',
  // B8: queryTimeBudget const (consumer aliases it back to
  // DEFAULT_THRESHOLD_MS)
  'DEFAULT_QUERY_TIME_BUDGET_THRESHOLD_MS'];
for (const c of CONSTS) {
  assert.ok(ncdb[c] !== undefined && ncdb[c] !== null, `ncdb.${c} missing`);
}
console.log(`constants: ok (${CONSTS.length})`);
console.log('SMOKE PASS: ncdb surface covers all repointed consumers (slices 0-5 + maintenance)');
