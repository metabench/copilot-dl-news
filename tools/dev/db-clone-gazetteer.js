#!/usr/bin/env node
'use strict';

// Clone gazetteer tables from a source SQLite database into a fresh destination
// database that keeps the full schema but only copies gazetteer data (no
// downloads, site patterns, or crawl history). The destination schema is
// initialized with ensureDatabase(), then gazetteer tables are copied from the
// source using ATTACH + INSERT ... SELECT. All other tables remain empty and
// ready for new crawls.

const fs = require('fs');
const path = require('path');
const { CliArgumentParser } = require('../../src/utils/CliArgumentParser');
const { initializeSchema } = require('../../src/db/sqlite/v1/schema');
const { CliFormatter } = require('../../src/utils/CliFormatter');
const { findProjectRoot } = require('../../src/utils/project-root');
const { ensureDatabase } = require('../../src/db/sqlite/v1/connection');

const fmt = new CliFormatter();

const DEFAULT_TABLES = [
  // Copy place_names first to ease trigger constraints when re-enabled
  'place_names',
  'places',
  'place_hierarchy',
  'place_sources',
  'place_external_ids',
  'place_attribute_values',
  'place_attributes',
  'place_provenance',
  'ingestion_runs',
  'gazetteer_crawl_state',
  'topic_keywords',
  'crawl_skip_terms',
  'domain_locales'
];

function parseArgs(argv) {
  const parser = new CliArgumentParser(
    'db-clone-gazetteer',
    'Clone gazetteer tables into a fresh database with empty downloads/site patterns'
  );

  parser
    .add('--source <path>', 'Source database path', 'data/news.db')
    .add('--dest <path>', 'Destination database path', 'data/news-gazetteer-only.db')
    .add('--tables <csv>', 'Optional comma-separated table whitelist (defaults to gazetteer set)')
    .add('--overwrite', 'Overwrite destination if it exists', false, 'boolean')
    .add('--json', 'Emit JSON summary', false, 'boolean')
    .add('--quiet', 'Suppress human-friendly output', false, 'boolean')
    .add('--verbose', 'Verbose schema initialization logging', false, 'boolean');

  return parser.parse(argv);
}

function resolvePath(projectRoot, candidate) {
  if (!candidate) return undefined;
  return path.isAbsolute(candidate) ? candidate : path.join(projectRoot, candidate);
}

function escapePathForSql(p) {
  return p.replace(/'/g, "''");
}

function tableExists(db, table, namespace = 'main') {
  const stmt = db.prepare(`SELECT name FROM ${namespace}.sqlite_master WHERE type='table' AND name=?`);
  return !!stmt.get(table);
}

function getColumns(db, table, namespace = 'main') {
  const stmt = db.prepare(`PRAGMA ${namespace}.table_info('${table}')`);
  return stmt.all().map((row) => row.name);
}

function buildColumnList(columns) {
  return columns.map((c) => `"${c}"`).join(', ');
}

function copyTables(db, tables, logger) {
  const results = [];
  const tx = db.transaction(() => {
    for (const table of tables) {
      const sourceHas = tableExists(db, table, 'sourceDb');
      const destHas = tableExists(db, table, 'main');

      if (!sourceHas || !destHas) {
        results.push({ table, copied: 0, status: 'skipped', reason: sourceHas ? 'dest-missing' : 'source-missing' });
        continue;
      }

      const destColumns = getColumns(db, table, 'main');
      const sourceColumns = getColumns(db, table, 'sourceDb');
      const commonColumns = destColumns.filter((c) => sourceColumns.includes(c));

      if (commonColumns.length === 0) {
        results.push({ table, copied: 0, status: 'skipped', reason: 'no-common-columns' });
        continue;
      }

      const columnList = buildColumnList(commonColumns);

      db.exec(`DELETE FROM "${table}";`);
      db.exec(`INSERT INTO "${table}" (${columnList}) SELECT ${columnList} FROM sourceDb."${table}";`);
      const count = db.prepare(`SELECT COUNT(*) as c FROM "${table}";`).get()?.c || 0;

      results.push({ table, copied: count, status: 'ok', columns: commonColumns.length });
      if (logger && logger.log) {
        logger.log(`[clone] ${table}: copied ${count} rows (${commonColumns.length} cols)`);
      }
    }
  });

  tx();
  return results;
}

function dropCanonicalTriggers(db) {
  const triggers = ['trg_places_canon_ins', 'trg_places_canon_upd'];
  for (const trig of triggers) {
    try {
      db.exec(`DROP TRIGGER IF EXISTS ${trig};`);
    } catch (err) {
      // best-effort
    }
  }
}

function main() {
  const args = parseArgs(process.argv);
  const projectRoot = findProjectRoot(__dirname);
  const sourcePath = resolvePath(projectRoot, args.source);
  const destPath = resolvePath(projectRoot, args.dest);
  const overwrite = !!args.overwrite;
  const tables = args.tables
    ? args.tables.split(',').map((t) => t.trim()).filter(Boolean)
    : DEFAULT_TABLES.slice();

  if (!sourcePath) {
    fmt.error('Source path is required');
    process.exit(1);
    return;
  }

  if (!destPath) {
    fmt.error('Destination path is required');
    process.exit(1);
    return;
  }

  if (path.resolve(sourcePath) === path.resolve(destPath)) {
    fmt.error('Source and destination paths must differ');
    process.exit(1);
    return;
  }

  if (!fs.existsSync(sourcePath)) {
    fmt.error(`Source database not found: ${sourcePath}`);
    process.exit(1);
    return;
  }

  if (fs.existsSync(destPath)) {
    if (!overwrite) {
      fmt.error(`Destination already exists: ${destPath} (use --overwrite to replace)`);
      process.exit(1);
      return;
    }
    fs.unlinkSync(destPath);
  }

  let db;
  const summary = {
    source: sourcePath,
    destination: destPath,
    tables,
    copied: [],
    startedAt: new Date().toISOString()
  };

  try {
    db = ensureDatabase(destPath, { verbose: !!args.verbose, logger: console });
    // Attach source in the same connection for fast copy
    const escapedSource = escapePathForSql(sourcePath);
    db.exec(`ATTACH DATABASE '${escapedSource}' AS sourceDb;`);

    // Disable FKs and drop canonical triggers to avoid circular ordering issues during copy
    db.exec('PRAGMA foreign_keys = OFF;');
    dropCanonicalTriggers(db);

    summary.copied = copyTables(db, tables, args.verbose ? console : null);

    db.exec('PRAGMA foreign_keys = ON;');
    db.exec('DETACH DATABASE sourceDb;');

    // Recreate triggers (idempotent via initializeSchema)
    initializeSchema(db, { verbose: false, logger: console });
    summary.completedAt = new Date().toISOString();
  } catch (error) {
    summary.error = error?.message || String(error);
    fmt.error(summary.error);
    process.exitCode = 1;
  } finally {
    try { db?.close(); } catch (_) {}
  }

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (args.quiet) {
    if (summary.error) process.exit(1);
    return;
  }

  fmt.header('Gazetteer Clone');
  fmt.info(`Source: ${summary.source}`);
  fmt.info(`Destination: ${summary.destination}`);
  fmt.info(`Tables: ${summary.tables.join(', ')}`);
  fmt.blank();

  if (summary.error) {
    fmt.error(summary.error);
    process.exit(1);
    return;
  }

  fmt.section('Copy Results');
  for (const result of summary.copied) {
    const label = `${result.table}: ${result.status}`;
    if (result.status === 'ok') {
      fmt.stat(label, `${result.copied} rows`);
    } else {
      fmt.warn(`${label} (${result.reason})`);
    }
  }

  fmt.success('Clone complete');
  fmt.footer();
}

if (require.main === module) {
  main();
}
