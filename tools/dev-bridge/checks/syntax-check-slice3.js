'use strict';
// node --check the 10 consumers repointed in DB-consolidation slice 3.
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const FILES = [
  'src/ui/server/dataExplorerServer.js',
  'src/ui/server/dataExplorer/views/crawls.js',
  'src/ui/server/dataExplorer/views/config.js',
  'src/ui/server/dataExplorer/views/classifications.js',
  'src/ui/homeCardData.js',
  'src/ui/server/services/metricsService.js',
  'src/ui/server/analyticsHub/PatternSharingService.js',
  'src/ui/server/analyticsHub/AnalyticsService.js',
  'src/ui/server/qualityDashboard/QualityMetricsService.js',
  'src/data/db/sqlite/v1/queries/ui/__tests__/queues.performance.test.js'
];
let bad = 0;
for (const f of FILES) {
  try { execFileSync(process.execPath, ['--check', path.join(ROOT, f)], { encoding: 'utf8' }); console.log('ok', f); }
  catch (e) { bad++; console.log('FAIL', f, (e.stderr || e.message).split('\n')[0]); }
}
if (bad) process.exit(1);
console.log('ALL 10 SYNTAX OK');
