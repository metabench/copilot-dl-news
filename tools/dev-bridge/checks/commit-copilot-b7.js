'use strict';
// Commit + push copilot: B7 old-layer sweep + A6 slice-0 scoping.
// Old-layer deletions staged by retire-oldlayer-shims.js.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});
git(['add', '--',
  'src/core/crawler/gazetteer/ingestors/WikidataCitiesIngestor.js',
  'tools/crawl/intelligent-crawl.js',
  'tools/manual-tests/test-gazetteer-queries.js',
  'tools/corrections/fix-normalized-names.js',
  'tools/dev-bridge/checks/retire-oldlayer-shims.js',
  'tools/dev-bridge/checks/smoke-uapp-db-repoint.js',
  'tools/dev-bridge/checks/commit-copilot-b7.js',
  'docs/plans/2026-07-17-coordination-point-migration.md',
  'docs/review/2026-07-17-place-hub-assessment.md',
  'docs/sessions/2026-07-14-recursive-crawl-loop/LOOP_STATE.md'
]);
git(['commit', '-m',
  'B7: old-layer sqlite/queries sweep + A6 village-ingestion scoping\n\n' +
  'B7 — delete 9 of 10 old-layer sqlite/queries/* shims; 4 consumers\n' +
  'repointed PRESERVING the Classic-prefixed ncdb sources they were\n' +
  'always bound to. Key finding, recorded in code comments: ncdb exports\n' +
  'BOTH Classic* and short-named ingest functions from different\n' +
  'gazetteer surfaces — "simplifying" the aliases to short names would\n' +
  'silently switch implementations. WikidataCitiesIngestor keeps its\n' +
  'historical ingestQueries.* call sites via an explicit alias object.\n' +
  'topicKeywords.js stays: real error-tolerance wrapper logic\n' +
  '(migrate-later with urlListingNormalized + articleViewer).\n' +
  'Verified: surface smoke 188 functions (all Classic sources present);\n' +
  'node --check clean on the 4 repointed consumers.\n' +
  'src/data/db: 132 -> 123 files.\n\n' +
  'A6 slice-0 — village/town ingestion scoped in the assessment doc:\n' +
  'new Wikidata classes Q3957 (town) / Q532 (village) beside Q515,\n' +
  'population floor P1082 >= ~5000 as the volume control, per-country\n' +
  'caps, ncdb kind-map rows, CLI flags; places.kind is free TEXT so no\n' +
  'schema change; UI kind filters are already generic. Slice 1 =\n' +
  'towns-only for 2-3 countries.']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n').slice(0, 10).join('\n'));
