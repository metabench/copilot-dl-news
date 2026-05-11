#!/usr/bin/env node

/**
 * Migration: Add Wikidata and Gazetteer columns to places table
 * 
 * Adds missing columns for Wikidata integration and breadth-first crawling:
 * - wikidata_qid, osm_type, osm_id
 * - area, gdp_usd, wikidata_admin_level
 * - wikidata_props, osm_tags
 * - crawl_depth, priority_score, last_crawled_at
 */

const path = require('path');
const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');

const dbPath = path.join(__dirname, '..', '..', 'data', 'news.db');

console.log('Migrating places table: Adding Wikidata and Gazetteer columns');
console.log(`Database: ${dbPath}\n`);

async function main() {
  const db = openNewsCrawlerDb(dbPath);
  const { PLACES_WIKIDATA_COLUMNS, migratePlacesAddWikidataColumns } = resolveNewsCrawlerDbModule();

  try {
    const report = migratePlacesAddWikidataColumns(db);
    console.log(`Current columns: ${report.beforeColumnCount}`);
    console.log('Existing columns:', report.beforeColumns.join(', '), '\n');

    for (const column of PLACES_WIKIDATA_COLUMNS) {
      if (report.addedColumns.includes(column.name)) {
        console.log(`➕ Added column: ${column.name} (${column.type}) - ${column.comment}`);
      } else {
        console.log(`⏭️  SKIP: Column '${column.name}' already exists`);
      }
    }

    console.log(`\n✅ Migration complete!`);
    console.log(`   Added: ${report.addedColumns.length} columns`);
    console.log(`   Skipped: ${report.skippedColumns.length} columns (already exist)`);

    console.log('\nCreating indexes...');
    for (const indexName of report.indexes) {
      console.log(`📊 Ensured index: ${indexName}`);
    }

    console.log(`\nFinal column count: ${report.finalColumnCount}`);
    console.log('All columns:', report.finalColumns.join(', '));
  } finally {
    await db.close();
  }
}

main().then(() => {
  console.log('\n✅ Database closed successfully');
}).catch(error => {
  console.error('❌ Migration failed:', error.message);
  process.exitCode = 1;
});
