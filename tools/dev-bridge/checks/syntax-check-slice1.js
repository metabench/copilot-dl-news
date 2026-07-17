'use strict';
// node --check the 10 consumers repointed in DB-consolidation slice 1.
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const FILES = [
  'src/ui/server/unifiedApp/checks/download-verification.check.js',
  'tools/dev/verified-crawl.js',
  'tools/dev/db-downloads.js',
  'tools/dev/downloads-bar-chart-server.js',
  'tools/crawl/cloud-crawl-e2e.js',
  'tools/crawl/lib/sample-db-signals.js',
  'tools/crawl/lib/monitored-small-crawl.js',
  'tools/crawl/lib/crawl-progress-monitor.js',
  'tools/crawl/lib/crawl-packet.js',
  'tools/crawl/lib/crawl-backend.js'
];
let bad = 0;
for (const f of FILES) {
  try { execFileSync(process.execPath, ['--check', path.join(ROOT, f)], { encoding: 'utf8' }); console.log('ok', f); }
  catch (e) { bad++; console.log('FAIL', f, (e.stderr || e.message).split('\n')[0]); }
}
if (bad) { console.log(`${bad} file(s) failed`); process.exit(1); }
console.log('ALL 10 SYNTAX OK');
