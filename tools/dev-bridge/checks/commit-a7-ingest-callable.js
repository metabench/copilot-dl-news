'use strict';
// Commit + push copilot: A7 — extract the ADM2 ingest loop into a
// reusable, injectable callable (unblocks the in-app background task).
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});
git(['add', '--',
  'src/tools/gazetteer/ingestAdminAreas.js',
  'src/tools/gazetteer/__tests__/ingestAdminAreas.test.js',
  'tools/dev-bridge/checks/commit-a7-ingest-callable.js',
]);
git(['commit', '-m',
  'A7: extract ingestAdminAreas() — the ADM2 loop as a callable\n\n' +
  "The blocker for an in-app ingest task: populate-gazetteer's ADM2\n" +
  'loop (SPARQL -> wbgetentities -> upsert place + adm2 code + names +\n' +
  'hierarchy) lived inside a 1000-line run() closure, unimportable. This\n' +
  'is that loop as src/tools/gazetteer/ingestAdminAreas.js — a\n' +
  'dependency-injectable async ingestAdminAreas(db, opts): persistence\n' +
  'composes ncdb createPopulateGazetteerQueries + listAdminClasses; the\n' +
  'network (fetchSparql / fetchEntities) is injected so it is\n' +
  'unit-testable with canned Wikidata JSON and has no hidden I/O. Honest\n' +
  '{created, existing, failed, byClass, errors} counters; cooperative\n' +
  'AbortSignal + onProgress for the coming background task.\n\n' +
  'Reads VERIFIED admin_class_map rows only (listAdminClasses default) —\n' +
  'the unattended-safety gate — and never queries WDQS for a country\n' +
  'with no verified class. Jest 4/4 against an in-memory ncdb schema:\n' +
  'ingests FR departments with FR-30/FR-33 codes + hierarchy, idempotent\n' +
  '(QID dedupe), skips DE with only an unverified candidate (proves it\n' +
  'never even fetches), counts failures honestly.',
]);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '--porcelain']).split('\n').filter(l => /^.?[DM]/.test(l)).slice(0, 4).join('\n') || '(no stray tracked changes)');
