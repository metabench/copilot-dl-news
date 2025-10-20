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

function exportTableToNDJSON(dbPath, tableName, outputPath) {
  console.log(`Exporting table '${tableName}' to ${path.basename(outputPath)}...`);

  // Create a fresh connection for each table to avoid isolation issues
  const db = new Database('data/news.db', { readonly: true }); // Use relative path like the working command
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');

  try {
    // Get row count first
    const count = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get().count;
    console.log(`  Found ${count} rows in ${tableName}`);

    if (count > 0) {
      const stmt = db.prepare(`SELECT * FROM ${tableName}`);
      console.log(`  Prepared SELECT statement for ${tableName}`);
      const rows = stmt.all();
      console.log(`  Retrieved ${rows.length} rows from ${tableName}`);

      const writeStream = fs.createWriteStream(outputPath);
      let writtenCount = 0;

      for (const row of rows) {
        writeStream.write(JSON.stringify(row) + '\n');
        writtenCount++;
      }

      writeStream.end();
      console.log(`  Exported ${writtenCount} rows from ${tableName}`);
      return writtenCount;
    } else {
      console.log(`  No rows to export from ${tableName}`);
      return 0;
    }
  } catch (err) {
    console.error(`  Failed to export ${tableName}: ${err.message}`);
    return 0;
  } finally {
    db.close();
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  const dbPath = options.dbPath
    ? path.resolve(process.cwd(), options.dbPath)
    : path.resolve(__dirname, '..', '..', 'data', 'news.db');

  console.log(`Using database path: ${dbPath}`);
  console.log(`Database file exists: ${fs.existsSync(dbPath)}`);

  const outputDir = options.outputDir
    ? path.resolve(process.cwd(), options.outputDir)
    : path.join(__dirname, '..', '..', 'gazetteer-export');

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
    let totalRows = 0;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

    for (const tableName of tablesToExport) {
      const outputPath = path.join(outputDir, `${tableName}.ndjson`);
      const rowCount = exportTableToNDJSON(dbPath, tableName, outputPath);
      totalRows += rowCount;
    }

    console.log('');
    console.log(`Export complete!`);
    console.log(`Total rows exported: ${totalRows}`);
    console.log(`Output directory: ${outputDir}`);

    // Create a manifest file
    const manifestPath = path.join(outputDir, 'manifest.json');
    const manifest = {
      exported_at: new Date().toISOString(),
      database_path: dbPath,
      tables: tablesToExport,
      total_rows: totalRows,
      format: 'ndjson'
    };

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`Manifest created: ${manifestPath}`);

  } catch (err) {
    console.error(`Export failed: ${err.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = { main, GAZETTEER_TABLES };