#!/usr/bin/env node
'use strict';

/**
 * Create place_hub_guess_runs table
 *
 * Adds a table to store metadata for place hub guessing runs,
 * similar to analysis_runs but for hub discovery operations.
 */

const path = require('path');
const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');

async function main() {
  const dbPath = path.join(__dirname, '../../data/news.db');
  const db = openNewsCrawlerDb(dbPath);

  console.log('Creating place_hub_guess_runs table...');

  try {
    const result = db.migrationUtilities.ensurePlaceHubGuessRunsSchema();
    console.log(`✅ ${result.ensuredTable} table created successfully`);
    console.log(`✅ Indexes created for efficient querying: ${result.ensuredIndexes.join(', ')}`);
  } finally {
    await db.close();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });
}

module.exports = { main };
