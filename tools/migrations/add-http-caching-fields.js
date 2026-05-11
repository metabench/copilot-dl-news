#!/usr/bin/env node
'use strict';

/**
 * HTTP Caching Schema Migration
 *
 * Adds cache metadata fields to existing response/content tables to support
 * unified HTTP request/response caching for APIs and web content.
 *
 * This migration is safe to run multiple times.
 */

const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');
const path = require('path');
const { CliFormatter } = require('../../src/shared/utils/CliFormatter');

const fmt = new CliFormatter();
const DB_PATH = path.join(__dirname, '..', '..', 'data', 'news.db');

function getDbApi(name) {
  const dbModule = resolveNewsCrawlerDbModule();
  const fn = dbModule[name];
  if (typeof fn !== 'function') {
    throw new Error(`news-crawler-db does not export ${name}. Build ../news-crawler-db first.`);
  }
  return fn;
}

function openMigrationDb() {
  try {
    return openNewsCrawlerDb(DB_PATH);
  } catch (error) {
    fmt.error(`Failed to open database: ${error.message}`);
    process.exit(1);
  }
}

function main() {
  fmt.header('HTTP Caching Schema Migration');
  fmt.settings(`Database: ${DB_PATH}`);

  const db = openMigrationDb();

  try {
    const result = getDbApi('applyHttpCachingSchemaMigration')(db);

    for (const column of result.addedColumns) {
      fmt.info(`  Added column: ${column}`);
    }
    for (const indexName of result.indexes) {
      fmt.info(`  Ensured index: ${indexName}`);
    }

    fmt.success('Migration validation passed');
    fmt.success('Migration completed successfully!');
    fmt.info('The database now supports unified HTTP request/response caching.');
  } catch (error) {
    fmt.error(`Migration failed: ${error.message}`);
    process.exit(1);
  } finally {
    db.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
