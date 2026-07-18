'use strict';
// B11c codemod: the data/db barrel relocated to src/db/index.js — rewrite
// directory-requires of data/db (and data/db/index) to db. ONLY the bare
// directory form: data/db/sqlite, data/db/checks etc. are untouched.
// Default DRY-RUN; --apply writes files.
const path = require('path');
const fs = require('fs');
const APPLY = process.argv.includes('--apply');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const RX = /(require\((["'])(?:\.\.\/)+)data\/db(?:\/index)?(\2\))/g;

const changed = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js')) {
      const src = fs.readFileSync(p, 'utf8');
      const matches = src.match(RX);
      if (!matches) continue;
      const out = src.replace(RX, (m, pre, q, post) => `${pre.replace(/data\/db$/, '')}db${post}`.replace('data/db', 'db'));
      changed.push({ file: path.relative(ROOT, p), n: matches.length });
      if (APPLY) fs.writeFileSync(p, src.replace(RX, '$1db$3'));
    }
  }
}
for (const d of ['src', 'tests', 'tools', 'scripts', 'checks', 'wip']) {
  const p = path.join(ROOT, d);
  if (fs.existsSync(p)) walk(p);
}
for (const c of changed) console.log(`${APPLY ? 'rewrote' : 'would rewrite'} ${c.file} (${c.n})`);
console.log(`files: ${changed.length}; ${APPLY ? 'APPLIED' : 'dry-run'}`);
