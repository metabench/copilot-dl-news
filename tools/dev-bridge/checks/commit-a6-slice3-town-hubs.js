'use strict';
// Commit + push copilot: A6 slice 3 — town/village hub guessing live.
// ncdb side is 07fd28b (getTopSettlementsByKind + scoped kind lists).
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});
git(['add', '--',
  'src/core/orchestration/DomainProcessor.js',
  'src/core/orchestration/utils/analysisUtils.js',
  'src/core/orchestration/ActiveProbeProcessor.js',
  'src/services/CityHubGapAnalyzer.js',
  'tools/crawl/guess-place-hubs.js',
  'tools/dev-bridge/checks/smoke-uapp-db-repoint.js',
  'tools/dev-bridge/checks/commit-a6-slice3-town-hubs.js',
  'docs/sessions/2026-07-14-recursive-crawl-loop/LOOP_STATE.md',
  'docs/plans/2026-07-17-coordination-point-migration.md'
]);
git(['commit', '-m',
  'A6 slice 3: town/village hub guessing live — 5 guardian town hubs\n\n' +
  'Both place-selection paths were kind-gated switches: selectPlaces\n' +
  '(standard mode) and ActiveProbeProcessor (active-probe) gain\n' +
  'town/village cases riding CityHubGapAnalyzer.getTopSettlements ->\n' +
  'ncdb getTopSettlementsByKind (07fd28b, vitest 3/3). The active-probe\n' +
  'gate was found only when the live dry-run generated 0 targets.\n\n' +
  'LATENT MISLABEL FIXED: PLACE_KIND_TO_PAGE_KIND falls back to\n' +
  "'country-hub' for unknown kinds — town-hub/village-hub entries added\n" +
  'before any town hub was written.\n\n' +
  'Standard mode blocks on "No DSPL patterns available" (guardian\n' +
  'patterns are country-scoped /world/{slug}) so the slice ran\n' +
  "active-probe with --pattern '/uk/{slug}'. Git Bash MSYS\n" +
  'path-conversion mangles leading-slash args (-> C:/Program Files/\n' +
  'Git/uk/{slug}); MSYS_NO_PATHCONV=1 required.\n\n' +
  'LIVE (app stopped, restarted httpOk): guardian towns 5/5 verified\n' +
  'HTTP 200 and applied — leicester, stockport, nottingham, bolton,\n' +
  "derby as place_hubs place_kind='town' with real fetched titles;\n" +
  'villages honestly 0/5 (no /uk/<village> pages exist).\n' +
  '/place-hubs-table/api/list?kind=town serves all 5.\n\n' +
  'Verified: smoke 274 fns; selectPlaces unit proof (town/village +\n' +
  'no-analyzer fallback); node --check clean. Remaining for the A6\n' +
  'arc: learn town-scoped DSPL patterns so standard mode + mappings\n' +
  'work; probe a bbc pattern.']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n').slice(0, 8).join('\n'));
