'use strict';
// node --check the files touched by the place-hubs-table mount (chunk A1).
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const FILES = [
  'src/ui/server/placeHubsTable/server.js',
  'src/ui/server/unifiedApp/server.js',
  'src/ui/server/unifiedApp/subApps/registry.js'
];
let bad = 0;
for (const f of FILES) {
  try { execFileSync(process.execPath, ['--check', path.join(ROOT, f)], { encoding: 'utf8' }); console.log('ok', f); }
  catch (e) { bad++; console.log('FAIL', f, (e.stderr || e.message).split('\n')[0]); }
}
if (bad) process.exit(1);
console.log('ALL 3 SYNTAX OK');
