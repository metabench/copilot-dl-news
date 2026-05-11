#!/usr/bin/env node
'use strict';

/**
 * Migration: add layout_templates + layout_masks.
 *
 * CLI/output stays here; schema checks and migration SQL live in news-crawler-db.
 */

const path = require('path');
const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');

function getMigrationApi() {
  const dbModule = resolveNewsCrawlerDbModule();
  if (typeof dbModule.runLayoutTemplatesAndMasksMigration !== 'function') {
    throw new Error('news-crawler-db does not export runLayoutTemplatesAndMasksMigration. Build ../news-crawler-db first.');
  }
  return dbModule;
}

async function main() {
  const dbPath = path.join(__dirname, '../../data/news.db');
  const db = openNewsCrawlerDb(dbPath, { fileMustExist: true });

  try {
    console.log('=== Migration: add layout_templates + layout_masks ===');
    console.log('Database:', dbPath);

    const result = getMigrationApi().runLayoutTemplatesAndMasksMigration(db);
    console.log('Tables present:', result.tables.join(', '));
    console.log('Migration complete');
  } finally {
    db.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Migration failed:', error && error.stack ? error.stack : error);
    process.exit(1);
  });
}

module.exports = { main };
