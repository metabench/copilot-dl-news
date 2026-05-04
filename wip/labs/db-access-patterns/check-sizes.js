#!/usr/bin/env node
/**
 * Quick check of gazetteer table sizes
 */
const path = require('path');
const { ensureDatabase } = require('../../src/db/sqlite');

const dbPath = path.join(__dirname, '../../data/news.db');
const db = ensureDatabase(dbPath);

// Get place-related tables
const tables = db.prepare(`
  SELECT name FROM sqlite_master 
  WHERE type='table' AND name LIKE 'place%' 
  ORDER BY name
`).all();

console.log('Place-related tables:', tables.map(r => r.name).join(', '));

// Get counts
const counts = {
  places: db.prepare('SELECT COUNT(*) as c FROM places').get().c,
  place_names: db.prepare('SELECT COUNT(*) as c FROM place_names').get().c,
  place_hierarchy: db.prepare('SELECT COUNT(*) as c FROM place_hierarchy').get().c,
  place_attributes: db.prepare('SELECT COUNT(*) as c FROM place_attributes').get().c,
};

console.log('\nTable counts:');
for (const [table, count] of Object.entries(counts)) {
  console.log(`  ${table}: ${count.toLocaleString()}`);
}

// Check indexes on place_names
const indexes = db.prepare(`
  SELECT name, sql FROM sqlite_master 
  WHERE type='index' AND tbl_name='place_names'
  ORDER BY name
`).all();

console.log('\nIndexes on place_names:');
for (const idx of indexes) {
  console.log(`  ${idx.name}`);
}

db.close();
