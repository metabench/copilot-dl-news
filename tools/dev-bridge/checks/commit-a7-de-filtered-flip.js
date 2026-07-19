'use strict';
// Commit + push copilot: A7 — DE filtered flip: currentOnly filter on the
// ingest callable + the Q106658 Landkreis seed + runner --seed.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});
git(['add', '--',
  'src/tools/gazetteer/ingestAdminAreas.js',
  'src/tools/gazetteer/__tests__/ingestAdminAreas.test.js',
  'config/admin-class-map.json',
  'tools/dev-bridge/checks/ingest-admin-areas.js',
  'tools/dev-bridge/checks/commit-a7-de-filtered-flip.js',
]);
git(['commit', '-m',
  'A7: DE filtered flip — currentOnly filter + Landkreis seed\n\n' +
  'The DE ADM2 umbrella Q106658 (Landkreis) over-matches on the P279*\n' +
  'walk: 639 in DE with history vs 295 current. Root cause: dissolved/\n' +
  'abolished districts carry a P576 dissolution date. ingestAdminAreas\n' +
  'gains currentOnly (default TRUE): appends FILTER NOT EXISTS { ?adm2\n' +
  'wdt:P576 ?dissolved } — you never want dissolved admin areas in a\n' +
  'current gazetteer. Probed live: 639 -> 295 with the filter (275 via\n' +
  'direct P31). jest 5/5 (asserts the filter is in the SPARQL by default,\n' +
  'absent when currentOnly:false).\n\n' +
  'Q106658 added to config/admin-class-map.json as a VERIFIED DE seed\n' +
  '(walk=1, evidence recorded) — auto-discovery missed this umbrella (it\n' +
  'ranked leaf per-Land classes). checks/ingest-admin-areas.js gains\n' +
  '--seed: loads the config judgment-seeds via seedAdminClassMap before\n' +
  'ingest (idempotent; review-owned fields preserved).\n\n' +
  'LIVE (app stopped->httpOk): --seed created the DE Q106658 verified row\n' +
  '(persisted, confirmed). The INGEST itself is deferred: this turn\'s\n' +
  'probing rate-limited my WDQS UA (502/504 then a definitive 429) — an\n' +
  'upstream throttle, not a code defect; the query returned 295 at turn\n' +
  'start. Re-run checks/ingest-admin-areas.js --country DE --apply (or\n' +
  'POST the in-app ingest task) when WDQS cools — the seed persists and\n' +
  'the filtered callable is verified.',
]);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '--porcelain']).split('\n').filter(l => /^.?[DM]/.test(l)).slice(0, 4).join('\n') || '(no stray tracked changes)');
