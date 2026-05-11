#!/usr/bin/env node
'use strict';

const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');

async function main() {
  const db = openNewsCrawlerDb('data/news.db');

  try {
    const result = db.migrationUtilities.ensureCrawlRunLogSchema();
    console.log(`Tables created or already exist: ${result.ensuredTables.join(', ')}`);
  } finally {
    await db.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Migration failed:', error.message);
    process.exit(1);
  });
}
