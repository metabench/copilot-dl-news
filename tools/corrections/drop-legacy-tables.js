#!/usr/bin/env node

/**
 * drop-legacy-tables.js - Drop legacy articles and fetches tables after Phase 5 migration
 *
 * Usage:
 *   node tools/corrections/drop-legacy-tables.js              # Dry run (default)
 *   node tools/corrections/drop-legacy-tables.js --fix        # Apply changes
 */

const { ensureDatabase } = require('../../src/db/sqlite');
const { dropLegacyTables } = require('../../src/db/sqlite/v1/queries/maintenance');
const path = require('path');

// Default to dry-run mode, require --fix to apply changes
const dryRun = !process.argv.includes('--fix');

async function main() {
  console.log('='.repeat(60));
  console.log('DROP LEGACY TABLES (Phase 5 Cleanup)');
  console.log('='.repeat(60));

  const dbPath = path.join(__dirname, '../../data/news.db');
  const db = ensureDatabase(dbPath);

  try {
    const { legacyTables } = dropLegacyTables(db, { dryRun });

    if (legacyTables.length === 0) {
      console.log('✅ No legacy tables found - Phase 5 cleanup already complete');
      return;
    }

    console.log('Found legacy tables:');
    legacyTables.forEach(table => {
      const count = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get();
      console.log(`  - ${table.name}: ${count.count} rows`);
    });

    if (dryRun) {
      console.log('\nDRY RUN - Would drop the following tables:');
      legacyTables.forEach(table => console.log(`  - DROP TABLE ${table.name}`));
      console.log('\nRun with --fix to apply changes');
    } else {
      console.log('\nDROPPING LEGACY TABLES...');
      for (const table of legacyTables) {
        console.log(`Dropping ${table.name}...`);
        console.log(`✅ Dropped ${table.name}`);
      }
      console.log('\n✅ LEGACY TABLES DROPPED - Phase 5 migration complete!');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

main().catch(console.error);