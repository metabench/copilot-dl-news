'use strict';
// Commit + push place-hub slice 2: prefilter + learned-template predictions + auto-ledger.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});

git(['add', '--',
  'src/core/orchestration/DomainProcessor.js',
  'src/services/CountryHubGapAnalyzer.js',
  'src/services/placeHubs/PlaceHubUrlIndex.js',
  'src/services/placeHubs/__tests__/PlaceHubUrlIndex.test.js',
  'docs/plans/2026-07-16-place-hub-intelligence.md',
  'docs/sessions/2026-07-14-recursive-crawl-loop/LOOP_STATE.md',
  'tools/dev-bridge/checks/probe-hubvalidations.js',
  'tools/dev-bridge/checks/commit-slice2.js'
]);
git(['commit', '-m',
  'Place-hub slice 2: prefilter gate, learned-template predictions, auto-ledger\n\n' +
  'Closes the unattended loop: learn -> predict -> prefilter -> verify ->\n' +
  'ledger -> AI review.\n\n' +
  '- PlaceHubUrlIndex.prefilterCandidate: hard vetoes (non-geo slug,\n' +
  '  article-shaped, unparseable) always drop; on hosts with trustworthy\n' +
  '  learned patterns (host-scope accuracy >= 0.8) candidates matching no\n' +
  '  host pattern are dropped BEFORE any network cost (the 2026-07-14\n' +
  '  guess run burned 512 fetched-404s on exactly such shapes). Cold-start\n' +
  '  hosts allow everything not hard-vetoed. Wired into DomainProcessor\'s\n' +
  '  PLACE candidate path only (topic hubs are legitimately non-geo);\n' +
  '  kill-switch: options.urlPrefilter=false or GUESS_URL_PREFILTER=0.\n' +
  '  Gazetteer lookup deliberately not loaded for the gate.\n' +
  '- CountryHubGapAnalyzer Strategy 0.5: predictions generated FROM the\n' +
  '  DB-learned templates (patternType carries learned:/where/{slug}), so\n' +
  '  classification patterns double as prediction generators. First live\n' +
  '  run proved the need: prefilter skipped 24/24 generic-shape candidates\n' +
  '  and zero /where/ URLs had been proposed.\n' +
  '- Crawl-time verification now writes hub_validations automatically\n' +
  '  (crawl-content / crawl-fetch-404, 2y TTL) -- same ledger the AI\n' +
  '  review API operates on. Both verdicts, regardless of --apply.\n\n' +
  'Live (aljazeera.com, limit 8, dry-run): 36 /where/ candidates proposed,\n' +
  '28 HEAD, 5 GET -> 4 NEW hubs content-verified (new-caledonia,\n' +
  'western-sahara, kosovo x2) + 1 404 ledgered invalid. Jest 12/12 on the\n' +
  'target machine (4 new prefilter-policy cases).']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log(git(['push']).trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n')[0]);
