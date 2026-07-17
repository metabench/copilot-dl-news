'use strict';
// Commit + push the 2026-07-17 bot-protection consistency pass (copilot-dl-news only).
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});

git(['add', '--',
  'src/core/crawler/FetchPipeline.js',
  'src/core/crawler/CrawlerServiceWiring.js',
  'src/core/crawler/__tests__/FetchPipeline.puppeteerFallbackDomains.test.js',
  'src/tools/guess-place-hubs.js',
  'src/services/placeHubs/policyAwareFetch.js',
  'src/server/place-hub-review/registerPlaceHubReviewRoutes.js',
  'tools/dev-bridge/checks/commit-consistency-pass.js'
]);
git(['commit', '-m',
  'Consistency: live crawler reads domain_fetch_policies; one evidence seam\n\n' +
  'Follow-through on the bot-protection slice — the write-side had moved to\n' +
  'the DB but the read-side had not.\n\n' +
  '- FetchPipeline (LIVE crawler) now honors domain_fetch_policies: the\n' +
  '  wiring loads puppeteer/remote-worker hosts from the DB and injects them\n' +
  '  as puppeteerFallback.policyHosts; _shouldUsePuppeteerFallback treats\n' +
  '  them as authoritative, with the static theguardian/bloomberg/wsj list\n' +
  '  demoted to a bootstrap default. Fixes lemonde.fr/reuters.com, which\n' +
  '  lived only in the DB, so the crawler kept ECONNRESET/402-ing on them.\n' +
  '- Single evidence seam: un-wired policyAwareFetch from guess-place-hubs;\n' +
  '  DomainProcessor is the sole seam (it also skips the HEAD probe for\n' +
  '  puppeteer hosts, which a fetch wrapper cannot). The wrapper +\n' +
  '  DomainProcessor previously both recorded evidence for a direct block\n' +
  '  and each built its own PuppeteerFetcher. policyAwareFetch.js kept as a\n' +
  '  marked-superseded reference (deletable).\n' +
  '- place_hub_unknown_terms.host is stored raw (www-prefixed) while every\n' +
  '  other table is bare-canonical; the review queue now canonicalizes it in\n' +
  '  SQL so www/non-www rows collapse and host joins stop silently missing.\n\n' +
  'Verified: FetchPipeline puppeteer suite 7/7 (+2 policyHosts cases),\n' +
  'review-api 12/12; app boots loading policy hosts from the DB; guardian\n' +
  'guess still fetches 200 via the single seam (0 ECONNRESET); review queue\n' +
  'now shows bare theguardian.com hosts.']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log(git(['push']).trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n')[0]);
