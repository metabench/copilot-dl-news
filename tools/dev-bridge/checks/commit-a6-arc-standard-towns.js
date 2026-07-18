'use strict';
// Commit + push copilot: A6 arc — standard-mode town guessing end-to-end.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});
// NOTE: data/dspls/ is gitignored runtime data (like news.db) — the
// guardian townHubPatterns write is a live-data operation, not repo
// content; it is documented in the commit message + LOOP_STATE.
git(['add', '--',
  'src/services/CityHubGapAnalyzer.js',
  'src/core/orchestration/DomainProcessor.js',
  'src/core/orchestration/utils/analysisUtils.js',
  'tools/dev-bridge/checks/commit-a6-arc-standard-towns.js',
  'docs/sessions/2026-07-14-recursive-crawl-loop/LOOP_STATE.md'
]);
git(['commit', '-m',
  'A6 arc: standard-mode town guessing — 9 hubs + 9 verified mappings\n\n' +
  'DSPL pattern libraries are FILE-BASED (data/dspls/<domain>.json, keys\n' +
  '${kind}HubPatterns) — distinct from the DB place_hub_url_patterns\n' +
  'store. summarizeDsplPatterns looked up the bare kind, which matches\n' +
  'NO real key — readiness pattern-availability has been broken for\n' +
  'every kind; now kind || `${kind}HubPatterns`.\n\n' +
  'Third kind switch found and extended: the prediction dispatch.\n' +
  'CityHubGapAnalyzer.predictSettlementHubUrls reads ${kind}HubPatterns\n' +
  'ONLY — deliberately no fallback-pattern spray (settlement counts are\n' +
  'large; unverified spray would be noisy). Metadata exposes {slug},\n' +
  '{townSlug}/{villageSlug} and {citySlug} placeholder aliases.\n\n' +
  'guardian townHubPatterns = /uk/{slug} (confidence 1, verified,\n' +
  'examples 5) written to the DSPL file — evidence: the 5 town hubs\n' +
  'live-verified by active-probe in a2a0abd9.\n\n' +
  'LIVE (app stopped, restarted httpOk): standard --kind town\n' +
  '--limit 18 -> 18 predictions, 8 live fetches + 8 cached + 2 skipped\n' +
  '-> 4 NEW hubs (york, barnsley, luton via the cached-content path;\n' +
  'norwich fetched) + 7 honest stored-404s. place_page_mappings now\n' +
  'carries 9 verified town-hub rows with correct page_kind (the\n' +
  'PLACE_KIND_TO_PAGE_KIND fix proving out). /place-hubs-table\n' +
  '?kind=town serves 9 towns.\n\n' +
  'Verified: settlement-prediction unit proof (formats /uk/northampton;\n' +
  'empty without patterns); node --check clean; dataExplorerServer ui\n' +
  'suite 30/30 in the same app-stopped window (deferred B11b check).']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n').slice(0, 8).join('\n'));
