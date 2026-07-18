'use strict';
// Commit + push copilot: A6 slice 1 — towns ingestion live (GB+FR, 18
// towns) + the two pre-existing CLI bugs the run surfaced. ncdb side
// (trigger vocabulary + ensurePlacesKindTriggers) is 02c5f96.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});
git(['add', '--',
  'src/core/crawler/gazetteer/queries/geographyQueries.js',
  'src/core/crawler/gazetteer/ingestors/WikidataCitiesIngestor.js',
  'src/core/crawler/gazetteer/ingestors/__tests__/WikidataCitiesIngestor.towns.test.js',
  'src/tools/populate-gazetteer.js',
  'tools/dev-bridge/checks/apply-places-kind-vocab.js',
  'tools/dev-bridge/checks/commit-a6-towns-slice1.js',
  'docs/sessions/2026-07-14-recursive-crawl-loop/LOOP_STATE.md',
  'docs/plans/2026-07-17-coordination-point-migration.md'
]);
git(['commit', '-m',
  'A6 slice 1: towns ingestion live — kind-parameterized gazetteer path\n\n' +
  'places.kind is NOT free text: trg_places_kind_check_ins/upd triggers\n' +
  'enforce the vocabulary (the towns jest test caught the ABORT on first\n' +
  'insert — the A6 scoping note was memory drift). ncdb 02c5f96 extends\n' +
  'the canonical triggers (+town +village) and adds idempotent\n' +
  'ensurePlacesKindTriggers; the live DB was upgraded app-stopped via\n' +
  'checks/apply-places-kind-vocab.js (dry-run -> --apply, post-verified).\n\n' +
  'buildCitiesDiscoveryQuery gains classQids (TOWN_CLASS_QIDS=Q3957);\n' +
  'WikidataCitiesIngestor gains placeKind/classQids (id wikidata-towns,\n' +
  'kind passthrough to upsert, fallback query parameterized). CLI gains\n' +
  '--import-towns / --towns-per-country / --town-min-population with a\n' +
  'towns block where ?pop is REQUIRED (population floor is the volume\n' +
  'control). jest 6/6 towns + limits suite still green.\n\n' +
  'LIVE (app stopped, restarted httpOk): GB+FR bounded populate -> 18\n' +
  'towns (GB 13: Leicester, Stockport, Nottingham...; FR 5); QID dedupe\n' +
  'left existing city rows untouched.\n\n' +
  'Pre-existing CLI bugs surfaced by the run, fixed in passing:\n' +
  '- restcountries.com now 301s and the client does not follow -> the\n' +
  '  unguarded `for (const c of data)` crashed every online run at HEAD;\n' +
  '  Array.isArray guard skips the redundant upsert (countries come from\n' +
  '  the DB). Redirect-following fix still TODO (small batch).\n' +
  '- fetchSparql facade calls were unawaited and urlless: "cache hit"\n' +
  '  logged every run, then the awaited promise threw URL-is-required.\n' +
  '  Both call sites now await with (url, metadata) keys that mirror.\n' +
  'Still broken, noted for small batch: wikidataGet pipes ids into\n' +
  'Special:EntityData (single-id endpoint) -> 404 on batches; SPARQL\n' +
  'label fallback carried ingestion. Towns are invisible to dsplAnalysis\n' +
  "and other kind IN ('country','region','city') query filters until\n" +
  'those lists are extended (town-hub guessing is the slice-2 path to\n' +
  'the /place-hubs-table filter).']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n').slice(0, 8).join('\n'));
