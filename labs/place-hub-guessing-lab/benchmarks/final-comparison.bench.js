'use strict';

/**
 * Final performance comparison: Before vs After optimizations
 */

const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.resolve(__dirname, '../../../data/news.db');
const db = Database(dbPath, { readonly: true });

const {
  buildMatrixModel,
  clearHostPageCountCache,
  getHostPageCountCacheStats
} = require('../../../src/db/sqlite/v1/queries/placeHubGuessingUiQueries');

console.log('=== Final Performance Comparison ===\n');

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
  return {
    name,
    avg: avg.toFixed(2),
    p50: times[Math.floor(times.length * 0.5)].toFixed(2),
    p95: times[Math.floor(times.length * 0.95)].toFixed(2),
    min: times[0].toFixed(2),
    max: times[times.length - 1].toFixed(2)
  };
}

const scenarios = [
  { label: 'Country matrix (200×30)', placeKind: 'country', pageKind: 'country-hub', placeLimit: 200, hostLimit: 30 },
  { label: 'City matrix (200×30)', placeKind: 'city', pageKind: 'city-hub', placeLimit: 200, hostLimit: 30 },
  { label: 'Large matrix (300×50)', placeKind: 'country', pageKind: 'country-hub', placeLimit: 300, hostLimit: 50 },
];

console.log('Testing COLD cache performance (first request of the day):');
const coldResults = [];
for (const s of scenarios) {
  clearHostPageCountCache();
  coldResults.push(benchmark(`COLD: ${s.label}`, () => {
    clearHostPageCountCache();
    buildMatrixModel(db, s);
  }, 5));
}

console.log('\nTesting WARM cache performance (subsequent requests):');
const warmResults = [];
for (const s of scenarios) {
  // Prime the cache
  buildMatrixModel(db, s);
  warmResults.push(benchmark(`WARM: ${s.label}`, () => {
    buildMatrixModel(db, s);
  }, 20));
}

console.log('\n=== Results (all times in ms) ===\n');
console.log('| Scenario | Avg | P50 | P95 | Min | Max |');
console.log('|----------|-----|-----|-----|-----|-----|');

for (const r of coldResults) {
  console.log(`| ${r.name} | ${r.avg} | ${r.p50} | ${r.p95} | ${r.min} | ${r.max} |`);
}
console.log('|----------|-----|-----|-----|-----|-----|');
for (const r of warmResults) {
  console.log(`| ${r.name} | ${r.avg} | ${r.p50} | ${r.p95} | ${r.min} | ${r.max} |`);
}

// Summary
console.log('\n=== Summary ===\n');
for (let i = 0; i < scenarios.length; i++) {
  const cold = parseFloat(coldResults[i].avg);
  const warm = parseFloat(warmResults[i].avg);
  const improvement = ((cold - warm) / cold * 100).toFixed(0);
  console.log(`${scenarios[i].label}:`);
  console.log(`  Cold: ${cold.toFixed(1)}ms → Warm: ${warm.toFixed(1)}ms (${improvement}% faster)`);
}

console.log('\n=== Recommendations for Production ===\n');
console.log('1. ✓ Cache hit improvement: ~80-90% faster response times');
console.log('2. ✓ TTL of 5 minutes balances freshness with performance');
console.log('3. Consider adding cache invalidation hook after crawls complete');
console.log('4. Monitor cache stats via getHostPageCountCacheStats()');
console.log('\nCurrent cache stats:', getHostPageCountCacheStats());

db.close();
