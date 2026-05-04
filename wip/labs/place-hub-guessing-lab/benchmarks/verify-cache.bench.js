'use strict';

/**
 * Verify that the caching optimization works correctly.
 */

const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.resolve(__dirname, '../../../data/news.db');
const db = Database(dbPath, { readonly: true });

const {
  buildMatrixModel,
  getHostPageCountMap,
  clearHostPageCountCache,
  getHostPageCountCacheStats,
  selectHosts
} = require('../../../src/db/sqlite/v1/queries/placeHubGuessingUiQueries');

function benchmark(name, fn, iterations = 10) {
  fn(); // warmup
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return {
    name,
    avg: (times.reduce((a, b) => a + b, 0) / times.length).toFixed(2),
    p50: times[Math.floor(times.length * 0.5)].toFixed(2),
    min: times[0].toFixed(2)
  };
}

console.log('=== Host Page Count Cache Verification ===\n');

// Clear cache first
clearHostPageCountCache();
console.log('Cache cleared. Stats:', getHostPageCountCacheStats());

// Get hosts for testing
const hosts = selectHosts(db, { pageKind: 'country-hub', hostLimit: 30 });
console.log(`Testing with ${hosts.length} hosts\n`);

// First call - cache MISS (should be slow ~40ms)
console.log('1. First call (cache MISS):');
const start1 = performance.now();
const result1 = getHostPageCountMap(db, hosts, 500);
const time1 = performance.now() - start1;
console.log(`   Time: ${time1.toFixed(2)}ms`);
console.log(`   Results: ${result1.size} hosts`);
console.log(`   Cache stats: ${JSON.stringify(getHostPageCountCacheStats())}`);

// Second call - cache HIT (should be fast <1ms)
console.log('\n2. Second call (cache HIT):');
const start2 = performance.now();
const result2 = getHostPageCountMap(db, hosts, 500);
const time2 = performance.now() - start2;
console.log(`   Time: ${time2.toFixed(2)}ms`);
console.log(`   Results: ${result2.size} hosts`);
console.log(`   Cache stats: ${JSON.stringify(getHostPageCountCacheStats())}`);

// Verify data consistency
let dataMatch = true;
for (const [host, data1] of result1) {
  const data2 = result2.get(host);
  if (!data2 || data1.page_count !== data2.page_count) {
    dataMatch = false;
    console.log(`   MISMATCH: ${host}`);
  }
}
console.log(`   Data consistency: ${dataMatch ? '✓ PASS' : '✗ FAIL'}`);

// Full matrix model benchmark
console.log('\n=== Full Matrix Model Benchmark ===\n');

// Clear cache and benchmark cold
clearHostPageCountCache();
const results = [];

results.push(benchmark('buildMatrixModel (cold cache)', () => {
  clearHostPageCountCache();
  buildMatrixModel(db, {
    placeKind: 'country',
    pageKind: 'country-hub',
    placeLimit: 200,
    hostLimit: 30
  });
}));

// Don't clear cache - benchmark warm
results.push(benchmark('buildMatrixModel (warm cache)', () => {
  buildMatrixModel(db, {
    placeKind: 'country',
    pageKind: 'country-hub',
    placeLimit: 200,
    hostLimit: 30
  });
}));

console.log('| Query | Avg (ms) | P50 (ms) | Min (ms) |');
console.log('|-------|----------|----------|----------|');
for (const r of results) {
  console.log(`| ${r.name} | ${r.avg} | ${r.p50} | ${r.min} |`);
}

// Calculate improvement
const coldAvg = parseFloat(results[0].avg);
const warmAvg = parseFloat(results[1].avg);
const improvement = ((coldAvg - warmAvg) / coldAvg * 100).toFixed(1);
console.log(`\n✓ Cache improvement: ${improvement}% faster (${coldAvg.toFixed(1)}ms → ${warmAvg.toFixed(1)}ms)`);

db.close();
console.log('\nBenchmark complete.');
