'use strict';

// Test fixture for htmlSnapshotCache: stands in for a dashboard snapshot
// child. Writes a tiny HTML document to --out (tagged via --tag so tests can
// tell runs apart), or exits 1 when --fail is passed.

const fs = require('fs');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (process.argv.includes('--fail')) {
  console.error('fixture: simulated failure');
  process.exit(1);
}

const outFile = arg('--out');
if (!outFile) {
  console.error('fixture: --out required');
  process.exit(2);
}

const tag = arg('--tag') || 'default';
fs.writeFileSync(outFile, `<html data-fixture-tag="${tag}"><body>fixture</body></html>`, 'utf8');
process.exit(0);
