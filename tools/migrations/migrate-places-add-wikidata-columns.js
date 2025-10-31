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

const { ensureDatabase } = require('../src/db/sqlite');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'news.db');

console.log('Migrating places table: Adding Wikidata and Gazetteer columns');
console.log(`Database: ${dbPath}\n`);

const db = ensureDatabase(dbPath);

// Check current schema
const currentColumns = db.prepare(`PRAGMA table_info(places)`).all();
console.log(`Current columns: ${currentColumns.length}`);
console.log('Existing columns:', currentColumns.map(c => c.name).join(', '), '\n');

const columnsToAdd = [
  { name: 'wikidata_qid', type: 'TEXT', comment: 'Wikidata QID (e.g., Q30 for USA)' },
  { name: 'osm_type', type: 'TEXT', comment: 'OpenStreetMap type (node, way, relation)' },
  { name: 'osm_id', type: 'TEXT', comment: 'OpenStreetMap ID' },
  { name: 'area', type: 'REAL', comment: 'Area in square kilometers' },
  { name: 'gdp_usd', type: 'REAL', comment: 'GDP in USD (for countries/regions)' },
  { name: 'wikidata_admin_level', type: 'INTEGER', comment: 'Wikidata administrative level' },
  { name: 'wikidata_props', type: 'JSON', comment: 'Comprehensive Wikidata properties' },
  { name: 'osm_tags', type: 'JSON', comment: 'OpenStreetMap tags' },
  { name: 'crawl_depth', type: 'INTEGER DEFAULT 0', comment: '0=country, 1=ADM1, 2=ADM2, 3=city' },
  { name: 'priority_score', type: 'REAL', comment: 'For breadth-first scheduling' },
  { name: 'last_crawled_at', type: 'INTEGER', comment: 'Timestamp of last data fetch' }
];

const existingColumnNames = new Set(currentColumns.map(c => c.name));

let addedCount = 0;
let skippedCount = 0;

for (const column of columnsToAdd) {
  if (existingColumnNames.has(column.name)) {
    console.log(`⏭️  SKIP: Column '${column.name}' already exists`);
    skippedCount++;
    continue;
  }

  try {
    console.log(`➕ Adding column: ${column.name} (${column.type}) - ${column.comment}`);
    db.prepare(`ALTER TABLE places ADD COLUMN ${column.name} ${column.type}`).run();
    addedCount++;
  } catch (err) {
    console.error(`❌ Failed to add column '${column.name}':`, err.message);
    process.exit(1);
  }
}

console.log(`\n✅ Migration complete!`);
console.log(`   Added: ${addedCount} columns`);
console.log(`   Skipped: ${skippedCount} columns (already exist)`);

// Create missing indexes
console.log('\nCreating indexes...');

const indexesToCreate = [
  { name: 'idx_places_wikidata_qid', sql: 'CREATE INDEX IF NOT EXISTS idx_places_wikidata_qid ON places(wikidata_qid)' },
  { name: 'idx_places_crawl_depth', sql: 'CREATE INDEX IF NOT EXISTS idx_places_crawl_depth ON places(crawl_depth)' },
  { name: 'idx_places_priority_score', sql: 'CREATE INDEX IF NOT EXISTS idx_places_priority_score ON places(priority_score)' },
  { name: 'idx_places_osm', sql: 'CREATE INDEX IF NOT EXISTS idx_places_osm ON places(osm_type, osm_id)' }
];

for (const index of indexesToCreate) {
  try {
    console.log(`📊 Creating index: ${index.name}`);
    db.prepare(index.sql).run();
  } catch (err) {
    console.error(`❌ Failed to create index '${index.name}':`, err.message);
  }
}

// Verify final schema
const finalColumns = db.prepare(`PRAGMA table_info(places)`).all();
console.log(`\nFinal column count: ${finalColumns.length}`);
console.log('All columns:', finalColumns.map(c => c.name).join(', '));

db.close();
console.log('\n✅ Database closed successfully');
