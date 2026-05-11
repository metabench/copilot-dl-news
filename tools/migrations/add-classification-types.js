#!/usr/bin/env node
'use strict';

/**
 * Migration: Add classification_types lookup table.
 *
 * DB-owned schema, seed, discovery, and summary logic lives in news-crawler-db.
 */

const path = require('path');
const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');
const { CliFormatter } = require('../../src/shared/utils/CliFormatter');

const fmt = new CliFormatter();
const DEFAULT_DB_PATH = path.join(__dirname, '..', '..', 'data', 'news.db');

function getClassificationMigrationApi() {
  const dbModule = resolveNewsCrawlerDbModule();
  const required = [
    'CLASSIFICATION_TYPE_SEED_ROWS',
    'ensureClassificationTypesTable',
    'seedClassificationTypes',
    'discoverAdditionalClassificationTypes',
    'summarizeClassificationTypes',
    'runClassificationTypesMigration',
    'inspectClassificationTypesMigration'
  ];

  for (const name of required) {
    if (typeof dbModule[name] === 'undefined') {
      throw new Error(`news-crawler-db does not export ${name}. Build ../news-crawler-db first.`);
    }
  }

  return dbModule;
}

function parseArgs(argv = process.argv.slice(2)) {
  return {
    dbPath: argv.includes('--db') ? argv[argv.indexOf('--db') + 1] : DEFAULT_DB_PATH,
    dryRun: argv.includes('--dry-run')
  };
}

function createTable(db) {
  return getClassificationMigrationApi().ensureClassificationTypesTable(db);
}

function seedClassifications(db) {
  return getClassificationMigrationApi().seedClassificationTypes(db);
}

function discoverAdditionalClassifications(db) {
  return getClassificationMigrationApi().discoverAdditionalClassificationTypes(db);
}

function printSummary(summary) {
  fmt.section('Classification Types Summary');
  fmt.stat('Total classification types', summary.total, 'number');

  for (const row of summary.byCategory) {
    fmt.stat(`  ${row.category || 'uncategorized'}`, row.count, 'number');
  }

  fmt.section('Usage in content_analysis');
  if (summary.usage.length === 0) {
    fmt.info('No classifications currently in use');
  } else {
    for (const row of summary.usage) {
      fmt.info(`  ${row.emoji || '📄'} ${row.display_name}: ${row.usage_count.toLocaleString()} documents`);
    }
  }
}

function showStats(db) {
  const summary = getClassificationMigrationApi().summarizeClassificationTypes(db);
  printSummary(summary);
  return summary;
}

function main() {
  const options = parseArgs();

  fmt.header('Classification Types Migration');
  fmt.settings(`Database: ${options.dbPath}`);

  if (options.dryRun) {
    fmt.info('DRY RUN - no changes will be made');
  }

  let db;
  try {
    db = openNewsCrawlerDb(options.dbPath);
    const api = getClassificationMigrationApi();

    if (options.dryRun) {
      const inspection = api.inspectClassificationTypesMigration(db);
      if (inspection.tableExists) {
        fmt.info('Table already exists');
        printSummary(inspection.summary);
      } else {
        fmt.info('Table would be created');
        fmt.info(`${inspection.seedCount} seed classifications would be inserted`);
      }
    } else {
      const result = api.runClassificationTypesMigration(db);
      fmt.info(result.tableCreated ? 'Table created' : 'Table already exists');
      fmt.stat('Inserted', result.seed.inserted, 'number');
      fmt.stat('Skipped (already exist)', result.seed.skipped, 'number');

      if (result.discovered.inserted > 0) {
        fmt.stat('Additional types discovered', result.discovered.inserted, 'number');
        for (const row of result.discovered.added) {
          fmt.info(`  Added: ${row.name} -> ${row.display_name}`);
        }
      } else {
        fmt.info('No additional classifications found');
      }

      printSummary(result.summary);
    }

    fmt.success('Migration complete');
  } catch (error) {
    fmt.error(`Migration failed: ${error.message}`);
    process.exit(1);
  } finally {
    if (db) db.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  createTable,
  seedClassifications,
  discoverAdditionalClassifications,
  showStats,
  main
};
