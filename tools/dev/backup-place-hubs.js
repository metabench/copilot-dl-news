#!/usr/bin/env node
/**
 * backup-place-hubs.js - Backup place hub mappings and related reference tables.
 *
 * SQL, schema extraction, and data-copy ownership live in news-crawler-db.
 *
 * Usage:
 *   node tools/dev/backup-place-hubs.js
 *   node tools/dev/backup-place-hubs.js --output data/exports/my-backup.db
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');

const args = process.argv.slice(2);
const help = args.includes('--help');

if (help) {
  console.log(`
Usage: node tools/dev/backup-place-hubs.js [options]

Creates a standalone SQLite backup of place_page_mappings and its dependencies
(places, place_names, place_hubs).

Options:
  --output <path>  Output path for backup DB (default: tmp/backups/place-hubs-YYYY-MM-DD-HHmm.db)
  --help           Show this help
`);
  process.exit(0);
}

function getDbExport(name) {
  const dbModule = resolveNewsCrawlerDbModule();
  const value = dbModule[name];
  if (!value) {
    throw new Error(`news-crawler-db does not export ${name}. Build ../news-crawler-db first.`);
  }
  return value;
}

function closeDb(db) {
  if (db && typeof db.close === 'function') {
    db.close();
  }
}

function resolveOutputPath() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
  const defaultOutDir = path.resolve(__dirname, '../../tmp/backups');
  const outArgIndex = args.indexOf('--output');
  let outPath = outArgIndex !== -1 ? args[outArgIndex + 1] : null;

  if (!outPath) {
    outPath = path.join(defaultOutDir, `place-hubs-backup-${timestamp}.db`);
  }

  return path.resolve(outPath);
}

function ensureOutputPath(outPath) {
  const outDir = path.dirname(outPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  if (fs.existsSync(outPath)) {
    console.warn(`Warning: Overwriting existing file ${outPath}`);
    fs.unlinkSync(outPath);
  }
}

function backupPlaceHubs() {
  const backupTables = getDbExport('PLACE_HUB_BACKUP_TABLES');
  const backupTablesToDatabase = getDbExport('backupPlaceHubTables');
  const sourceDbPath = path.resolve(__dirname, '../../data/news.db');
  const outPath = resolveOutputPath();

  ensureOutputPath(outPath);

  console.log(`Source DB: ${sourceDbPath}`);
  console.log(`Backup DB: ${outPath}`);
  console.log(`Tables: ${backupTables.join(', ')}`);

  const sourceDb = openNewsCrawlerDb(sourceDbPath, { readonly: true, fileMustExist: true });
  const targetDb = openNewsCrawlerDb(outPath);

  try {
    const report = backupTablesToDatabase(sourceDb, targetDb, sourceDbPath, {
      tables: backupTables
    });

    if (report.skipped.length > 0) {
      for (const item of report.skipped) {
        console.log(`Table ${item.table} skipped: ${item.reason}`);
      }
    }

    for (const table of report.createdTables) {
      console.log(`Created table: ${table}`);
    }

    for (const table of report.copiedTables) {
      console.log(`Copied ${table.table}: ${table.rows} rows`);
    }
  } finally {
    closeDb(targetDb);
    closeDb(sourceDb);
  }

  const finalStats = fs.statSync(outPath);
  console.log('');
  console.log('Backup completed successfully.');
  console.log(`Size: ${(finalStats.size / 1024 / 1024).toFixed(2)} MB`);
}

if (require.main === module) {
  try {
    backupPlaceHubs();
  } catch (error) {
    console.error('Backup failed:', error.message);
    process.exit(1);
  }
}

module.exports = { backupPlaceHubs };
