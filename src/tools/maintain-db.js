#!/usr/bin/env node
// Maintenance tool for the SQLite DB: dedupe and enforce constraints

const path = require('path');
const { ensureDb, dedupePlaceSources } = require('../ensure_db');
const { repairGazetteer } = require('./gazetteer_qa');

function parseArgs(argv) {
  const args = {};
  for (const a of argv.slice(2)) {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    if (m) args[m[1]] = m[2]; else if (a.startsWith('--')) args[a.slice(2)] = '1';
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const dbPath = args.db; // ensureDb will create if missing
  const db = ensureDb(dbPath);
  try {
    const results = {};
    // Always dedupe place_sources; it's safe and idempotent
    results.place_sources = dedupePlaceSources(db);
  // Normalize & cleanup
  try { db.exec(`UPDATE place_names SET normalized = LOWER(TRIM(name)) WHERE (normalized IS NULL OR TRIM(normalized) = '') AND name IS NOT NULL;`); } catch (_) {}
    const beforePlaces = db.prepare('SELECT COUNT(*) AS c FROM places').get().c;
    const beforeNames = db.prepare('SELECT COUNT(*) AS c FROM place_names').get().c;
    // Trim whitespace-only names, then delete truly empty names
    try { db.exec(`UPDATE place_names SET name=TRIM(name) WHERE name <> TRIM(name);`); } catch (_) {}
    try { db.exec(`DELETE FROM place_names WHERE name IS NULL OR TRIM(name) = ''`); } catch (_) {}
    // Delete places that have no canonical name and no name rows
    try {
      db.exec(`
        DELETE FROM places
        WHERE (canonical_name_id IS NULL OR canonical_name_id NOT IN (SELECT id FROM place_names))
          AND NOT EXISTS(SELECT 1 FROM place_names pn WHERE pn.place_id = places.id);
      `);
    } catch (_) {}
    // Use shared repair actions
    const actions = repairGazetteer(db);
    const afterPlaces = db.prepare('SELECT COUNT(*) AS c FROM places').get().c;
    const afterNames = db.prepare('SELECT COUNT(*) AS c FROM place_names').get().c;
    results.cleanup = { placesBefore: beforePlaces, placesAfter: afterPlaces, namesBefore: beforeNames, namesAfter: afterNames, deletedPlaces: beforePlaces - afterPlaces };
    results.actions = actions;
    if (!args.quiet) {
      console.error('place_sources:', results.place_sources);
      console.error('cleanup:', results.cleanup);
      console.error('actions:', results.actions);
    }
  } finally {
    db.close();
  }
}

if (require.main === module) main();
