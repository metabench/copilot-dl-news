'use strict';
// Commit + push copilot: small-batch — fix the gazetteerExport
// input-validation test's stale message expectation (contract drift).
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});
git(['add', '--',
  'tests/db/sqlite/gazetteerExport.test.js',
  'tools/dev-bridge/checks/commit-smallbatch-gazexport-test.js',
]);
git(['commit', '-m',
  'small-batch: gazetteerExport input-validation test message drift\n\n' +
  "The 'throws for non-database inputs' case asserted /better-sqlite3/ —\n" +
  'the old copilot wrapper message. Since the B11f repoint the source is\n' +
  'ncdb iterateGazetteerTableRows, which throws a null-prepare TypeError\n' +
  'on a null handle. The intent (reject non-db input) is unchanged;\n' +
  'expectation updated to /prepare/.\n' +
  'Suite 3/3 (was 2/3) — clears the ledgered gazetteerExport failure.\n\n' +
  'FINDING (recorded, not fixed): the small-batch "restcountries\n' +
  'redirect" item is NOT a client bug — REST Countries v3.1 is fully\n' +
  'DEPRECATED. node-fetch DOES follow the 301, but the target returns\n' +
  '{success:false, data:null, errors:[{message:"...deprecated...migrate\n' +
  'to v5"}]}. fetchCountries therefore yields a non-array. Countries are\n' +
  'already ingested (249) and the DB cache path still serves, so this is\n' +
  'non-urgent, but online country refresh needs a v5-API migration\n' +
  '(new envelope {success,data}) — a real slice, not a one-liner.',
]);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '--porcelain']).split('\n').filter(l => /^.?[DM]/.test(l)).slice(0, 4).join('\n') || '(no stray tracked changes)');
