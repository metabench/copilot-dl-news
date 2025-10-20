#!/usr/bin/env node

/*
  import-gazetteer.js
  - Imports gazetteer data from NDJSON file into the gazetteer database
  - Handles multiple record types: place_source, place, place_name, place_hierarchy, place_external_id
  - Safe to run multiple times; uses INSERT OR IGNORE patterns
*/

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const ndjson = require('ndjson');
const { initGazetteerTables } = require('../db/sqlite/schema');
const { findProjectRoot } = require('../utils/project-root');

// Initialize gazetteer database
function initGazetteerDb(dbPath) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const db = new Database(dbPath);
  // Sensible pragmas for tools
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = OFF'); // Disable during import to handle unordered data
  try { db.pragma('busy_timeout = 5000'); } catch (_) {}
  try { db.pragma('synchronous = NORMAL'); } catch (_) {}

  // Initialize gazetteer tables
  initGazetteerTables(db, { verbose: false, logger: console });

  return db;
}

function getArg(name, fallback) {
  const a = process.argv.find(x => x.startsWith(`--${name}=`));
  if (!a) return fallback;
  const v = a.split('=')[1];
  return v === undefined ? fallback : v;
}

(async () => {
  const log = (...args) => { try { console.error(...args); } catch (_) {} };
  const projectRoot = findProjectRoot(__dirname);
  const dbPath = getArg('db', path.join(projectRoot, 'data', 'gazetteer.db'));
  const ndjsonPath = getArg('ndjson', path.join(projectRoot, 'data', 'gazetteer.ndjson'));
  const verbose = String(getArg('verbose', '1')) === '1';

  if (!fs.existsSync(ndjsonPath)) {
    console.error(`NDJSON file not found: ${ndjsonPath}`);
    process.exit(1);
  }

  const raw = initGazetteerDb(dbPath);

  // Prepare statements for each table type
  const statements = {
    place_source: raw.prepare(`
      INSERT OR IGNORE INTO place_sources(id, name, version, url, license)
      VALUES(?, ?, ?, ?, ?)
    `),
    place: raw.prepare(`
      INSERT OR REPLACE INTO places(id, kind, country_code, population, timezone, lat, lng, bbox, canonical_name_id, source, extra)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    place_name: raw.prepare(`
      INSERT OR IGNORE INTO place_names(id, place_id, name, normalized, lang, script, name_kind, is_preferred, is_official, source)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    place_hierarchy: raw.prepare(`
      INSERT OR IGNORE INTO place_hierarchy(parent_id, child_id, relation, depth)
      VALUES(?, ?, ?, ?)
    `),
    place_external_id: raw.prepare(`
      INSERT OR IGNORE INTO place_external_ids(source, ext_id, place_id)
      VALUES(?, ?, ?)
    `)
  };

  let counts = {
    place_source: 0,
    place: 0,
    place_name: 0,
    place_hierarchy: 0,
    place_external_id: 0
  };

  const readStream = fs.createReadStream(ndjsonPath);
  const parser = ndjson.parse();

  log(`[gazetteer] Importing from ${ndjsonPath} into ${dbPath}`);

  let recordCount = 0;
  let processed = false;

  const processRecord = (record) => {
    recordCount++;
    const { type, ...data } = record;

    if (!statements[type]) {
      log(`[gazetteer] Warning: Unknown record type '${type}', skipping`);
      return;
    }

    try {
      switch (type) {
        case 'place_source':
          statements.place_source.run(
            data.id,
            data.name,
            data.version,
            data.url,
            data.license
          );
          break;

        case 'place':
          statements.place.run(
            data.id,
            data.kind,
            data.country_code,
            data.population,
            data.timezone,
            data.lat,
            data.lng,
            data.bbox,
            data.canonical_name_id,
            data.source,
            data.extra ? JSON.stringify(data.extra) : null
          );
          break;

        case 'place_name':
          statements.place_name.run(
            data.id,
            data.place_id,
            data.name,
            data.normalized,
            data.lang,
            data.script,
            data.name_kind,
            data.is_preferred ? 1 : 0,
            data.is_official ? 1 : 0,
            data.source
          );
          break;

        case 'place_hierarchy':
          statements.place_hierarchy.run(
            data.parent_id,
            data.child_id,
            data.relation,
            data.depth
          );
          break;

        case 'place_external_id':
          statements.place_external_id.run(
            data.source,
            data.ext_id,
            data.place_id
          );
          break;
      }

      counts[type]++;

      if (verbose && (recordCount % 1000 === 0)) {
        log(`[gazetteer] Processed ${recordCount} records, imported ${Object.values(counts).reduce((a,b)=>a+b,0)}`);
      }
    } catch (err) {
      log(`[gazetteer] Error importing ${type} record:`, err.message);
      if (verbose) log('Record data:', JSON.stringify(data));
    }
  };

  parser.on('data', processRecord);

  parser.on('end', () => {
    processed = true;

    // Re-enable foreign key constraints and validate
    try {
      raw.pragma('foreign_keys = ON');
      log(`[gazetteer] Foreign key constraints re-enabled`);
    } catch (err) {
      log(`[gazetteer] Warning: Could not re-enable foreign keys: ${err.message}`);
    }

    // Final summary
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    log(`[gazetteer] Import complete:`);
    Object.entries(counts).forEach(([type, count]) => {
      if (count > 0) log(`  ${type}: ${count}`);
    });
    log(`  Total: ${total} records`);

    try { raw.close(); } catch (_) {}

    // Output JSON summary for automation
    console.log(JSON.stringify({
      imported: counts,
      total,
      source: ndjsonPath,
      database: dbPath
    }));
  });

  parser.on('error', (err) => {
    log(`[gazetteer] Parser error: ${err.message}`);
    try { raw.close(); } catch (_) {}
    process.exit(1);
  });

  readStream.pipe(parser);
})();