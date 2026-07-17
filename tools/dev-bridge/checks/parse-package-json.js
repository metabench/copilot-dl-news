'use strict';
// Host-truth sanity: JSON.parse package.json + report byte length and tail.
// (The sandbox mount once served a NUL-padded tail — verify before trusting.)
const fs = require('fs');
const path = require('path');
const p = path.resolve(__dirname, '..', '..', '..', 'package.json');
const buf = fs.readFileSync(p);
console.log('bytes:', buf.length, 'lastByte:', buf[buf.length - 1]);
try {
  const d = JSON.parse(buf.toString('utf8'));
  console.log('PARSE OK; scripts:', Object.keys(d.scripts || {}).length, 'entries');
  const hits = Object.entries(d.scripts || {}).filter(([, v]) => /api\/server/.test(v));
  console.log('scripts referencing api/server:', hits.length ? JSON.stringify(hits) : 'none');
} catch (e) {
  console.log('PARSE FAIL:', e.message);
  process.exit(1);
}
