#!/usr/bin/env node
'use strict';

/**
 * Phase 2 implementation wrapper.
 *
 * DB-owned prerequisite checks and migration-version behavior live in news-crawler-db.
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
    'verifyNormalizedDualWritePrerequisites',
    'recordNormalizedDualWriteMigration',
    'runNormalizedDualWriteMigration'
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

function verifyDualWriteEnabled(db) {
  return getPhaseApi().verifyNormalizedDualWritePrerequisites(db);
}

function recordSchemaVersion3(db) {
  return getPhaseApi().recordNormalizedDualWriteMigration(db);
}

async function main() {
  const options = parseArgs();
  if (!options.db) {
    console.error('Usage: node tools/migrations/phase-2-enable-dual-write.js --db=path/to/database.db');
    process.exit(1);
  }

  const dbPath = path.resolve(options.db);
  const db = openNewsCrawlerDb(dbPath);
  const api = getPhaseApi();

  console.log('Phase 2: Enable dual-write');
  console.log('===========================');
  console.log(`Database: ${dbPath}`);

  try {
    const result = api.runNormalizedDualWriteMigration(db);

    for (const tableName of result.verification.existingTables) {
      console.log(`✓ ${tableName} exists`);
    }

    if (result.verification.compressionTypesWarning) {
      console.warn(`⚠️  ${result.verification.compressionTypesWarning}`);
    } else {
      console.log(`✓ ${result.verification.compressionTypesCount} compression types available`);
    }

    console.log(`✓ Schema version ${result.migration.version} recorded (${result.migration.name})`);
    console.log('\nPhase 2 complete');
  } finally {
    await closeDb(db);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Phase 2 failed:', error.message);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  recordSchemaVersion3,
  verifyDualWriteEnabled,
  main
};
