#!/usr/bin/env node
'use strict';

/**
 * Phase 1 implementation wrapper.
 *
 * DB-owned schema and migration-version behavior lives in news-crawler-db.
 */

const path = require('path');
const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');

function parseArgs(argv = process.argv.slice(2)) {
  const options = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [key, value] = arg.substring(2).split('=');
    options[key] = value || true;
  }
  return options;
}

function getPhaseApi() {
  const dbModule = resolveNewsCrawlerDbModule();
  const required = [
    'applyNormalizedPhase1Schema',
    'verifyNormalizedPhase1Tables',
    'recordNormalizedPhase1Migration',
    'runNormalizedPhase1Migration'
  ];

  for (const name of required) {
    if (typeof dbModule[name] !== 'function') {
      throw new Error(`news-crawler-db does not export ${name}. Build ../news-crawler-db first.`);
    }
  }

  return dbModule;
}

async function closeDb(db) {
  if (db && typeof db.close === 'function') {
    await db.close();
  }
}

function createNormalizedTables(db) {
  return getPhaseApi().applyNormalizedPhase1Schema(db);
}

function verifyTablesExist(db) {
  return getPhaseApi().verifyNormalizedPhase1Tables(db);
}

function recordSchemaVersion2(db) {
  return getPhaseApi().recordNormalizedPhase1Migration(db);
}

async function main() {
  const options = parseArgs();
  if (!options.db) {
    console.error('Usage: node tools/maintenance/phase-1-add-normalized-tables.js --db=path/to/database.db');
    process.exit(1);
  }

  const dbPath = path.resolve(options.db);
  const db = openNewsCrawlerDb(dbPath);
  const api = getPhaseApi();

  console.log('Phase 1: Add normalized tables');
  console.log('================================');
  console.log(`Database: ${dbPath}`);

  try {
    const result = api.runNormalizedPhase1Migration(db);

    console.log(`Tables created: ${result.schema.tablesCreated.length}`);
    console.log(`Tables already present: ${result.schema.tablesAlreadyPresent.length}`);
    console.log(`Indexes created: ${result.schema.indexesCreated.length}`);
    console.log(`Indexes already present: ${result.schema.indexesAlreadyPresent.length}`);

    for (const tableName of result.verification.existingTables) {
      console.log(`✓ ${tableName} exists`);
    }

    console.log(`✓ Schema version ${result.migration.version} recorded (${result.migration.name})`);
    console.log('\nPhase 1 complete');
  } finally {
    await closeDb(db);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Phase 1 failed:', error.message);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  createNormalizedTables,
  recordSchemaVersion2,
  verifyTablesExist,
  main
};
