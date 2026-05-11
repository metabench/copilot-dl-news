#!/usr/bin/env node
'use strict';

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

function getSchemaApi() {
  const dbModule = resolveNewsCrawlerDbModule();
  if (typeof dbModule.applyUrlNormalizationSchema !== 'function') {
    throw new Error('news-crawler-db does not export applyUrlNormalizationSchema. Build ../news-crawler-db first.');
  }
  if (typeof dbModule.getUrlNormalizationTableColumns !== 'function') {
    throw new Error('news-crawler-db does not export getUrlNormalizationTableColumns. Build ../news-crawler-db first.');
  }
  return dbModule;
}

async function closeDb(db) {
  if (db && typeof db.close === 'function') {
    await db.close();
  }
}

async function main() {
  const options = parseArgs();
  if (!options.db) {
    console.error('Usage: node tools/migrations/url-normalization-schema.js --db=path/to/database.db');
    process.exit(1);
  }

  const dbPath = path.resolve(options.db);
  const db = openNewsCrawlerDb(dbPath);
  const api = getSchemaApi();

  try {
    console.log(`Applying URL normalization schema to: ${dbPath}`);
    const report = api.applyUrlNormalizationSchema(db);
    console.log(`Columns added: ${report.columnsAdded.length}`);
    console.log(`Columns already present: ${report.columnsAlreadyPresent.length}`);
    console.log(`Indexes created: ${report.indexesCreated.length}`);
    console.log(`Indexes already present: ${report.indexesAlreadyPresent.length}`);

    console.log('\nSchema verification:');
    for (const table of ['links', 'queue_events', 'crawl_jobs', 'errors', 'url_aliases']) {
      const columns = api.getUrlNormalizationTableColumns(db, table);
      console.log(`\n${table} columns:`);
      for (const col of columns) {
        console.log(`  ${col.name}: ${col.type}${col.pk ? ' (PK)' : ''}`);
      }
    }
    console.log('\nSchema application complete');
  } finally {
    await closeDb(db);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Schema application failed:', error.message);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  main
};
