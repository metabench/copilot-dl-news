'use strict';
// READ-ONLY (A5): exact live DDL + row counts for the place-hub table family,
// straight from sqlite_master — the source of truth the schema reference doc
// must mirror (drizzle schema.ts has at least one known drift).
const path = require('path');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const Database = require(require.resolve('better-sqlite3', {
  paths: [REPO_ROOT, path.join(REPO_ROOT, '..', 'news-crawler-db'), __dirname]
}));
const db = new Database(path.join(REPO_ROOT, 'data', 'news.db'), { readonly: true });

const FAMILY = ['place_hubs', 'place_page_mappings', 'hub_validations',
  'place_hub_candidates', 'place_hub_url_patterns', 'place_hub_unknown_terms',
  'place_hub_audit', 'place_hub_determinations', 'place_hub_guess_runs'];

for (const t of FAMILY) {
  const master = db.prepare(
    "SELECT type, name, sql FROM sqlite_master WHERE tbl_name = ? ORDER BY type DESC, name").all(t);
  if (!master.length) { console.log(`\n===== ${t}: ABSENT`); continue; }
  let count = '?';
  try { count = db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n; } catch {}
  console.log(`\n===== ${t} (${count} rows)`);
  for (const m of master) {
    if (m.sql) console.log(m.sql.replace(/\s+/g, ' ').trim());
    else console.log(`-- ${m.type} ${m.name} (autoindex, no SQL)`);
  }
}
console.log('\n===== places/place_names summary');
console.log('places kinds:', JSON.stringify(db.prepare('SELECT kind, COUNT(*) n FROM places GROUP BY kind').all()));
console.log('place_names count:', db.prepare('SELECT COUNT(*) n FROM place_names').get().n);
db.close();
console.log('PROBE DONE');
