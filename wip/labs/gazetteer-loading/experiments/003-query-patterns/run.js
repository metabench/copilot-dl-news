/**
 * Query Patterns Experiment
 * 
 * Hypothesis: In-memory lookups are 100x+ faster than database queries,
 * but database queries provide more flexible filtering.
 * 
 * Method: Compare in-memory vs DB-backed place lookups across various patterns.
 */
'use strict';

const path = require('path');
const { openDatabase } = require('../../../../src/db/sqlite/v1');
const { buildGazetteerMatchers, extractGazetteerPlacesFromText } = require('../../../../src/analysis/place-extraction');
const { searchPlacesByName } = require('../../../../src/db/sqlite/v1/queries/gazetteer.search');

// Test queries
const TEST_QUERIES = [
  'London',
  'New York',
  'Tokyo',
  'São Paulo',
  'Moscow',
  'Beijing',
  'Cairo',
  'paris',          // lowercase
  'BERLIN',         // uppercase
  'los angeles',    // multi-word
  'hong kong',      // multi-word
  'st. petersburg', // with punctuation
  'münchen',        // with diacritics
  'xyz123'          // no match
];

const TEST_TEXTS = [
  'The meeting was held in London yesterday.',
  'Officials from Tokyo and Beijing met in New York.',
  'The company has offices in Paris, Berlin, and Moscow.',
  'Weather in Los Angeles remains sunny while Hong Kong experiences rain.',
  'A delegation from São Paulo visited Cairo last week.'
];

function benchmarkFunction(fn, iterations = 100) {
  const times = [];
  
  // Warm up
  for (let i = 0; i < 5; i++) {
    fn();
  }
  
  // Measure
  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    fn();
    const end = process.hrtime.bigint();
    times.push(Number(end - start) / 1000); // microseconds
  }
  
  times.sort((a, b) => a - b);
  
  return {
    min: Math.round(times[0]),
    p50: Math.round(times[Math.floor(times.length * 0.5)]),
    p95: Math.round(times[Math.floor(times.length * 0.95)]),
    max: Math.round(times[times.length - 1]),
    avg: Math.round(times.reduce((a, b) => a + b, 0) / times.length)
  };
}

async function run() {
  console.log('┌ Experiment 003: Query Patterns ═══════════════════════════════════');
  console.log('│');
  
  const dbPath = path.resolve(__dirname, '../../../../data/news.db');
  const db = openDatabase(dbPath, { readonly: true, fileMustExist: true });
  
  // Build matchers
  console.log('│  Building in-memory matchers...');
  const matcherStart = Date.now();
  const matchers = buildGazetteerMatchers(db);
  console.log(`│  Built in ${Date.now() - matcherStart}ms (${matchers.placeIndex.size} places)`);
  console.log('│');
  
  // Benchmark 1: Single name lookups
  console.log('├ Benchmark 1: Single Name Lookups ═══════════════════════════════');
  console.log('│');
  console.log('│  Query         │ In-Memory (µs) │ Database (µs) │ Speedup');
  console.log('│  ──────────────┼────────────────┼───────────────┼─────────');
  
  const lookupResults = [];
  
  for (const query of TEST_QUERIES) {
    const normalized = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    
    // In-memory lookup
    const memoryStats = benchmarkFunction(() => {
      return matchers.nameMap.get(normalized) || [];
    }, 1000);
    
    // Database lookup
    const dbStats = benchmarkFunction(() => {
      return searchPlacesByName(db, query, { limit: 10 });
    }, 100);
    
    const speedup = Math.round(dbStats.avg / memoryStats.avg);
    
    lookupResults.push({
      query,
      memoryAvg: memoryStats.avg,
      dbAvg: dbStats.avg,
      speedup
    });
    
    const displayQuery = query.length > 12 ? query.slice(0, 11) + '…' : query.padEnd(12);
    console.log(`│  ${displayQuery} │ ${String(memoryStats.avg).padStart(14)} │ ${String(dbStats.avg).padStart(13)} │ ${speedup}x`);
  }
  
  console.log('│');
  
  // Benchmark 2: Text extraction
  console.log('├ Benchmark 2: Text Extraction ═══════════════════════════════════');
  console.log('│');
  console.log('│  Text (words) │ In-Memory (µs) │ Places Found');
  console.log('│  ─────────────┼────────────────┼──────────────');
  
  const extractResults = [];
  
  for (const text of TEST_TEXTS) {
    const wordCount = text.split(/\s+/).length;
    
    const extractStats = benchmarkFunction(() => {
      return extractGazetteerPlacesFromText(text, matchers, {}, false);
    }, 500);
    
    // Get place count from a single run
    const places = extractGazetteerPlacesFromText(text, matchers, {}, false);
    
    extractResults.push({
      wordCount,
      avgMicros: extractStats.avg,
      placeCount: places.length
    });
    
    console.log(`│  ${String(wordCount).padStart(13)} │ ${String(extractStats.avg).padStart(14)} │ ${places.length}`);
  }
  
  console.log('│');
  
  // Summary
  console.log('├ Summary ════════════════════════════════════════════════════════');
  console.log('│');
  
  const avgMemoryLookup = Math.round(lookupResults.reduce((sum, r) => sum + r.memoryAvg, 0) / lookupResults.length);
  const avgDbLookup = Math.round(lookupResults.reduce((sum, r) => sum + r.dbAvg, 0) / lookupResults.length);
  const avgSpeedup = Math.round(avgDbLookup / avgMemoryLookup);
  
  console.log(`│  Average in-memory lookup: ${avgMemoryLookup}µs`);
  console.log(`│  Average database lookup: ${avgDbLookup}µs`);
  console.log(`│  Average speedup: ${avgSpeedup}x`);
  console.log('│');
  
  const avgExtraction = Math.round(extractResults.reduce((sum, r) => sum + r.avgMicros, 0) / extractResults.length);
  const avgWords = Math.round(extractResults.reduce((sum, r) => sum + r.wordCount, 0) / extractResults.length);
  
  console.log(`│  Average text extraction: ${avgExtraction}µs for ~${avgWords} words`);
  console.log(`│  Throughput: ~${Math.round(1_000_000 / avgExtraction)} extractions/sec`);
  console.log('│');
  console.log('└══════════════════════════════════════════════════════════════════');
  
  db.close();
  
  return {
    lookupResults,
    extractResults,
    summary: {
      avgMemoryLookup,
      avgDbLookup,
      avgSpeedup,
      avgExtraction
    }
  };
}

if (require.main === module) {
  run().catch(console.error);
}

module.exports = { run };
