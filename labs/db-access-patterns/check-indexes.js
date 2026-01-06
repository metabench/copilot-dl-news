#!/usr/bin/env node
/**
 * Check indexes on place-related tables
 */

const path = require('path');
const { ensureDatabase } = require(path.join(__dirname, '../../src/db/sqlite'));

const db = ensureDatabase(path.join(__dirname, '../../data/news.db'), { readonly: true });

console.log('=== Indexes on place-related tables ===\n');

const indexes = db.prepare(`
  SELECT name, tbl_name, sql 
  FROM sqlite_master 
  WHERE type='index' AND tbl_name LIKE 'place%'
  ORDER BY tbl_name, name
`).all();

for (const idx of indexes) {
  console.log(`Table: ${idx.tbl_name}`);
  console.log(`  Index: ${idx.name}`);
  console.log(`  SQL: ${idx.sql || '(auto-generated for primary key)'}`);
  console.log();
}

console.log(`Total: ${indexes.length} indexes\n`);

// Check column details
console.log('=== Columns on place_names ===\n');
const cols = db.prepare(`PRAGMA table_info(place_names)`).all();
for (const col of cols) {
  console.log(`  ${col.name} (${col.type})${col.pk ? ' PK' : ''}${col.notnull ? ' NOT NULL' : ''}`);
}

console.log('\n=== Sample EXPLAIN for LIKE queries ===\n');

// Test LIKE prefix (can use index)
console.log('1. LIKE prefix (name LIKE "London%"):');
const plan1 = db.prepare(`EXPLAIN QUERY PLAN SELECT * FROM place_names WHERE name LIKE 'London%'`).all();
for (const step of plan1) {
  console.log(`   ${step.detail}`);
}

// Test LIKE contains (cannot use index)
console.log('\n2. LIKE contains (name LIKE "%London%"):');
const plan2 = db.prepare(`EXPLAIN QUERY PLAN SELECT * FROM place_names WHERE name LIKE '%London%'`).all();
for (const step of plan2) {
  console.log(`   ${step.detail}`);
}

// Test exact match on normalized
console.log('\n3. Exact match on normalized:');
const plan3 = db.prepare(`EXPLAIN QUERY PLAN SELECT * FROM place_names WHERE normalized = 'london'`).all();
for (const step of plan3) {
  console.log(`   ${step.detail}`);
}

// Test LIKE prefix on normalized
console.log('\n4. LIKE prefix on normalized (normalized LIKE "london%"):');
const plan4 = db.prepare(`EXPLAIN QUERY PLAN SELECT * FROM place_names WHERE normalized LIKE 'london%'`).all();
for (const step of plan4) {
  console.log(`   ${step.detail}`);
}

db.close();
