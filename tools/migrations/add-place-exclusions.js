#!/usr/bin/env node
/**
 * Migration: Add place_exclusions table
 *
 * This table stores patterns that should exclude a place name from being
 * recognized as a geographic entity, such as organization, personal, and
 * product names.
 *
 * Safe to run multiple times.
 */

'use strict';

const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');
const path = require('path');
const { CliFormatter } = require('../../src/shared/utils/CliFormatter');

const fmt = new CliFormatter();
const DEFAULT_DB_PATH = path.join(__dirname, '..', '..', 'data', 'news.db');

function getDbExport(name) {
  const dbModule = resolveNewsCrawlerDbModule();
  const value = dbModule[name];
  if (value === undefined) {
    throw new Error(`news-crawler-db does not export ${name}. Build ../news-crawler-db first.`);
  }
  return value;
}

function getDbApi(name) {
  const fn = getDbExport(name);
  if (typeof fn !== 'function') {
    throw new Error(`news-crawler-db export ${name} is not a function.`);
  }
  return fn;
}

const SEED_EXCLUSIONS = getDbExport('PLACE_EXCLUSION_SEEDS');

function createTable(db) {
  return getDbApi('ensurePlaceExclusionsSchema')(db);
}

function seedData(db) {
  return getDbApi('seedPlaceExclusions')(db, SEED_EXCLUSIONS);
}

function run(dbPath = DEFAULT_DB_PATH) {
  fmt.header('Place Exclusions Migration');
  fmt.stat('Database', dbPath);

  const db = openNewsCrawlerDb(dbPath);

  try {
    const result = getDbApi('runPlaceExclusionsMigration')(db, { seeds: SEED_EXCLUSIONS });
    fmt.stat('Status', result.existed ? `Table exists with ${result.rowsBeforeSeed} rows` : 'Table created');
    if (result.seeded > 0) {
      fmt.stat(result.existed ? 'New rows seeded' : 'Rows seeded', result.seeded);
    }

    fmt.section('Sample Data');
    for (const row of result.sample) {
      console.log(`  ${row.trigger_word}: "${row.exclusion_phrase}" (${row.exclusion_type})`);
    }

    fmt.success('Migration complete');
  } finally {
    db.close();
  }
}

if (require.main === module) {
  const dbPath = process.argv[2] || DEFAULT_DB_PATH;
  run(dbPath);
}

module.exports = { run, createTable, seedData, SEED_EXCLUSIONS };
