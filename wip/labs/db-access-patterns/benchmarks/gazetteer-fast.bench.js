#!/usr/bin/env node
/**
 * Gazetteer Lookup Benchmark - Fast Edition
 * 
 * Focuses on the patterns that matter most for disambiguation:
 * - Exact name lookup
 * - Normalized name lookup  
 * - Batch lookups
 * - Prepared vs ad-hoc statements
 * 
 * Skips full-table-scan patterns (LIKE %x%) that are always slow.
 * 
 * Usage:
 *   node labs/db-access-patterns/benchmarks/gazetteer-fast.bench.js
 *   node labs/db-access-patterns/benchmarks/gazetteer-fast.bench.js --json
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

class FastBenchmark {
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
      `)
    };
  }

  benchmark(name, fn, iterations = 50) {
    // Warmup
    for (let i = 0; i < 5; i++) fn();
    
    // Timed run
    const start = Date.now();
    for (let i = 0; i < iterations; i++) {
      fn();
    }
    const durationMs = Date.now() - start;
    
    const opsPerSec = Math.round((iterations / durationMs) * 1000);
    const avgMs = (durationMs / iterations).toFixed(3);
    
    this.results[name] = {
      iterations,
      totalMs: durationMs,
      avgMs,
      opsPerSec
    };
    
    return this.results[name];
  }

  runAll() {
    const ITERATIONS = 50;
    console.log('\n🔬 Gazetteer Lookup Benchmark (Fast Edition)');
    console.log(`   ${TEST_NAMES.length} test names × ${ITERATIONS} iterations\n`);
    
    // 1. Single lookups with prepared statement
    console.log('   [1/6] Single exact lookups (prepared)...');
    this.benchmark('single_exact_prepared', () => {
      for (const name of TEST_NAMES) {
        this.stmts.exactName.all(name);
      }
    }, ITERATIONS);
    
    // 2. Single lookups - ad hoc (no prepare)
    console.log('   [2/6] Single exact lookups (ad-hoc)...');
    this.benchmark('single_exact_adhoc', () => {
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
    }, ITERATIONS);
    
    // 3. Batch lookup with IN clause
    console.log('   [3/6] Batch lookup (IN clause)...');
    const placeholders = TEST_NAMES.map(() => '?').join(',');
    const batchStmt = this.db.prepare(`
      SELECT p.id, p.kind, p.country_code, pn.name
      FROM place_names pn
      JOIN places p ON pn.place_id = p.id
      WHERE pn.name IN (${placeholders})
      ORDER BY p.population DESC NULLS LAST
    `);
    this.benchmark('batch_in_clause', () => {
      batchStmt.all(...TEST_NAMES);
    }, ITERATIONS);
    
    // 4. Normalized name lookups
    console.log('   [4/6] Single normalized lookups...');
    this.benchmark('single_normalized', () => {
      for (const name of NORMALIZED_NAMES) {
        this.stmts.normalizedName.all(name);
      }
    }, ITERATIONS);
    
    // 5. Batch normalized
    console.log('   [5/6] Batch normalized (IN clause)...');
    const normPlaceholders = NORMALIZED_NAMES.map(() => '?').join(',');
    const batchNormStmt = this.db.prepare(`
      SELECT p.id, p.kind, p.country_code, pn.name
      FROM place_names pn
      JOIN places p ON pn.place_id = p.id
      WHERE pn.normalized IN (${normPlaceholders})
      ORDER BY p.population DESC NULLS LAST
    `);
    this.benchmark('batch_normalized', () => {
      batchNormStmt.all(...NORMALIZED_NAMES);
    }, ITERATIONS);
    
    // 6. Transaction batched inserts (simulate storing matches)
    console.log('   [6/6] Transaction batch writes...');
    // Create temp table
    this.db.exec(`CREATE TABLE IF NOT EXISTS _bench_temp (id INTEGER PRIMARY KEY, name TEXT)`);
    const insertStmt = this.db.prepare(`INSERT INTO _bench_temp (name) VALUES (?)`);
    const insertMany = this.db.transaction((names) => {
      for (const name of names) insertStmt.run(name);
    });
    const deleteStmt = this.db.prepare(`DELETE FROM _bench_temp`);
    
    this.benchmark('transaction_batch_write', () => {
      deleteStmt.run();
      insertMany(TEST_NAMES);
    }, ITERATIONS);
    
    this.db.exec(`DROP TABLE IF EXISTS _bench_temp`);
    
    console.log('');
    return this.results;
  }

  printResults() {
    console.log('─'.repeat(72));
    console.log('│ Pattern                        │ Ops/sec │ Avg (ms) │ Total (ms) │');
    console.log('─'.repeat(72));
    
    for (const [name, r] of Object.entries(this.results)) {
      const nameCol = name.padEnd(30);
      const opsCol = r.opsPerSec.toString().padStart(7);
      const avgCol = r.avgMs.padStart(8);
      const totalCol = r.totalMs.toString().padStart(10);
      console.log(`│ ${nameCol} │ ${opsCol} │ ${avgCol} │ ${totalCol} │`);
    }
    
    console.log('─'.repeat(72));
  }

  printInsights() {
    console.log('\n📊 Key Insights:\n');
    const r = this.results;
    
    // Prepared vs ad-hoc
    if (r.single_exact_prepared && r.single_exact_adhoc) {
      const speedup = (r.single_exact_prepared.opsPerSec / r.single_exact_adhoc.opsPerSec).toFixed(1);
      console.log(`   ✓ Prepared statements are ${speedup}x faster than ad-hoc`);
      console.log(`     → ALWAYS use prepared statements for repeated queries`);
    }
    
    // Single vs batch - compare total time for same work
    if (r.single_exact_prepared && r.batch_in_clause) {
      // Single does 20 queries per iteration, batch does 1 query for 20 names
      // So batch should be faster if it takes less time per iteration
      const singleMs = parseFloat(r.single_exact_prepared.avgMs);
      const batchMs = parseFloat(r.batch_in_clause.avgMs);
      if (singleMs < batchMs) {
        console.log(`   ⚠️ Single lookups (${singleMs}ms) beat batch IN (${batchMs}ms) for ${TEST_NAMES.length} names`);
        console.log(`     → SQLite's query planner may prefer indexed single lookups`);
        console.log(`     → Consider single lookups for small batches (<20 names)`);
      } else {
        const speedup = (singleMs / batchMs).toFixed(1);
        console.log(`   ✓ Batch IN clause is ${speedup}x faster than single lookups`);
      }
    }
    
    // Exact vs normalized
    if (r.single_exact_prepared && r.single_normalized) {
      const ratio = (r.single_normalized.opsPerSec / r.single_exact_prepared.opsPerSec).toFixed(2);
      console.log(`   ✓ Normalized lookups are ${ratio}x faster than exact`);
      console.log(`     → The 'normalized' column index is efficient`);
    }
    
    // Transactions
    if (r.transaction_batch_write) {
      console.log(`   ✓ Transaction batch writes: ${r.transaction_batch_write.opsPerSec} ops/sec`);
      console.log(`     → db.transaction() wraps multiple inserts efficiently`);
    }
    
    console.log('');
  }

  toJSON() {
    return {
      timestamp: new Date().toISOString(),
      testNamesCount: TEST_NAMES.length,
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
  
  const dbPath = path.join(__dirname, '../../../data/news.db');
  const bench = new FastBenchmark(dbPath);
  
  try {
    bench.runAll();
    
    if (jsonOutput) {
      console.log(JSON.stringify(bench.toJSON(), null, 2));
    } else {
      bench.printResults();
      bench.printInsights();
    }
  } finally {
    bench.close();
  }
}

module.exports = { FastBenchmark, TEST_NAMES };
