'use strict';
// node --check the 9 consumers repointed in DB-consolidation slice 4.
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const FILES = [
  'src/ui/server/placeHubGuessing/server.js',
  'src/ui/server/placeHubGuessing/checks/placeHubGuessing.cell.check.js',
  'src/ui/server/placeHubGuessing/checks/host-management.check.js',
  'src/ui/server/topicHubGuessing/server.js',
  'src/ui/server/topicLists/server.js',
  'src/core/orchestration/dependencies.js',
  'src/tools/guess-place-hubs.js',
  'src/ui/server/crawlObserver/server.js',
  'src/ui/server/crawlObserver/checks/crawlObserver.smoke.check.js'
];
let bad = 0;
for (const f of FILES) {
  try { execFileSync(process.execPath, ['--check', path.join(ROOT, f)], { encoding: 'utf8' }); console.log('ok', f); }
  catch (e) { bad++; console.log('FAIL', f, (e.stderr || e.message).split('\n')[0]); }
}
if (bad) process.exit(1);
console.log('ALL 9 SYNTAX OK');
