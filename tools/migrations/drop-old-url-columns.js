#!/usr/bin/env node
'use strict';

const path = require('path');
const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');

function getCleanupApi() {
  const dbModule = resolveNewsCrawlerDbModule();
  if (typeof dbModule.inspectOldUrlColumns !== 'function') {
    throw new Error('news-crawler-db does not export inspectOldUrlColumns. Build ../news-crawler-db first.');
  }
  if (typeof dbModule.dropOldUrlColumns !== 'function') {
    throw new Error('news-crawler-db does not export dropOldUrlColumns. Build ../news-crawler-db first.');
  }
  return dbModule;
}

async function closeDb(db) {
  if (db && typeof db.close === 'function') {
    await db.close();
  }
}

async function main() {
  const projectRoot = path.resolve(__dirname, '../..');
  const dbPath = path.join(projectRoot, 'data', 'news.db');
  const fix = process.argv.includes('--fix');
  const db = openNewsCrawlerDb(dbPath);
  const api = getCleanupApi();

  try {
    console.log('='.repeat(60));
    console.log('Drop old URL columns');
    console.log('='.repeat(60));

    if (!fix) {
      console.log('\nDRY RUN MODE - no changes will be made');
      console.log('\nCurrent schema state:');
      for (const row of api.inspectOldUrlColumns(db)) {
        const state = row.error ? `ERROR - ${row.error}` : row.exists ? 'EXISTS' : 'NOT FOUND';
        console.log(`  ${row.table}.${row.column}: ${state}`);
      }
      console.log('\nTo apply changes, run with --fix');
      return;
    }

    const report = api.dropOldUrlColumns(db, { fix: true });
    for (const row of report.dropped) {
      console.log(`  Dropped ${row.table}.${row.column}`);
    }
    for (const row of report.skipped) {
      console.log(`  Skipped ${row.table}.${row.column}: ${row.reason}`);
    }
    for (const row of report.errors) {
      console.log(`  Error ${row.table}.${row.column}: ${row.error}`);
    }

    console.log('\nURL normalization cleanup finished');
    if (report.errors.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await closeDb(db);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}

module.exports = { main };
