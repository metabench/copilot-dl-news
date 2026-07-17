'use strict';
// Commit + push news-crawler-db: place_hubs maintenance module (chunk A2).
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'news-crawler-db'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});

git(['add', '--',
  'src/db/sqlite/access/legacy-placeHubMaintenance.ts',
  'src/db/__tests__/unit/sqlite/legacyPlaceHubMaintenance.test.ts',
  'src/db/index.ts'
]);
git(['commit', '-m',
  'place_hubs maintenance: duplicate merge + page_kind vocabulary repair\n\n' +
  'Motivated by copilot-dl-news docs/review/2026-07-17-place-hub-assessment.md\n' +
  '(guardian www/non-www url_id duplicate rows; country vs country-hub\n' +
  'page_kind drift in place_page_mappings).\n\n' +
  '- findDuplicatePlaceHubGroups / pickCanonicalPlaceHub / dedupePlaceHubs:\n' +
  '  merge duplicate (host, place_slug, place_kind) rows onto a canonical\n' +
  '  keeper (titled > richest article evidence > latest seen > id), widen\n' +
  '  first/last-seen to the group window, adopt a loser url_id when the\n' +
  '  keeper lacks one (losers deleted first — uq_place_hubs_url_id safe),\n' +
  '  repoint place_page_mappings.hub_id (the only referencing table;\n' +
  '  hub_members belongs to the newer hubs model). dryRun mode reports\n' +
  '  without writing.\n' +
  '- reconcilePlacePageMappingPageKinds: canonicalize bare kinds to -hub\n' +
  '  forms. The live table has UNIQUE(place_id, host, page_kind) as an\n' +
  '  sqlite autoindex NOT declared in drizzle schema.ts (schema drift,\n' +
  '  found when the first apply collided): bare rows with a suffixed twin\n' +
  '  are merged instead of renamed — a verified bare row upgrades its\n' +
  '  non-verified twin (status, verified_at, widened seen-window) before\n' +
  '  deletion. Ambiguous bare value \'hub\' deliberately untouched.\n\n' +
  'vitest 6/6 (:memory:, live-shape DDL incl. both unique constraints).\n' +
  'First live apply (copilot checks/dedupe-place-hubs.js): 20 groups -> 21\n' +
  'rows deleted (one triple), 9 mappings repointed, then 12 renamed + 63\n' +
  'merged-deleted; place_hubs 428 -> 407, 0 dup groups remaining.']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n').slice(0, 6).join('\n'));
