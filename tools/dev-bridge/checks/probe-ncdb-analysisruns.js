'use strict';
// Probe news-crawler-db's analysisRuns surface (host-side; the node_modules
// junction is invisible from the sandbox). Prints resolved path, exported
// keys, and the analysisRuns module source for semantic comparison with
// src/deprecated-ui/express/services/analysisRuns.js.
const fs = require('fs');
const path = require('path');

const pkgMain = require.resolve('news-crawler-db');
console.log('RESOLVED:', pkgMain);
const ncdb = require('news-crawler-db');
const keys = Object.keys(ncdb).sort();
console.log('EXPORT COUNT:', keys.length);
console.log('ANALYSIS KEYS:', keys.filter(k => /analysis/i.test(k)).join(', ') || '(none)');

// Locate the analysisRuns source file inside the package.
const pkgRoot = path.dirname(pkgMain);
const hits = [];
(function walk(dir, depth) {
  if (depth > 4) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, depth + 1);
    else if (/analysisRun/i.test(e.name)) hits.push(p);
  }
})(pkgRoot, 0);
console.log('SOURCE FILES:', hits.join(' | ') || '(none)');
for (const h of hits.slice(0, 2)) {
  console.log(`\n===== ${h} =====`);
  console.log(fs.readFileSync(h, 'utf8'));
}
