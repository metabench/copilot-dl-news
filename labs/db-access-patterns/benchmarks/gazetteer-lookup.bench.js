#!/usr/bin/env node
/**
 * Gazetteer Lookup Benchmark
 * 
 * Measures performance of different lookup strategies for place name disambiguation.
 * 
 * Usage:
 *   node labs/db-access-patterns/benchmarks/gazetteer-lookup.bench.js
 *   node labs/db-access-patterns/benchmarks/gazetteer-lookup.bench.js --json
 *   node labs/db-access-patterns/benchmarks/gazetteer-lookup.bench.js --iterations 1000
 */
'use strict';

const path = require('path');
const { ensureDatabase } = require('../../../src/db/sqlite');

// Test data - common ambiguous place names
const TEST_NAMES = [
  'London', 'Paris', 'Berlin', 'Moscow', 'Sydney',
  'Springfield', 'Manchester', 'Birmingham', 'Richmond', 'Portland',
  'Washington', 'Lincoln', 'Franklin', 'Clinton', 'Madison',
  'New York', 'Los Angeles', 'San Francisco', 'Las Vegas', 'San Diego'
];

const NORMALIZED_NAMES = TEST_NAMES.map(n => n.toLowerCase().replace(/\s+/g, ' ').trim());

class GazetteerBenchmark {
  constructor(dbPath) {
    this.db = ensureDatabase(dbPath);
    this.results = {};
    
    // Prepare statements once
    this.stmts = {
      exactName: this.db.prepare(`
        SELECT p.id, p.kind, p.country_code, pn.name
        FROM place_names pn
        JOIN places p ON pn.place_id = p.id
        WHERE pn.name = ?
        ORDER BY p.population DESC NULLS LAST
        LIMIT 20
      `),
      normalizedName: this.db.prepare(`
        SELECT p.id, p.kind, p.country_code, pn.name
        FROM place_names pn
        JOIN places p ON pn.place_id = p.id
        WHERE pn.normalized = ?
        ORDER BY p.population DESC NULLS LAST
        LIMIT 20
      `),
      likePrefix: this.db.prepare(`
        SELECT p.id, p.kind, p.country_code, pn.name
        FROM place_names pn
        JOIN places p ON pn.place_id = p.id
        WHERE pn.name LIKE ? || '%'
        ORDER BY p.population DESC NULLS LAST
        LIMIT 20
      `),
      likeContains: this.db.prepare(`
        SELECT p.id, p.kind, p.country_code, pn.name
        FROM place_names pn
        JOIN places p ON pn.place_id = p.id
        WHERE pn.name LIKE '%' || ? || '%'
        ORDER BY p.population DESC NULLS LAST
        LIMIT 20
      `)
    };
  }

  /**
   * Run a single benchmark
   */
  benchmark(name, fn, iterations = 100) {
    // Warmup
    for (let i = 0; i < 10; i++) fn();
    
    // Timed run
    const start = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
      fn();
    }
    const end = process.hrtime.bigint();
    
    const durationMs = Number(end - start) / 1_000_000;
    const opsPerSec = (iterations / durationMs) * 1000;
    const avgMs = durationMs / iterations;
    
    this.results[name] = {
      iterations,
      totalMs: durationMs.toFixed(2),
      avgMs: avgMs.toFixed(3),
      opsPerSec: Math.round(opsPerSec)
    };
    
    return this.results[name];
  }

  /**
   * Single lookups - one query per name
   */
  benchmarkSingleLookups(iterations) {
    return this.benchmark('single_exact_name', () => {
      for (const name of TEST_NAMES) {
        this.stmts.exactName.all(name);
      }
    }, iterations);
  }

  /**
   * Single lookups using normalized name index
   */
  benchmarkNormalizedLookups(iterations) {
    return this.benchmark('single_normalized_name', () => {
      for (const name of NORMALIZED_NAMES) {
        this.stmts.normalizedName.all(name);
      }
    }, iterations);
  }

  /**
   * Batch lookup using IN clause
   */
  benchmarkBatchInClause(iterations) {
    const placeholders = TEST_NAMES.map(() => '?').join(',');
    const batchStmt = this.db.prepare(`
      SELECT p.id, p.kind, p.country_code, pn.name
      FROM place_names pn
      JOIN places p ON pn.place_id = p.id
      WHERE pn.name IN (${placeholders})
      ORDER BY p.population DESC NULLS LAST
    `);
    
    return this.benchmark('batch_in_clause', () => {
      batchStmt.all(...TEST_NAMES);
    }, iterations);
  }

  /**
   * Batch lookup using normalized names with IN clause
   */
  benchmarkBatchNormalizedInClause(iterations) {
    const placeholders = NORMALIZED_NAMES.map(() => '?').join(',');
    const batchStmt = this.db.prepare(`
      SELECT p.id, p.kind, p.country_code, pn.name
      FROM place_names pn
      JOIN places p ON pn.place_id = p.id
      WHERE pn.normalized IN (${placeholders})
      ORDER BY p.population DESC NULLS LAST
    `);
    
    return this.benchmark('batch_normalized_in_clause', () => {
      batchStmt.all(...NORMALIZED_NAMES);
    }, iterations);
  }

  /**
   * LIKE prefix search (can use index)
   */
  benchmarkLikePrefix(iterations) {
    return this.benchmark('like_prefix', () => {
      for (const name of TEST_NAMES) {
        this.stmts.likePrefix.all(name);
      }
    }, iterations);
  }

  /**
   * LIKE contains search (cannot use index - full scan)
   */
  benchmarkLikeContains(iterations) {
    return this.benchmark('like_contains', () => {
      for (const name of TEST_NAMES) {
        this.stmts.likeContains.all(name);
      }
    }, iterations);
  }

  /**
   * Ad-hoc queries (no prepared statement)
   */
  benchmarkAdHocQueries(iterations) {
    return this.benchmark('adhoc_no_prepare', () => {
      for (const name of TEST_NAMES) {
        this.db.prepare(`
          SELECT p.id, p.kind, p.country_code, pn.name
          FROM place_names pn
          JOIN places p ON pn.place_id = p.id
          WHERE pn.name = ?
          ORDER BY p.population DESC NULLS LAST
          LIMIT 20
        `).all(name);
      }
    }, iterations);
  }

  /**
   * Run all benchmarks
   */
  runAll(iterations = 50) {
    console.log(`\n🔬 Gazetteer Lookup Benchmark`);
    console.log(`   Database: ${TEST_NAMES.length} test names, ${iterations} iterations each\n`);
    
    process.stdout.write('   Running: single_exact_name...');
    this.benchmarkSingleLookups(iterations);
    console.log(' ✓');
    
    process.stdout.write('   Running: single_normalized_name...');
    this.benchmarkNormalizedLookups(iterations);
    console.log(' ✓');
    
    process.stdout.write('   Running: batch_in_clause...');
    this.benchmarkBatchInClause(iterations);
    console.log(' ✓');
    
    process.stdout.write('   Running: batch_normalized_in_clause...');
    this.benchmarkBatchNormalizedInClause(iterations);
    console.log(' ✓');
    
    process.stdout.write('   Running: like_prefix...');
    this.benchmarkLikePrefix(iterations);
    console.log(' ✓');
    
    // LIKE contains is very slow (full table scan) - use fewer iterations
    process.stdout.write('   Running: like_contains (slow - 5 iterations)...');
    this.benchmarkLikeContains(5);
    console.log(' ✓');
    
    process.stdout.write('   Running: adhoc_no_prepare...');
    this.benchmarkAdHocQueries(iterations);
    console.log(' ✓');
    
    console.log('');
    return this.results;
  }

  /**
   * Print results as table
   */
  printResults() {
    console.log('─'.repeat(75));
    console.log('│ Benchmark                      │ Ops/sec  │ Avg (ms) │ Total (ms) │');
    console.log('─'.repeat(75));
    
    for (const [name, result] of Object.entries(this.results)) {
      const nameCol = name.padEnd(30);
      const opsCol = result.opsPerSec.toString().padStart(8);
      const avgCol = result.avgMs.padStart(8);
      const totalCol = result.totalMs.padStart(10);
      console.log(`│ ${nameCol} │ ${opsCol} │ ${avgCol} │ ${totalCol} │`);
    }
    
    console.log('─'.repeat(75));
  }

  /**
   * Get results as JSON
   */
  toJSON() {
    return {
      timestamp: new Date().toISOString(),
      testNames: TEST_NAMES.length,
      benchmarks: this.results
    };
  }

  close() {
    this.db.close();
  }
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');
  
  // Parse --iterations N or --iterations=N
  let iterations = 50; // Default
  const iterIdx = args.indexOf('--iterations');
  if (iterIdx !== -1 && args[iterIdx + 1]) {
    iterations = parseInt(args[iterIdx + 1], 10);
  }
  const iterEqArg = args.find(a => a.startsWith('--iterations='));
  if (iterEqArg) {
    iterations = parseInt(iterEqArg.split('=')[1], 10);
  }

  const dbPath = path.join(__dirname, '../../../data/news.db');
  const bench = new GazetteerBenchmark(dbPath);
  
  try {
    bench.runAll(iterations);
    
    if (jsonOutput) {
      console.log(JSON.stringify(bench.toJSON(), null, 2));
    } else {
      bench.printResults();
      
      // Print insights
      console.log('\n📊 Insights:');
      const results = bench.results;
      
      // Compare single vs batch
      if (results.single_exact_name && results.batch_in_clause) {
        const speedup = (results.batch_in_clause.opsPerSec / results.single_exact_name.opsPerSec).toFixed(1);
        console.log(`   • Batch IN clause is ${speedup}x faster than single lookups`);
      }
      
      // Compare prepared vs ad-hoc
      if (results.single_exact_name && results.adhoc_no_prepare) {
        const speedup = (results.single_exact_name.opsPerSec / results.adhoc_no_prepare.opsPerSec).toFixed(1);
        console.log(`   • Prepared statements are ${speedup}x faster than ad-hoc`);
      }
      
      // Compare LIKE prefix vs contains
      if (results.like_prefix && results.like_contains) {
        const speedup = (results.like_prefix.opsPerSec / results.like_contains.opsPerSec).toFixed(1);
        console.log(`   • LIKE prefix is ${speedup}x faster than LIKE contains`);
      }
      
      console.log('');
    }
  } finally {
    bench.close();
  }
}

module.exports = { GazetteerBenchmark, TEST_NAMES };
