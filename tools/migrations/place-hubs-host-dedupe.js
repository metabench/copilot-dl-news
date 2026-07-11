#!/usr/bin/env node
'use strict';

/**
 * Migration 41: place-hubs host canonicalization + dedupe
 *
 * Fixes the www/bare host split (e.g. 'theguardian.com' vs
 * 'www.theguardian.com') and duplicate rows in place_hubs, canonicalizes
 * place_hub_candidates.domain and place_page_mappings.host, and installs
 * partial UNIQUE indexes so the duplicates cannot come back.
 *
 * The logic lives in news-crawler-db (placeHubsHostDedupeMigration.ts);
 * this is a thin CLI wrapper.
 *
 * Usage:
 *   node tools/migrations/place-hubs-host-dedupe.js            # apply to data/news.db
 *   node tools/migrations/place-hubs-host-dedupe.js --db path/to/news.db
 *   node tools/migrations/place-hubs-host-dedupe.js --status   # check only, no writes
 *   node tools/migrations/place-hubs-host-dedupe.js --down     # drop the unique indexes
 *                                                              # (data merges are not reversible)
 *
 * IMPORTANT: stop any running crawler before applying; the migration takes a
 * write transaction on the database.
 */

const path = require('path');
const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');
const { findProjectRoot } = require('../../src/shared/utils/project-root');
const migration = require('../../src/data/db/sqlite/v1/migrations/place_hubs_host_dedupe');

async function main() {
  const args = process.argv.slice(2);
  let dbPath;
  const dbIndex = args.indexOf('--db');
  if (dbIndex !== -1 && args[dbIndex + 1]) {
    dbPath = args[dbIndex + 1];
  } else {
    dbPath = path.join(findProjectRoot(__dirname), 'data', 'news.db');
  }

  console.log(`[Migration ${migration.MIGRATION_VERSION}] ${migration.MIGRATION_NAME}`);
  console.log(`[Migration] Using database: ${dbPath}`);

  const db = openNewsCrawlerDb(dbPath);
  try {
    if (args.includes('--status')) {
      const applied = migration.isApplied(db);
      console.log(`[Migration] Applied: ${applied}`);
      return { applied };
    }
    if (args.includes('--down')) {
      const result = migration.down(db);
      console.log('[Migration] Down result:', JSON.stringify(result, null, 2));
      return result;
    }
    const result = migration.up(db);
    if (result.alreadyApplied) {
      console.log('[Migration] Already applied; nothing to do.');
    } else {
      console.log('[Migration] Result:', JSON.stringify(result, null, 2));
    }
    return result;
  } finally {
    await db.close();
  }
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((error) => {
    console.error('[Migration] Failed:', error.message);
    process.exit(1);
  });
}

module.exports = { main };
