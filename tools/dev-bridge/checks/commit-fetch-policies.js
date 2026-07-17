'use strict';
// Commit + push: bot-protection DB model + policy-aware fetch + site-as-hub search.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const gitIn = (repo) => (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, repo), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});

const NCDB_MSG = [
  'Bot protections as DB data + site-as-hub place search',
  '',
  'domainFetchPolicies.ts (new): domain_fetch_policies table -- per-host',
  'protection_kind, fetch_strategy (direct|puppeteer|remote-worker|skip),',
  'evidence JSON (last 50, merged without clobbering strategy), provenance,',
  'recheck_after. Replaces the hard-coded TLS list, the wrong-path JSON',
  'config, and session-note knowledge.',
  'findHubsForPlace/Slug: includeSites joins domain_locales+news_websites',
  'so country queries return national outlets as site-hub rows.',
  'Tests: +5 cases, 16/16 green, tsc clean.'
].join('\n');

const COP_MSG = [
  'Policy-aware guess fetch: bot-protection model drives strategy',
  '',
  'policyAwareFetch.js: fetch wrapper consulting domain_fetch_policies;',
  'puppeteer strategy renders via PuppeteerFetcher (HEAD answered',
  'synthetically -- direct HEAD is what TLS fingerprinting kills; the GET',
  'is the real probe); skip returns synthetic 403; ECONNRESET/402/403/429',
  'outcomes merge back into policy evidence. Wired into guess-place-hubs',
  '(kill-switch GUESS_POLICY_FETCH=0).',
  'Review API: GET/POST /fetch-policies (agent+reason, audited); search',
  'gains sites=0 toggle for site-as-hub rows.',
  'Seeded policies: guardian/bloomberg/wsj tls-fingerprint->puppeteer,',
  'lemonde http-402->puppeteer (trial), reuters bot-block->puppeteer.',
  'LIVE: first-ever guardian guess run -- 3 new hubs verified via',
  'puppeteer GETs (kosovo, reunion, western-sahara), junk shapes',
  'prefiltered, verdicts ledgered (crawl-content n=7).'
].join('\n');

const ncdb = gitIn('news-crawler-db');
ncdb(['add', '--',
  'src/db/sqlite/access/domainFetchPolicies.ts',
  'src/db/sqlite/access/placeHubValidations.ts',
  'src/db/index.ts',
  'src/db/__tests__/unit/sqlite/placeHubIntelligence.test.ts'
]);
ncdb(['commit', '-m', NCDB_MSG]);
console.log('ncdb committed:', ncdb(['rev-parse', '--short', 'HEAD']).trim());
console.log(ncdb(['push']).trim() || 'pushed');

const cop = gitIn('copilot-dl-news');
cop(['add', '--',
  'src/services/placeHubs/policyAwareFetch.js',
  'src/tools/guess-place-hubs.js',
  'src/server/place-hub-review/registerPlaceHubReviewRoutes.js',
  'docs/agents/PLACE_HUB_REVIEW_API.md',
  'docs/sessions/2026-07-14-recursive-crawl-loop/LOOP_STATE.md',
  'tools/dev-bridge/checks/seed-fetch-policies.js',
  'tools/dev-bridge/checks/probe-hubvalidations.js',
  'tools/dev-bridge/checks/commit-fetch-policies.js'
]);
cop(['commit', '-m', COP_MSG]);
console.log('copilot committed:', cop(['rev-parse', '--short', 'HEAD']).trim());
console.log(cop(['push']).trim() || 'pushed');
