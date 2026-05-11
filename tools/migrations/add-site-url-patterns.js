'use strict';

const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');
/**
 * Migration: Add site_url_patterns table
 * 
 * Stores discovered URL patterns from site analysis.
 * Used to predict place hub URLs more accurately.
 */
const path = require('path');

const dbPath = process.argv[2] || path.join(__dirname, '..', '..', 'data', 'news.db');

function up(db) {
  console.log('Creating site_url_patterns table...');
  db.migrationUtilities.ensureSiteUrlPatternsSchema();
  console.log('✅ site_url_patterns table created');
}

function down(db) {
  console.log('Dropping site_url_patterns table...');
  db.migrationUtilities.dropSiteUrlPatternsSchema();
  console.log('✅ site_url_patterns table dropped');
}

// Run if executed directly
if (require.main === module) {
  (async () => {
    const db = openNewsCrawlerDb(dbPath);
    const action = process.argv[3] || 'up';

    try {
      if (action === 'down') {
        down(db);
      } else {
        up(db);
      }
    } finally {
      await db.close();
    }
  })().catch((error) => {
    console.error('Migration failed:', error.message);
    process.exit(1);
  });
}

module.exports = { up, down };
