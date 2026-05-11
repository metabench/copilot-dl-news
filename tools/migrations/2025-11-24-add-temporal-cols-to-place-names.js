#!/usr/bin/env node
'use strict';

const path = require('path');
const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');

const DB_PATH = path.join(__dirname, '../../data/gazetteer.db');

async function migrate() {
  console.log(`Migrating database at ${DB_PATH}...`);
  const db = openNewsCrawlerDb(DB_PATH);

  try {
    const result = db.migrationUtilities.ensurePlaceNameTemporalColumns();

    for (const column of result.addedColumns) {
      console.log(`Adding column: ${column}`);
    }
    for (const column of result.existingColumns) {
      console.log(`Column ${column} already exists.`);
    }

    console.log('Migration complete.');
  } finally {
    await db.close();
  }
}

if (require.main === module) {
  migrate().catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
}

module.exports = { migrate };
