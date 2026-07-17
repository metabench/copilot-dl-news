'use strict';
// Commit + push news-crawler-db: place-hub schema reference doc (chunk A5).
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'news-crawler-db'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});

git(['add', '--', 'docs/PLACE_HUB_SCHEMA.md', 'src/db/schema.ts']);
git(['commit', '-m',
  'Place-hub schema reference doc from live DDL (+ drift comment in schema.ts)\n\n' +
  'docs/PLACE_HUB_SCHEMA.md documents the place-hub table family from the\n' +
  'live news.db sqlite_master (probed 2026-07-17) — written because both\n' +
  'narrative memory and schema.ts had drifted from the database.\n\n' +
  'Highlights the reference now pins down:\n' +
  '- place_page_mappings carries UNIQUE(place_id, host, page_kind) as a\n' +
  '  TABLE-constraint autoindex that schema.ts does NOT declare (the drift\n' +
  '  that broke the first page_kind reconcile). schema.ts now carries a\n' +
  '  warning comment; deliberately NOT declared as a drizzle uniqueIndex\n' +
  '  (db:push could try to re-create what already exists).\n' +
  '- uq_place_hubs_entity is an expression unique including\n' +
  '  COALESCE(topic_slug, \'\') — the actual mechanism behind the A2\n' +
  '  duplicates (same place with topic_slug=world vs NULL coexists).\n' +
  '- hub_validations: hub_url is globally unique; ledger grew 11 -> 135\n' +
  '  rows via the A4 rejection session (the API writes flowed in).\n' +
  '- unknown_terms has NO resolution column (resolution = row clearing);\n' +
  '  candidates use status + validation_status, patterns use scope +\n' +
  '  provenance — all previously misremembered in loop notes.\n' +
  '- place_hub_guess_runs exists but has never been written (0 rows) —\n' +
  '  wire it or drop it later.\n' +
  '- Quirk ledger: bare hub page_kind x33, null-url_id aljazeera hubs,\n' +
  '  quebec kind=country mislabel, URL-form join nuance in search,\n' +
  '  malformed asia-pacific+world mapping.']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n').slice(0, 5).join('\n'));
