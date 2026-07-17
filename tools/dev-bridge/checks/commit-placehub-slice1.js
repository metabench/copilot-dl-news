'use strict';
// Commit + push place-hub intelligence slice 1 across both repos.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const gitIn = (repo) => (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, repo), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});

// --- news-crawler-db ---
const ncdb = gitIn('news-crawler-db');
ncdb(['add', '--',
  'src/db/sqlite/access/placeHubUrlPatternsStore.ts',
  'src/db/sqlite/access/placeHubValidations.ts',
  'src/db/sqlite/access/legacy-placeHubUtilityTools.ts',
  'src/db/index.ts',
  'src/db/__tests__/unit/sqlite/placeHubIntelligence.test.ts'
]);
ncdb(['commit', '-m',
  'Place-hub intelligence: DB-canonical URL patterns, validation ledger, 2y freshness\n\n' +
  '- place_hub_url_patterns: +scope (host|global) and +provenance columns\n' +
  '  (ensure-style); cross-site GOFAI priors (domain \'*\', 8 shapes) give\n' +
  '  brand-new websites URL-classification cold-start; getPatternsForHost/\n' +
  '  matchUrlForHost read host-learned rows first, then priors;\n' +
  '  resetHostPatterns zeroes a host\'s learned rows on structure drift.\n' +
  '- placeHubValidations.ts (new): first writer for the previously dormant\n' +
  '  hub_validations table (validated_at + expires_at, default TTL 2 years,\n' +
  '  unique hub_url index ensured) + place-keyed hub SEARCH:\n' +
  '  findHubsForPlace / findHubsForPlaceSlug join mappings x hubs x\n' +
  '  validations with optional freshness filtering;\n' +
  '  listHubsNeedingRevalidation surfaces expired verdicts.\n' +
  '- getHubValidationCachedArticle: enforces a 2-year content-age window\n' +
  '  by default (fetchedAt stamped; maxAgeMs:null restores legacy\n' +
  '  unbounded reads; legacy articles-table fallback only when unbounded,\n' +
  '  as that table has no fetch timestamp).\n' +
  '- placeHubIntelligence.test.ts: 11 cases covering priors, cold-start,\n' +
  '  host-over-global ranking, drift reset, validation upsert/expiry, and\n' +
  '  the freshness window. All green (vitest) + tsc clean.']);
console.log('ncdb committed:', ncdb(['rev-parse', '--short', 'HEAD']).trim());
console.log(ncdb(['push']).trim() || 'pushed');

// --- copilot-dl-news ---
const cop = gitIn('copilot-dl-news');
cop(['add', '--',
  'src/services/placeHubs/PlaceHubUrlIndex.js',
  'src/services/placeHubs/__tests__/PlaceHubUrlIndex.test.js',
  'docs/plans/2026-07-16-place-hub-intelligence.md',
  'docs/sessions/2026-07-14-recursive-crawl-loop/LOOP_STATE.md',
  'tools/dev-bridge/checks/ncdb-build-and-test.js',
  'tools/dev-bridge/checks/exercise-placehub-index.js',
  'tools/dev-bridge/checks/probe-placehub-quality.js',
  'tools/dev-bridge/checks/commit-placehub-slice1.js'
]);
cop(['commit', '-m',
  'PlaceHubUrlIndex: GOFAI URL classification, pattern learning, drift detection\n\n' +
  'Slice 1 of the place-hub intelligence plan\n' +
  '(docs/plans/2026-07-16-place-hub-intelligence.md; review found four\n' +
  'disconnected pattern mechanisms, a dormant hub_validations table, and\n' +
  'place hubs indexed for only two hosts).\n\n' +
  '- classifyUrl: DB patterns (host-learned > global priors) + gazetteer\n' +
  '  terminal-slug resolution + non-geo veto + article-shape rejection ->\n' +
  '  {candidate, confidence, place, provenance, reasons}. No network.\n' +
  '- learnFromVerifiedHubs: mines place_hubs rows into persisted\n' +
  '  place_hub_url_patterns templates ({slug} class, support-weighted\n' +
  '  accuracy).\n' +
  '- assessStructureHealth: bulk-404 of verified hubs => reset host\n' +
  '  patterns + record structure-changed determination (re-learn loop).\n\n' +
  'Live on news.db: 8 priors seeded; guardian /world/{slug} (172 hubs)\n' +
  'and aljazeera /where/{slug} (164) learned at acc .95; andorra and\n' +
  'gibraltar (top unknown-terms) now classify at 0.99 with places\n' +
  'resolved; lemonde.fr/world/france cold-starts at 0.75 via priors;\n' +
  'no false drift on either host. Jest 8/8 on the target machine.']);
console.log('copilot committed:', cop(['rev-parse', '--short', 'HEAD']).trim());
console.log(cop(['push']).trim() || 'pushed');
