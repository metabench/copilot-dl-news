#!/usr/bin/env node
'use strict';
// READ-ONLY: print column info for the given tables. Usage:
//   node tools/crawl/db-schema-peek.js [--db data/news.db] table1 table2 ...
const path = require('path');
const args = process.argv.slice(2);
function argOf(flag, dflt) { const i = args.indexOf(flag); return i >= 0 && args[i + 1] ? args.splice(i, 2)[1] : dflt; }
const dbPath = path.resolve(process.cwd(), argOf('--db', 'data/news.db'));
const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');
const db = openNewsCrawlerDb(dbPath, { readonly: true });
const out = {};
for (const t of args.filter((a) => /^[\w]+$/.test(a))) {
  try { out[t] = db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name); }
  catch (e) { out[t] = 'ERR ' + e.message; }
}
db.close();
console.log(JSON.stringify(out, null, 2));
