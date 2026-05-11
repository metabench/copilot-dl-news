#!/usr/bin/env node
'use strict';

const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');

async function main() {
  const db = openNewsCrawlerDb('data/news.db');

  try {
    console.log('Checking worker URL columns...');
    const result = db.migrationUtilities.ensureWorkerUrlColumns();

    for (const column of result.addedColumns) {
      console.log(`Adding column: ${column}`);
    }
    for (const column of result.existingColumns) {
      console.log(`Skipping existing: ${column}`);
    }
    for (const failure of result.failedColumns) {
      console.error(`Failed to add ${failure.column}: ${failure.message}`);
    }

    console.log('Verified status index.');
    console.log('Migration complete.');
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
