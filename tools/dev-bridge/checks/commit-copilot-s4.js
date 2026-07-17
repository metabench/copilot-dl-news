'use strict';
// Commit + push copilot: DB-consolidation slice 4 + A-quirks (multi-chunk
// turn). Shim deletions staged by retire-slice4-shims.js. Explicit
// pathspecs — owner editing .claude/settings*, wysiwyg bundle.js*,
// docs/INDEX.md, SESSIONS_HUB.md.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});
git(['add', '--',
  'src/ui/server/placeHubGuessing/server.js',
  'src/ui/server/placeHubGuessing/checks/placeHubGuessing.cell.check.js',
  'src/ui/server/placeHubGuessing/checks/host-management.check.js',
  'src/ui/server/topicHubGuessing/server.js',
  'src/ui/server/topicLists/server.js',
  'src/core/orchestration/dependencies.js',
  'src/tools/guess-place-hubs.js',
  'src/ui/server/crawlObserver/server.js',
  'src/ui/server/crawlObserver/checks/crawlObserver.smoke.check.js',
  'tools/dev-bridge/checks/smoke-uapp-db-repoint.js',
  'tools/dev-bridge/checks/retire-slice4-shims.js',
  'tools/dev-bridge/checks/syntax-check-slice4.js',
  'tools/dev-bridge/checks/probe-quirk-rows.js',
  'tools/dev-bridge/checks/retire-synthetic-hub-rows.js',
  'tools/dev-bridge/checks/fix-quebec-kind.js',
  'tools/dev-bridge/checks/commit-ncdb-s4.js',
  'tools/dev-bridge/checks/commit-copilot-s4.js',
  'docs/plans/2026-07-17-coordination-point-migration.md',
  'docs/review/2026-07-17-place-hub-assessment.md',
  'docs/sessions/2026-07-14-recursive-crawl-loop/LOOP_STATE.md'
]);
git(['commit', '-m',
  'Slice 4 shim retirement + place-hub quirk fixes (multi-chunk turn)\n\n' +
  'B — DB-consolidation slice 4: delete 5 top-level sqlite/v1/queries\n' +
  'shims (placeHubGuessingUiQueries, topicHubGuessingUiQueries,\n' +
  'nonGeoTopicSlugsUiQueries, guessPlaceHubsQueries,\n' +
  'crawlObserverUiQueries); repoint 9 consumers (renames preserved as\n' +
  'aliases). The extended surface smoke CAUGHT a latent runtime bug:\n' +
  'ncdb never exported the topic-hub normalizeLang, the shim silently\n' +
  'passed undefined, and three topicHubGuessing routes would throw when\n' +
  'hit — fixed in ncdb 5d118d1 (normalizeTopicHubLang) with a consumer\n' +
  'alias here. Smoke now asserts 122 functions + 4 constants (slices\n' +
  '0-4); node --check 9/9. src/data/db: 172 -> 167 files.\n\n' +
  'A — place-hub quirks: (1) the 33 bare page_kind=hub rows were ONE\n' +
  'synthetic probe batch (contiguous ids, fabricated\n' +
  'www.<host>/world/ireland|united-kingdom URLs across a host list\n' +
  'including httpbin/jsonplaceholder/test.com — all "verified"); they +\n' +
  'the malformed +-compound mapping were rejected THROUGH the review API\n' +
  '(34 posted, 0 failed, audit 126 -> 160). (2) guardian quebec hub\n' +
  'country -> region via ncdb fixPlaceHubKinds (auditable maintenance;\n' +
  'vitest 7/7). (3) Recorded: slug-join kind comparisons are\n' +
  'homonym-unsafe — belize/guatemala/panama match capital cities; most\n' +
  'suspected mislabels were probe artifacts, quebec was the only real\n' +
  'one.\n\n' +
  'Loop process change per owner directive: turns now run 2-3 chunks.']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n').slice(0, 10).join('\n'));
