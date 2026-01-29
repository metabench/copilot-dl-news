'use strict';

/**
 * Analyze and optimize selectPlaces query performance
 */

const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.resolve(__dirname, '../../../data/news.db');
const db = Database(dbPath, { readonly: true });

console.log('=== selectPlaces Query Optimization ===\n');

function benchmark(name, fn, iterations = 20) {
  fn(); // warmup
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  return { name, avg: avg.toFixed(2), min: times[0].toFixed(2) };
}

// Current query with correlated subquery
const currentQuery = `
  SELECT
    p.id AS place_id,
    p.kind AS place_kind,
    p.country_code,
    p.population,
    COALESCE(
      pn.name,
      (
        SELECT pn2.name
        FROM place_names pn2
        WHERE pn2.place_id = p.id
        ORDER BY COALESCE(pn2.is_preferred, 0) DESC, COALESCE(pn2.is_official, 0) DESC, pn2.id ASC
        LIMIT 1
      ),
      p.country_code,
      CAST(p.id AS TEXT)
    ) AS place_name
  FROM places p
  LEFT JOIN place_names pn ON pn.id = p.canonical_name_id
  WHERE p.kind = 'city'
    AND COALESCE(p.status, 'current') = 'current'
  ORDER BY p.population DESC NULLS LAST, place_name ASC
  LIMIT 200
`;

// Optimized: Skip subquery when canonical_name_id is available (99.7% of cases)
const optimizedQuery = `
  SELECT
    p.id AS place_id,
    p.kind AS place_kind,
    p.country_code,
    p.population,
    COALESCE(pn.name, p.country_code, CAST(p.id AS TEXT)) AS place_name
  FROM places p
  LEFT JOIN place_names pn ON pn.id = p.canonical_name_id
  WHERE p.kind = 'city'
    AND COALESCE(p.status, 'current') = 'current'
  ORDER BY p.population DESC NULLS LAST
  LIMIT 200
`;

// Even more optimized: Use status index directly
const optimizedV2Query = `
  SELECT
    p.id AS place_id,
    p.kind AS place_kind,
    p.country_code,
    p.population,
    COALESCE(pn.name, p.country_code, CAST(p.id AS TEXT)) AS place_name
  FROM places p
  LEFT JOIN place_names pn ON pn.id = p.canonical_name_id
  WHERE p.kind = 'city'
    AND p.status = 'current'
  ORDER BY p.population DESC NULLS LAST
  LIMIT 200
`;

// Use covering index
const coveringIndexQuery = `
  SELECT
    p.id AS place_id,
    p.kind AS place_kind,
    p.country_code,
    p.population,
    pn.name AS place_name
  FROM places p
  INNER JOIN place_names pn ON pn.id = p.canonical_name_id
  WHERE p.kind = 'city'
    AND p.status = 'current'
  ORDER BY p.population DESC
  LIMIT 200
`;

const results = [];

results.push(benchmark('Current (with correlated subquery)', () => {
  db.prepare(currentQuery).all();
}));

results.push(benchmark('Optimized (no subquery, LEFT JOIN)', () => {
  db.prepare(optimizedQuery).all();
}));

results.push(benchmark('Optimized v2 (direct status check)', () => {
  db.prepare(optimizedV2Query).all();
}));

results.push(benchmark('Covering index (INNER JOIN)', () => {
  db.prepare(coveringIndexQuery).all();
}));

console.log('| Query Variant | Avg (ms) | Min (ms) |');
console.log('|---------------|----------|----------|');
for (const r of results) {
  console.log(`| ${r.name} | ${r.avg} | ${r.min} |`);
}

// Verify result counts
console.log('\n=== Row Counts ===');
console.log('Current:', db.prepare(currentQuery).all().length);
console.log('Optimized:', db.prepare(optimizedQuery).all().length);
console.log('Optimized v2:', db.prepare(optimizedV2Query).all().length);
console.log('Covering index:', db.prepare(coveringIndexQuery).all().length);

// Check query plans
console.log('\n=== Query Plans ===\n');

console.log('Current query plan:');
for (const row of db.prepare('EXPLAIN QUERY PLAN ' + currentQuery).all()) {
  console.log('  ', row.detail);
}

console.log('\nOptimized v2 query plan:');
for (const row of db.prepare('EXPLAIN QUERY PLAN ' + optimizedV2Query).all()) {
  console.log('  ', row.detail);
}

console.log('\nCovering index query plan:');
for (const row of db.prepare('EXPLAIN QUERY PLAN ' + coveringIndexQuery).all()) {
  console.log('  ', row.detail);
}

db.close();
