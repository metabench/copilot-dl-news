'use strict';
// Commit + push copilot: A6 slice 2 — villages (Q532) live + wikidataGet
// batching fixed. Includes the turn's LOOP_STATE/plan updates.
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
  'tools/dev-bridge/checks/commit-a6-villages-slice2.js',
  'docs/sessions/2026-07-14-recursive-crawl-loop/LOOP_STATE.md',
  'docs/plans/2026-07-17-coordination-point-migration.md'
]);
git(['commit', '-m',
  'A6 slice 2: villages (Q532) live + wikidataGet batching fixed\n\n' +
  'Villages join the kind-parameterized settlement path: ingestor\n' +
  'placeKind vocabulary is now city|town|village via a\n' +
  'SETTLEMENT_KIND_CLASSES map; CLI gains --import-villages /\n' +
  '--villages-per-country / --village-min-population. The towns CLI\n' +
  'block refactored into a shared importSettlementsForCountry helper\n' +
  '(pop floor REQUIRED for both non-city kinds) used by towns+villages.\n\n' +
  'WDQS REALITY: the P31/P279* walk over Q532 (millions of instances)\n' +
  '504s the endpoint even at 90s — villages query DIRECT instances only\n' +
  '(subclassWalk:false); subclass-classed stragglers are a later\n' +
  'enrichment. Towns keep the subclass walk (Q3957 tree is tractable).\n\n' +
  'wikidataGet FIXED: it piped ids into Special:EntityData, a\n' +
  'single-entity endpoint — every batch 404d and names silently fell\n' +
  'back to the lone SPARQL label. Now wbgetentities in <=50-id batches\n' +
  '(the WikidataCitiesIngestor._fetchEntityBatch pattern).\n\n' +
  'LIVE (app stopped, restarted httpOk): towns re-run enriched names\n' +
  'with 0 entity-fetch errors (dedupe idempotent, 0 new); GB+FR\n' +
  'villages -> 20 new (Garston, Ecclesfield, Great Sankey...). DB now\n' +
  'town:18 village:20 with 2,977 combined name rows.\n' +
  'jest 23/23 (towns+villages + limits suites).']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n').slice(0, 8).join('\n'));
