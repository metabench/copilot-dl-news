#!/usr/bin/env node
'use strict';

/**
 * Migration: Add URL classification tables.
 *
 * DB-owned schema and migration-record behavior lives in news-crawler-db.
 */

const path = require('path');
const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');

function getUrlClassificationMigrationApi() {
  const dbModule = resolveNewsCrawlerDbModule();
  const required = [
    'URL_CLASSIFICATION_TABLES_MIGRATION_VERSION',
    'URL_CLASSIFICATION_TABLES_MIGRATION_NAME',
    'applyUrlClassificationTablesMigration',
    'rollbackUrlClassificationTablesMigration',
    'isUrlClassificationTablesMigrationApplied',
    'listUrlClassificationMigrationTables'
  ];

  for (const name of required) {
    if (typeof dbModule[name] === 'undefined') {
      throw new Error(`news-crawler-db does not export ${name}. Build ../news-crawler-db first.`);
    }
  }

  return dbModule;
}

function up(db) {
  return getUrlClassificationMigrationApi().applyUrlClassificationTablesMigration(db);
}

function down(db) {
  return getUrlClassificationMigrationApi().rollbackUrlClassificationTablesMigration(db);
}

function isApplied(db) {
  return getUrlClassificationMigrationApi().isUrlClassificationTablesMigrationApplied(db);
}

function parseArgs(argv = process.argv.slice(2)) {
  return {
    dbPath: argv.includes('--db')
      ? argv[argv.indexOf('--db') + 1]
      : path.join(__dirname, '..', '..', 'data', 'news.db'),
    rollback: argv.includes('--down') || argv.includes('--rollback')
  };
}

function main() {
  const options = parseArgs();
  const api = getUrlClassificationMigrationApi();

  console.log('Opening database:', options.dbPath);
  const db = openNewsCrawlerDb(options.dbPath);

  try {
    if (options.rollback) {
      const result = down(db);
      console.log(`Rollback ${result.migrationVersion}: removed URL classification tables`);
      return;
    }

    if (isApplied(db)) {
      console.log('Migration already applied');
    } else {
      console.log('Applying migration...');
      const result = up(db);
      console.log(`Migration ${result.migrationVersion}: added URL classification tables`);
      console.log(`Tables created: ${result.tablesCreated.length}`);
      console.log(`Indexes created: ${result.indexesCreated.length}`);
    }

    const tables = api.listUrlClassificationMigrationTables(db);
    console.log('Tables present:', tables.join(', '));
  } finally {
    db.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  version: getUrlClassificationMigrationApi().URL_CLASSIFICATION_TABLES_MIGRATION_VERSION,
  name: getUrlClassificationMigrationApi().URL_CLASSIFICATION_TABLES_MIGRATION_NAME,
  parseArgs,
  up,
  down,
  isApplied,
  main
};
