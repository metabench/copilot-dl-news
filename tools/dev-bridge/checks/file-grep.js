'use strict';
// file-grep.js <relPath> <needle> — print matching lines (host-truth reads).
const path = require('path');
const fs = require('fs');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const [rel, needle] = process.argv.slice(2);
const p = path.resolve(REPO_ROOT, rel || '');
if (!p.startsWith(REPO_ROOT) || !fs.existsSync(p)) { console.log('not found:', rel); process.exit(1); }
const lines = fs.readFileSync(p, 'utf8').split('\n');
let n = 0;
lines.forEach((l, i) => { if (l.includes(needle)) { console.log(`${i + 1}: ${l.trim().slice(0, 160)}`); n++; } });
console.log(`[grep] ${n} match(es) for "${needle}" in ${rel} (${lines.length} lines)`);
