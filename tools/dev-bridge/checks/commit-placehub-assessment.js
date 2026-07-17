'use strict';
// Commit + push the read-only place-hub assessment (no product code changes).
// Explicit pathspecs — owner concurrently editing .claude/settings*, wysiwyg
// bundle.js*, docs/INDEX.md, docs/sessions/SESSIONS_HUB.md.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});

git(['add', '--',
  'docs/review/2026-07-17-place-hub-assessment.md',
  'tools/dev-bridge/checks/probe-placehub-assessment.js',
  'tools/dev-bridge/checks/commit-placehub-assessment.js',
  'docs/sessions/2026-07-14-recursive-crawl-loop/LOOP_STATE.md'
]);
git(['commit', '-m',
  'Place-hub subsystem assessment (read-only): model/API healthy, table UI stranded\n\n' +
  'docs/review/2026-07-17-place-hub-assessment.md. Highlights:\n' +
  '- Pipeline, review/search API, and data model are in good shape\n' +
  '  (428 hubs, honest 8-item review queue, placeId-keyed search with\n' +
  '  validation TTLs, proper indexing, 0 null slugs).\n' +
  '- TOP GAP: the browsable place-hub table (host+kind filters, text\n' +
  '  search, pagination) exists in dataExplorer /place-hubs but the\n' +
  '  unified shell never mounts dataExplorer — only the guessing matrix.\n' +
  '- No village kind anywhere in the gazetteer (city/region/country/\n' +
  '  planet); filter-by-village needs ingestion work, not UI work.\n' +
  '- Coverage 2 hosts; validations 11/428; dup (host,slug) rows;\n' +
  '  ISO-code junk mappings (…/ad -> Andorra); pageKind vocab drift.\n' +
  '- place_hubs is slug-keyed (no place_id FK); mappings layer is id-keyed.\n\n' +
  'New read-only probe: checks/probe-placehub-assessment.js (resolves\n' +
  'better-sqlite3 via ncdb paths fallback; repo root lacks it).']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n').slice(0, 10).join('\n'));
