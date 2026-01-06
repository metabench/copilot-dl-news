#!/usr/bin/env node
/**
 * Quick benchmark test
 */
const path = require('path');
const { ensureDatabase } = require('../../../src/db/sqlite');

const dbPath = path.join(__dirname, '../../../data/news.db');
const db = ensureDatabase(dbPath);

console.log('Starting benchmark...');

const TEST_NAMES = ['London', 'Paris', 'Berlin', 'Moscow', 'Sydney'];
const ITERATIONS = 20;

// Prepare statement
const stmt = db.prepare(`
  SELECT p.id, p.kind, p.country_code, pn.name
  FROM place_names pn
  JOIN places p ON pn.place_id = p.id
  WHERE pn.name = ?
  ORDER BY p.population DESC NULLS LAST
  LIMIT 20
`);

// Benchmark single lookups
console.log('Running single lookups...');
const start1 = Date.now();
for (let i = 0; i < ITERATIONS; i++) {
  for (const name of TEST_NAMES) {
    stmt.all(name);
  }
}
const duration1 = Date.now() - start1;
console.log(`Single lookups: ${duration1}ms for ${ITERATIONS * TEST_NAMES.length} queries`);
console.log(`  = ${((ITERATIONS * TEST_NAMES.length) / duration1 * 1000).toFixed(0)} queries/sec`);

// Benchmark batch lookups
console.log('Running batch lookups...');
const placeholders = TEST_NAMES.map(() => '?').join(',');
const batchStmt = db.prepare(`
  SELECT p.id, p.kind, p.country_code, pn.name
  FROM place_names pn
  JOIN places p ON pn.place_id = p.id
  WHERE pn.name IN (${placeholders})
  ORDER BY p.population DESC NULLS LAST
`);

const start2 = Date.now();
for (let i = 0; i < ITERATIONS; i++) {
  batchStmt.all(...TEST_NAMES);
}
const duration2 = Date.now() - start2;
console.log(`Batch lookups: ${duration2}ms for ${ITERATIONS} batch queries`);
console.log(`  = ${(ITERATIONS / duration2 * 1000).toFixed(0)} batches/sec`);

// Print speedup
console.log(`\nBatch is ${(duration1 / duration2).toFixed(1)}x faster per iteration`);

db.close();
console.log('Done.');
