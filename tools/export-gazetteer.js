#!/usr/bin/env node

/**
 * export-gazetteer - Export gazetteer data to NDJSON files for backup
 *
 * Usage:
 *   node tools/export-gazetteer.js                     # Uses data/gazetteer.db by default
 *   node tools/export-gazetteer.js --db=./path/to.db   # Specify a different database
 *   node tools/export-gazetteer.js --output-dir=./gazetteer-backup  # Specify output directory
 *   node tools/export-gazetteer.js --tables=places,place_names  # Export only specific tables
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { exportGazetteerTables } = require('../src/db/sqlite/v1/queries/gazetteer.export');

// Core gazetteer tables to export
const GAZETTEER_TABLES = [
  'places',
  'place_names',
  'place_hierarchy',
  'place_attributes',
  'place_attribute_values',
  'place_external_ids',
  'place_hubs',
  'place_hub_unknown_terms',
  'place_provenance',
  'place_sources'
];

function parseArgs(argv) {
  const options = {
    dbPath: null,
    outputDir: null,
    tables: null
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      continue;
    }

    const withoutPrefix = arg.slice(2);
    let key;
    let value;

    if (withoutPrefix.includes('=')) {
      const [rawKey, ...rest] = withoutPrefix.split('=');
      key = rawKey;
      value = rest.join('=');
    } else {
      key = withoutPrefix;
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        value = next;
        i += 1;
      } else {
        value = true;
      }
    }

    switch (key) {
      case 'db':
        if (typeof value === 'string') {
          options.dbPath = value.trim();
        }
        break;
      case 'output-dir':
        if (typeof value === 'string') {
          options.outputDir = value.trim();
        }
        break;
      case 'tables':
        if (typeof value === 'string') {
          options.tables = value.split(',').map(t => t.trim());
        }
        break;
      default:
        // Ignore unknown flags
        break;
    }
  }

  return options;
}

function main() {
  const args = process.argv.slice(2);

  // Check for help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Gazetteer Data Exporter

Export gazetteer data to NDJSON files for backup.

USAGE:
  node tools/export-gazetteer.js [options]

OPTIONS:
  --help, -h           Show this help message
  --db=PATH            Path to SQLite database (default: data/news.db)
  --output-dir=DIR     Output directory (default: data/exports)
  --tables=LIST        Comma-separated list of tables to export (default: all gazetteer tables)

DEFAULT TABLES:
  places, place_names, place_hierarchy, place_attributes, place_attribute_values,
  place_external_ids, place_hubs, place_hub_unknown_terms, place_provenance, place_sources

EXAMPLES:
  node tools/export-gazetteer.js                              # Export all tables to data/exports/
  node tools/export-gazetteer.js --db=./data/test.db          # Export from specific database
  node tools/export-gazetteer.js --output-dir=./backup        # Export to custom directory
  node tools/export-gazetteer.js --tables=places,place_names  # Export only specific tables

OUTPUT:
  - NDJSON files for each table
  - manifest.json with export metadata
  - Console progress and statistics
`);
    process.exit(0);
  }

  const options = parseArgs(args);

  const dbPath = options.dbPath
    ? path.resolve(process.cwd(), options.dbPath)
    : path.resolve(__dirname, '..', '..', 'data', 'news.db');

  console.log(`Using database path: ${dbPath}`);
  console.log(`Database file exists: ${fs.existsSync(dbPath)}`);

  const outputDir = options.outputDir
    ? path.resolve(process.cwd(), options.outputDir)
    : path.join(__dirname, '..', 'data', 'exports');

  const tablesToExport = options.tables || GAZETTEER_TABLES;

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`Exporting gazetteer data from: ${dbPath}`);
  console.log(`Output directory: ${outputDir}`);
  console.log(`Tables to export: ${tablesToExport.join(', ')}`);
  console.log('');

  try {
    const db = new Database(dbPath, { readonly: true });
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    db.pragma('synchronous = NORMAL');

    const { exportedTables, totalRecords } = exportGazetteerTables(db, {
      outputDir,
      tables: tablesToExport
    });

    console.log('');
    console.log(`Export complete!`);
    console.log(`Total rows exported: ${totalRecords}`);
    console.log(`Output directory: ${outputDir}`);

    // Create a manifest file
    const manifestPath = path.join(outputDir, 'manifest.json');
    const manifest = {
      exported_at: new Date().toISOString(),
      database_path: dbPath,
      tables: exportedTables.map(t => t.tableName),
      total_rows: totalRecords,
      format: 'ndjson'
    };

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`Manifest created: ${manifestPath}`);

    db.close();

  } catch (err) {
    console.error(`Export failed: ${err.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = { main, GAZETTEER_TABLES };