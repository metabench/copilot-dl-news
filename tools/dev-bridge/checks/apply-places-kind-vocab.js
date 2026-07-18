'use strict';
// A6 slice 1: upgrade the live DB's places.kind vocabulary triggers to the
// canonical ncdb definitions (adds 'town'/'village'). The kind map lives in
// trg_places_kind_check_ins/upd — CREATE TRIGGER IF NOT EXISTS never
// replaces installed triggers, so live DBs keep the six-kind map until
// this runs ensurePlacesKindTriggers (ncdb 02c5f96).
// REQUIRES the Electron app stopped (direct write to data/news.db).
// Default DRY-RUN (shows installed vs canonical); --apply upgrades.
const path = require('path');
const APPLY = process.argv.includes('--apply');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const Database = require(path.join(ROOT, '..', 'news-crawler-db', 'node_modules', 'better-sqlite3'));
const { ensurePlacesKindTriggers } = require('news-crawler-db');

const dbPath = path.join(ROOT, 'data', 'news.db');
const db = new Database(dbPath, { readonly: !APPLY, fileMustExist: true });

const installed = db.prepare(
  "SELECT name, sql FROM sqlite_master WHERE type='trigger' AND name LIKE 'trg_places_kind_check%' ORDER BY name"
).all();
for (const t of installed) {
  const hasTown = t.sql.includes("'town'");
  console.log(`${t.name}: ${hasTown ? 'EXTENDED (town/village present)' : 'LEGACY six-kind map'}`);
}

if (!APPLY) {
  console.log('dry-run: pass --apply (app stopped) to upgrade both triggers');
} else {
  const { recreated } = ensurePlacesKindTriggers(db);
  const after = db.prepare(
    "SELECT name, sql FROM sqlite_master WHERE type='trigger' AND name LIKE 'trg_places_kind_check%' ORDER BY name"
  ).all();
  const allExtended = after.length === 2 && after.every(t => t.sql.includes("'town'") && t.sql.includes("'village'") && t.sql.includes("'county'"));
  console.log(`recreated: ${recreated.join(', ')}`);
  console.log(allExtended ? 'APPLIED: both triggers carry town/village/county' : 'ERROR: post-apply verification failed');
  if (!allExtended) process.exitCode = 1;
}
db.close();
