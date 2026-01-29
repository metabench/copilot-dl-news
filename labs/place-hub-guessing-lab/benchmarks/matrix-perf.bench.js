'use strict';

/**
 * Performance benchmark for Place Hub Guessing Matrix queries.
 * Identifies bottlenecks and measures query timing.
 */

const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.resolve(__dirname, '../../../data/news.db');
const db = Database(dbPath, { readonly: true });

// Import the queries module
const {
  buildMatrixModel,
  selectPlaces,
  selectHosts,
  getHostPageCountMap
} = require('../../../src/db/sqlite/v1/queries/placeHubGuessingUiQueries');

function benchmark(name, fn, iterations = 10) {
  // Warmup
  fn();
  
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  
  times.sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const p50 = times[Math.floor(times.length * 0.5)];
  const p95 = times[Math.floor(times.length * 0.95)];
  const min = times[0];
  const max = times[times.length - 1];
  
  return {
    name,
    iterations,
    avg: avg.toFixed(2),
    p50: p50.toFixed(2),
    p95: p95.toFixed(2),
    min: min.toFixed(2),
    max: max.toFixed(2)
  };
}

console.log('=== Place Hub Guessing Matrix Performance Benchmark ===\n');

// Benchmark individual queries
const benchmarks = [];

// 1. selectPlaces for countries
benchmarks.push(benchmark('selectPlaces(country, limit=300)', () => {
  selectPlaces(db, { placeKind: 'country', placeLimit: 300 });
}));

// 2. selectPlaces for cities (more expensive due to population sorting)
benchmarks.push(benchmark('selectPlaces(city, limit=200)', () => {
  selectPlaces(db, { placeKind: 'city', placeLimit: 200 });
}));

// 3. selectHosts
benchmarks.push(benchmark('selectHosts(country-hub, limit=30)', () => {
  selectHosts(db, { pageKind: 'country-hub', hostLimit: 30 });
}));

// 4. getHostPageCountMap
const hosts = selectHosts(db, { pageKind: 'country-hub', hostLimit: 30 });
benchmarks.push(benchmark(`getHostPageCountMap(${hosts.length} hosts)`, () => {
  getHostPageCountMap(db, hosts, 500);
}));

// 5. Full buildMatrixModel
benchmarks.push(benchmark('buildMatrixModel(country, 200 places, 30 hosts)', () => {
  buildMatrixModel(db, {
    placeKind: 'country',
    pageKind: 'country-hub',
    placeLimit: 200,
    hostLimit: 30
  });
}));

// 6. buildMatrixModel for cities
benchmarks.push(benchmark('buildMatrixModel(city, 200 places, 30 hosts)', () => {
  buildMatrixModel(db, {
    placeKind: 'city',
    pageKind: 'city-hub',
    placeLimit: 200,
    hostLimit: 30
  });
}));

// Print results
console.log('Benchmark Results (all times in milliseconds):\n');
console.log('| Query | Avg | P50 | P95 | Min | Max |');
console.log('|-------|-----|-----|-----|-----|-----|');
for (const b of benchmarks) {
  console.log(`| ${b.name} | ${b.avg} | ${b.p50} | ${b.p95} | ${b.min} | ${b.max} |`);
}

// Analyze the EXPLAIN QUERY PLAN for slowest queries
console.log('\n\n=== Query Plan Analysis ===\n');

// Check if selectPlaces uses an index
console.log('1. selectPlaces query plan:');
const placesQueryPlan = db.prepare(`
  EXPLAIN QUERY PLAN
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
  WHERE p.kind = 'country'
    AND COALESCE(p.status, 'current') = 'current'
  ORDER BY place_name ASC
  LIMIT 300
`).all();
for (const row of placesQueryPlan) {
  console.log(`  ${row.detail}`);
}

// Check getHostPageCountMap query plan
console.log('\n2. getHostPageCountMap query plan (joins http_responses + urls):');
const hostCountPlan = db.prepare(`
  EXPLAIN QUERY PLAN
  SELECT 
    u.host,
    COUNT(*) AS page_count,
    SUM(CASE WHEN hr.http_status = 200 THEN 1 ELSE 0 END) AS successful_pages
  FROM http_responses hr
  JOIN urls u ON u.id = hr.url_id
  WHERE u.host IN ('theguardian.com', 'www.theguardian.com')
  GROUP BY u.host
`).all();
for (const row of hostCountPlan) {
  console.log(`  ${row.detail}`);
}

// Check urls and http_responses indexes
console.log('\n3. urls table indexes:');
const urlIndexes = db.prepare(`SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='urls'`).all();
for (const idx of urlIndexes) {
  console.log(`  ${idx.name}: ${idx.sql || '[auto]'}`);
}

console.log('\n4. http_responses table indexes:');
const hrIndexes = db.prepare(`SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='http_responses'`).all();
for (const idx of hrIndexes) {
  console.log(`  ${idx.name}: ${idx.sql || '[auto]'}`);
}

db.close();
console.log('\nBenchmark complete.');
