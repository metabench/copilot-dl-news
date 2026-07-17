'use strict';
// Defensive commit+push for the bot-protection slice. ncdb was already
// committed by the user; only push it if it's ahead. Commit the curated
// copilot feature set (excludes bundle.js / .claude settings / fixtures).
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const gitIn = (repo) => (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, repo), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});

// --- news-crawler-db: commit only if something is staged/dirty, then push if ahead ---
const ncdb = gitIn('news-crawler-db');
try {
  const dirty = ncdb(['status', '--porcelain']).trim();
  if (dirty) {
    ncdb(['add', '--',
      'src/db/sqlite/access/domainFetchPolicies.ts',
      'src/db/sqlite/access/placeHubValidations.ts',
      'src/db/index.ts',
      'src/db/__tests__/unit/sqlite/placeHubIntelligence.test.ts'
    ]);
    const staged = ncdb(['diff', '--cached', '--name-only']).trim();
    if (staged) {
      ncdb(['commit', '-m',
        'Bot protections as DB data + site-as-hub place search\n\n' +
        'domain_fetch_policies (per-host protection_kind, fetch_strategy, ' +
        'evidence, provenance, recheck_after) + findHubsForPlace includeSites ' +
        '(national outlets via domain_locales+news_websites). 16/16 vitest.']);
      console.log('ncdb committed:', ncdb(['rev-parse', '--short', 'HEAD']).trim());
    } else { console.log('ncdb: nothing to stage'); }
  } else { console.log('ncdb: clean working tree (already committed)'); }
  const ahead = ncdb(['rev-list', '--count', 'origin/main..HEAD']).trim();
  if (ahead !== '0') console.log('ncdb push:', ncdb(['push']).trim() || 'pushed', `(was ahead ${ahead})`);
  else console.log('ncdb in sync with origin');
} catch (e) { console.log('ncdb step:', (e.stdout || e.message || '').split('\n').slice(-3).join(' ')); }

// --- copilot-dl-news: curated feature files only ---
const cop = gitIn('copilot-dl-news');
cop(['add', '--',
  'src/core/orchestration/DomainProcessor.js',
  'src/tools/guess-place-hubs.js',
  'src/services/placeHubs/policyAwareFetch.js',
  'src/services/placeHubs/__tests__/policyAwareFetch.test.js',
  'src/server/place-hub-review/registerPlaceHubReviewRoutes.js',
  'src/server/place-hub-review/__tests__/placeHubReviewApi.test.js',
  'docs/agents/PLACE_HUB_REVIEW_API.md',
  'docs/plans/2026-07-16-place-hub-intelligence.md',
  'docs/sessions/2026-07-14-recursive-crawl-loop/LOOP_STATE.md',
  'tools/dev-bridge/checks/seed-fetch-policies.js',
  'tools/dev-bridge/checks/probe-guardian-verdict.js',
  'tools/dev-bridge/checks/commit-fetch-policies-run.js'
]);
cop(['commit', '-m',
  'Bot protections modelled in the DB: policy-aware guess fetch + review API\n\n' +
  'domain_fetch_policies (news.db) is now the single home for what each host\n' +
  'does to bots and the strategy that beats it, replacing a hard-coded TLS\n' +
  'list in FetchPipeline and a wrong-path-ignored puppeteer-domains.json.\n\n' +
  '- DomainProcessor consults the policy per host: puppeteer-strategy hosts\n' +
  '  SKIP the HEAD probe (a direct HEAD is exactly what the protection\n' +
  '  resets) and GET through PuppeteerFetcher; skip short-circuits;\n' +
  '  ECONNRESET/402/403/429 flow back via recordProtectionEvidence. Browser\n' +
  '  destroy()ed in the run finally (a leak hung the first guardian trial).\n' +
  '  Kill-switch GUESS_POLICY_FETCH=0.\n' +
  '- policyAwareFetch wraps the guess deps.fetchFn as a second seam.\n' +
  '- /api/v1/place-hubs/fetch-policies GET/POST (agent+reason, audited)\n' +
  '  exposes the model to AI operators; 5 hosts seeded from live evidence.\n\n' +
  'Live: guess-place-hubs --domain theguardian.com (previously ECONNRESET-\n' +
  'dead on first contact) fetched /world/kosovo at HTTP 200 via the\n' +
  'policy-driven Puppeteer path and ledgered it valid (crawl-content);\n' +
  'western-sahara + reunion verified earlier. An AI operator POSTed\n' +
  'reuters.com -> remote-worker (provenance ai-review). Tests:\n' +
  'policyAwareFetch 7/7, review-api 12/12, ncdb 16/16.\n\n' +
  'Follow-up: wrapper + DomainProcessor both can record evidence for a\n' +
  'direct block (append-only, harmless) -- consolidate to one seam; and\n' +
  'make the MAIN crawler FetchPipeline read this table too.']);
console.log('copilot committed:', cop(['rev-parse', '--short', 'HEAD']).trim());
console.log(cop(['push']).trim() || 'pushed');
console.log(cop(['status', '-sb']).split('\n')[0]);
