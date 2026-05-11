#!/usr/bin/env node

/**
 * list-place-hubs - List all identified place hubs
 *
 * Usage:
 *   node tools/list-place-hubs.js                    # List all place hub URLs
 *   node tools/list-place-hubs.js --types            # Show table with URL and type
 *   node tools/list-place-hubs.js --show-types       # Same as --types
 */

const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');
const { listPlaceHubCliRows } = require('news-crawler-db');

async function main() {
  const args = process.argv.slice(2);
  const showTypes = args.includes('--types') || args.includes('--show-types');

  const dbPath = 'data/news.db';
  const db = openNewsCrawlerDb(dbPath, { readonly: true, fileMustExist: true });

  try {
    const rows = listPlaceHubCliRows(db, { showTypes });

    if (showTypes) {
      // Print table header
      console.log('URL'.padEnd(80) + ' | Type');
      console.log('-'.repeat(80) + '-+-' + '-'.repeat(10));

      // Print rows
      for (const row of rows) {
        const url = (row.url || '').substring(0, 78); // Truncate long URLs
        const type = row.type || 'unknown';
        console.log(url.padEnd(80) + ' | ' + type);
      }
    } else {
      // Just list URLs
      for (const row of rows) {
        console.log(row.url);
      }
    }

    console.log(`\nTotal: ${rows.length} place hubs`);
  } finally {
    await db.close();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.stack || err.message);
    process.exit(1);
  });
}
