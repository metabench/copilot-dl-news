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
  'listCrawlTypes'
];
for (const fn of FNS) {
  assert.strictEqual(typeof ncdb[fn], 'function', `ncdb.${fn} missing/not a function`);
}
console.log(`functions: ok (${FNS.length})`);

const CONSTS = ['DEFAULT_CLOUD_CRAWL_TARGETS', 'DOWNLOAD_BAR_CHART_VALID_SOURCES',
  'DOWNLOAD_BAR_CHART_VALID_MODES', 'DOWNLOAD_BAR_CHART_SOURCE_LABELS'];
for (const c of CONSTS) {
  assert.ok(ncdb[c] !== undefined && ncdb[c] !== null, `ncdb.${c} missing`);
}
console.log(`constants: ok (${CONSTS.length})`);
console.log('SMOKE PASS: ncdb surface covers all repointed consumers (slices 0+1+2)');
