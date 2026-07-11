#!/usr/bin/env node
'use strict';
// READ-ONLY: newest rows from error-ish tables. Usage:
//   node tools/crawl/recent-errors.js [--db data/news.db] [--limit 10]
const path = require('path');
const args = process.argv.slice(2);
function argOf(flag, dflt) { const i = args.indexOf(flag); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; }
const dbPath = path.resolve(process.cwd(), argOf('--db', 'data/news.db'));
const limit = Number(argOf('--limit', 10));
const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');
const db = openNewsCrawlerDb(dbPath, { readonly: true });
const out = {};
for (const t of ['errors', 'crawl_problems']) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
    out[t] = { cols, rows: db.prepare(`SELECT * FROM ${t} ORDER BY rowid DESC LIMIT ${limit}`).all() };
  } catch (e) { out[t] = 'ERR ' + e.message; }
}
db.close();
// Truncate SAFELY: shrink row sets until the JSON fits, never cut mid-string.
let text = JSON.stringify(out, null, 1);
while (text.length > 12000) {
  let shrunk = false;
  for (const t of Object.keys(out)) {
    if (out[t] && Array.isArray(out[t].rows) && out[t].rows.length > 1) { out[t].rows.pop(); shrunk = true; }
  }
  if (!shrunk) break;
  text = JSON.stringify(out, null, 1);
}
console.log(text);
