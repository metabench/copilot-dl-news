'use strict';
// Commit + push chunk A1: mount the browsable place-hubs table in the
// unified shell (assessment gap #1). Explicit pathspecs — owner concurrently
// editing .claude/settings*, wysiwyg bundle.js*, docs/INDEX.md,
// docs/sessions/SESSIONS_HUB.md.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});

git(['add', '--',
  'src/ui/server/placeHubsTable/server.js',
  'src/ui/server/unifiedApp/server.js',
  'src/ui/server/unifiedApp/subApps/registry.js',
  'tools/dev-bridge/checks/syntax-check-phtable.js',
  'tools/dev-bridge/checks/commit-phtable.js',
  'docs/review/2026-07-17-place-hub-assessment.md',
  'docs/sessions/2026-07-14-recursive-crawl-loop/LOOP_STATE.md'
]);
git(['commit', '-m',
  'Mount browsable place-hubs table in the unified shell (assessment gap #1)\n\n' +
  'docs/review/2026-07-17-place-hub-assessment.md found the requested\n' +
  'place-hub table UI (host+kind filters, search, pagination) existed\n' +
  'only in the standalone dataExplorer server, unreachable from the\n' +
  'unified Electron shell (matrix-only there).\n\n' +
  '- New src/ui/server/placeHubsTable/server.js: composition-only\n' +
  '  sub-app in the shell\'s router-factory pattern. ALL query logic\n' +
  '  comes from news-crawler-db (listPlaceHubs, countPlaceHubs,\n' +
  '  getPlaceHubsByKind, getPlaceHubsByHost, getPlaceHubHosts —\n' +
  '  contract verified against legacy-ui-placeHubs.ts); the copilot\n' +
  '  side is just the router + HTML, per the coordination-point rule\n' +
  '  (no src/data/db imports).\n' +
  '- Mounted at /place-hubs-table; registry tile "Place Hubs" (analytics\n' +
  '  category) iframes it; page links to the guessing matrix and the\n' +
  '  review queue; JSON twin at /place-hubs-table/api/list.\n' +
  '- Kind filter reflects live kinds (country/city/region/subcontinent);\n' +
  '  village filtering stays blocked on gazetteer ingestion (assessment\n' +
  '  gap #2).\n\n' +
  'Verified live via the bridge: node --check 3/3; stop/start-electron\n' +
  '(httpOk); GET /place-hubs-table 200 with table HTML; api/list\n' +
  'search=andorra returns 2 hubs with joined URLs; ui-screenshot shows\n' +
  'the table rendering inside the shell (428 hubs, filters, classify\n' +
  'links). The screenshot surfaced fresh data-quality rows for the\n' +
  'assessment backlog: quebec place_kind=country; a hub with no URL.\n\n' +
  'Deferred: matrix->table backlink (matrix HTML lives in jsgui\n' +
  'controls).']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n').slice(0, 10).join('\n'));
