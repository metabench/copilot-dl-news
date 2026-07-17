'use strict';
// node --check the 6 consumers repointed in DB-consolidation slice 2.
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const FILES = [
  'src/ui/homeCardData.js',
  'src/ui/server/services/themeService.js',
  'src/ui/server/services/metricsService.js',
  'src/ui/server/dataExplorerServer.js',
  'src/ui/server/dataExplorer/views/errors.js',
  'src/data/db/sqlite/v1/__tests__/analysisRuns.test.js'
];
let bad = 0;
for (const f of FILES) {
  try { execFileSync(process.execPath, ['--check', path.join(ROOT, f)], { encoding: 'utf8' }); console.log('ok', f); }
  catch (e) { bad++; console.log('FAIL', f, (e.stderr || e.message).split('\n')[0]); }
}
if (bad) { console.log(`${bad} file(s) failed`); process.exit(1); }
console.log('ALL 6 SYNTAX OK');
