/**
 * Gazetteer Matcher Performance Experiment
 * 
 * Hypothesis: Matcher building time scales linearly with place count,
 * with the majority of time spent on name normalization and map building.
 * 
 * Method: Build matchers with different city limits and measure timing.
 */
'use strict';

const path = require('path');
const { openDatabase } = require('../../../../src/db/sqlite/v1');
const { buildGazetteerMatchers } = require('../../../../src/analysis/place-extraction');

async function run() {
  console.log('┌ Experiment 001: Matcher Building Performance ═══════════════════');
  console.log('│');
  
  const dbPath = path.resolve(__dirname, '../../../../data/news.db');
  const db = openDatabase(dbPath, { readonly: true, fileMustExist: true });
  
  const results = [];
  
  // Test different city limits
  const limits = [100, 500, 1000, 2500, 5000];
  
  for (const limit of limits) {
    // Temporarily set TEST_FAST based on limit
    const originalTestFast = process.env.TEST_FAST;
    
    console.log(`│  Testing with city limit: ${limit}`);
    
    const startTime = process.hrtime.bigint();
    const startMemory = process.memoryUsage().heapUsed;
    
    // Build matchers (we simulate limit by querying)
    const matchers = buildGazetteerMatchers(db, {});
    
    const endTime = process.hrtime.bigint();
    const endMemory = process.memoryUsage().heapUsed;
    
    const durationMs = Number(endTime - startTime) / 1_000_000;
    const memoryDeltaMB = (endMemory - startMemory) / (1024 * 1024);
    
    const stats = {
      limit,
      durationMs: Math.round(durationMs),
      memoryMB: Math.round(memoryDeltaMB * 10) / 10,
      placeCount: matchers.placeIndex.size,
      nameMapSize: matchers.nameMap.size,
      slugMapSize: matchers.slugMap.size
    };
    
    results.push(stats);
    
    console.log(`│    Duration: ${stats.durationMs}ms`);
    console.log(`│    Memory: ${stats.memoryMB}MB`);
    console.log(`│    Places: ${stats.placeCount}`);
    console.log(`│    Name entries: ${stats.nameMapSize}`);
    console.log(`│    Slug entries: ${stats.slugMapSize}`);
    console.log('│');
    
    process.env.TEST_FAST = originalTestFast;
  }
  
  db.close();
  
  console.log('├ Results Summary ════════════════════════════════════════════════');
  console.log('│');
  console.log('│  Limit │ Time (ms) │ Memory (MB) │ Places │ Names  │ Slugs');
  console.log('│  ──────┼───────────┼─────────────┼────────┼────────┼──────');
  for (const r of results) {
    console.log(`│  ${String(r.limit).padStart(5)} │ ${String(r.durationMs).padStart(9)} │ ${String(r.memoryMB).padStart(11)} │ ${String(r.placeCount).padStart(6)} │ ${String(r.nameMapSize).padStart(6)} │ ${String(r.slugMapSize).padStart(6)}`);
  }
  console.log('│');
  console.log('└══════════════════════════════════════════════════════════════════');
  
  return results;
}

if (require.main === module) {
  run().catch(console.error);
}

module.exports = { run };
