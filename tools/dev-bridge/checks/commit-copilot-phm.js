'use strict';
// Commit + push the copilot side of chunk A2 (drivers + probes + memory).
// Logic itself landed in news-crawler-db 8dfe6ea. Explicit pathspecs —
// owner concurrently editing .claude/settings*, wysiwyg bundle.js*,
// docs/INDEX.md, docs/sessions/SESSIONS_HUB.md.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});

git(['add', '--',
  'tools/dev-bridge/checks/dedupe-place-hubs.js',
  'tools/dev-bridge/checks/probe-hub-dupes.js',
  'tools/dev-bridge/checks/probe-ppm-indexes.js',
  'tools/dev-bridge/checks/commit-ncdb-phm.js',
  'tools/dev-bridge/checks/commit-copilot-phm.js',
  'docs/review/2026-07-17-place-hub-assessment.md',
  'docs/sessions/2026-07-14-recursive-crawl-loop/LOOP_STATE.md'
]);
git(['commit', '-m',
  'Place-hub dedupe + pageKind repair drivers (chunk A2; logic in ncdb 8dfe6ea)\n\n' +
  'Composition-only per the coordination-point rule: the merge/repair\n' +
  'logic lives in news-crawler-db (legacy-placeHubMaintenance.ts, vitest\n' +
  '6/6); these are the probes + the dry-run/apply driver + memory.\n\n' +
  '- checks/dedupe-place-hubs.js: dry-run by default, --apply writes\n' +
  '  (run with the Electron app stopped). Applied live: place_hubs\n' +
  '  428 -> 407 (20 duplicate groups incl. one triple; 9 mappings\n' +
  '  repointed), then page_kind canonicalized (12 renamed, 63 bare rows\n' +
  '  merged into suffixed twins; ambiguous bare \'hub\' untouched).\n' +
  '- checks/probe-hub-dupes.js, checks/probe-ppm-indexes.js: read-only\n' +
  '  scoping probes. The second exists because the FIRST apply failed\n' +
  '  usefully: live place_page_mappings has UNIQUE(place_id, host,\n' +
  '  page_kind) as an sqlite autoindex that drizzle schema.ts does NOT\n' +
  '  declare — recorded as schema drift for the A5 reference doc; the\n' +
  '  reconcile was reworked to merge-not-rename and re-applied\n' +
  '  idempotently (dedupe txn had already committed cleanly).\n\n' +
  'Verified post-apply via /place-hubs-table/api/list: andorra is a\n' +
  'single titled row with the merged observation window; kinds now\n' +
  'country 395 / city 7 / region 3 / subcontinent 2.\n\n' +
  'Assessment doc + LOOP_STATE updated (also: bridge outbox results\n' +
  'persist across sessions — never reuse an inbox request name).']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n').slice(0, 10).join('\n'));
