#!/usr/bin/env node
/**
 * Candidate Generation Benchmark
 * 
 * Simulates the disambiguation pipeline from Chapter 11:
 * 1. Extract mentions from text
 * 2. Generate candidates for each mention
 * 3. Fetch candidate details (hierarchy, attributes)
 * 
 * This measures real-world performance for article processing.
 */
'use strict';

const path = require('path');
const { ensureDatabase } = require('../../../src/db/sqlite');

// Simulated article mentions (typical news article has 3-8 place mentions)
const ARTICLE_MENTIONS = [
  ['London', 'UK'],                    // 2 mentions
  ['London', 'Paris', 'Berlin'],       // 3 mentions
  ['New York', 'Washington', 'Los Angeles', 'Chicago'], // 4 mentions
  ['Moscow', 'Kiev', 'Warsaw', 'Berlin', 'Paris'],      // 5 mentions
  ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Darwin'], // 6 mentions
];

class CandidateGenerationBenchmark {
  constructor(dbPath) {
    this.db = ensureDatabase(dbPath);
    this.results = {};
    
    // Prepare all statements upfront
    this.stmts = {
      // Find candidates by normalized name
      findCandidates: this.db.prepare(`
        SELECT 
          p.id as place_id,
          pn.name,
          p.kind,
          p.country_code,
          COALESCE(p.population, 0) as population,
          COALESCE(p.priority_score, 0) as importance
        FROM place_names pn
        JOIN places p ON pn.place_id = p.id
        WHERE pn.normalized = ?
        ORDER BY p.population DESC NULLS LAST
        LIMIT 20
      `),
      
      // Get place hierarchy (parents)
      getHierarchy: this.db.prepare(`
        SELECT 
          ph.parent_id,
          ph.depth,
          ph.relation,
          p.kind,
          p.country_code
        FROM place_hierarchy ph
        JOIN places p ON ph.parent_id = p.id
        WHERE ph.child_id = ?
        ORDER BY ph.depth ASC
      `),
      
      // Get canonical name
      getCanonicalName: this.db.prepare(`
        SELECT pn.name
        FROM places p
        JOIN place_names pn ON p.canonical_name_id = pn.id
        WHERE p.id = ?
      `)
    };
  }

  normalize(name) {
    return name.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  benchmark(name, fn, iterations = 20) {
    // Warmup
    for (let i = 0; i < 3; i++) fn();
    
    const start = Date.now();
    for (let i = 0; i < iterations; i++) {
      fn();
    }
    const durationMs = Date.now() - start;
    
    const opsPerSec = Math.round((iterations / durationMs) * 1000);
    const avgMs = (durationMs / iterations).toFixed(2);
    
    this.results[name] = { iterations, totalMs: durationMs, avgMs, opsPerSec };
    return this.results[name];
  }

  /**
   * Pattern 1: Sequential candidate generation
   * For each mention, find candidates one by one
   */
  benchmarkSequentialCandidates() {
    console.log('   [1/4] Sequential candidate generation...');
    
    return this.benchmark('sequential_candidates', () => {
      for (const mentions of ARTICLE_MENTIONS) {
        for (const mention of mentions) {
          const candidates = this.stmts.findCandidates.all(this.normalize(mention));
        }
      }
    });
  }

  /**
   * Pattern 2: Parallel candidate + hierarchy fetch
   * Get candidates, then immediately fetch hierarchy for each
   */
  benchmarkWithHierarchy() {
    console.log('   [2/4] Candidates + hierarchy...');
    
    return this.benchmark('candidates_with_hierarchy', () => {
      for (const mentions of ARTICLE_MENTIONS) {
        for (const mention of mentions) {
          const candidates = this.stmts.findCandidates.all(this.normalize(mention));
          
          // Fetch hierarchy for top 3 candidates only
          for (const candidate of candidates.slice(0, 3)) {
            this.stmts.getHierarchy.all(candidate.place_id);
          }
        }
      }
    });
  }

  /**
   * Pattern 3: Cached normalized names
   * Pre-normalize all mentions, dedupe, then lookup
   */
  benchmarkDedupedLookup() {
    console.log('   [3/4] Deduped normalized lookup...');
    
    return this.benchmark('deduped_lookup', () => {
      for (const mentions of ARTICLE_MENTIONS) {
        // Dedupe and normalize first
        const normalized = [...new Set(mentions.map(m => this.normalize(m)))];
        
        // Single lookup per unique normalized name
        const candidateMap = new Map();
        for (const norm of normalized) {
          candidateMap.set(norm, this.stmts.findCandidates.all(norm));
        }
      }
    });
  }

  /**
   * Pattern 4: Full disambiguation simulation
   * Candidates + hierarchy + canonical names for top candidates
   */
  benchmarkFullDisambiguation() {
    console.log('   [4/4] Full disambiguation simulation...');
    
    return this.benchmark('full_disambiguation', () => {
      for (const mentions of ARTICLE_MENTIONS) {
        const normalized = [...new Set(mentions.map(m => this.normalize(m)))];
        
        for (const norm of normalized) {
          const candidates = this.stmts.findCandidates.all(norm);
          
          // For top 3, fetch full context
          for (const candidate of candidates.slice(0, 3)) {
            const hierarchy = this.stmts.getHierarchy.all(candidate.place_id);
            const canonicalRow = this.stmts.getCanonicalName.get(candidate.place_id);
            candidate.canonicalName = canonicalRow?.name;
            candidate.parents = hierarchy;
          }
        }
      }
    });
  }

  runAll() {
    const totalMentions = ARTICLE_MENTIONS.reduce((sum, arr) => sum + arr.length, 0);
    console.log('\n🔬 Candidate Generation Benchmark');
    console.log(`   Simulating ${ARTICLE_MENTIONS.length} articles with ${totalMentions} total mentions\n`);
    
    this.benchmarkSequentialCandidates();
    this.benchmarkWithHierarchy();
    this.benchmarkDedupedLookup();
    this.benchmarkFullDisambiguation();
    
    console.log('');
    return this.results;
  }

  printResults() {
    console.log('─'.repeat(72));
    console.log('│ Pattern                        │ Ops/sec │ Avg (ms) │ Articles/s │');
    console.log('─'.repeat(72));
    
    for (const [name, r] of Object.entries(this.results)) {
      const nameCol = name.padEnd(30);
      const opsCol = r.opsPerSec.toString().padStart(7);
      const avgCol = r.avgMs.padStart(8);
      // Each "op" processes all 5 articles
      const articlesPerSec = (r.opsPerSec * ARTICLE_MENTIONS.length).toString().padStart(10);
      console.log(`│ ${nameCol} │ ${opsCol} │ ${avgCol} │ ${articlesPerSec} │`);
    }
    
    console.log('─'.repeat(72));
  }

  printInsights() {
    console.log('\n📊 Disambiguation Performance Insights:\n');
    const r = this.results;
    
    if (r.sequential_candidates && r.full_disambiguation) {
      const overhead = (parseFloat(r.full_disambiguation.avgMs) / parseFloat(r.sequential_candidates.avgMs)).toFixed(1);
      console.log(`   • Full disambiguation adds ${overhead}x overhead vs simple lookup`);
      console.log(`     → Hierarchy + canonical name queries add significant cost`);
    }
    
    if (r.sequential_candidates && r.deduped_lookup) {
      const savings = (parseFloat(r.sequential_candidates.avgMs) / parseFloat(r.deduped_lookup.avgMs)).toFixed(1);
      console.log(`   • Deduping mentions is ${savings}x faster`);
      console.log(`     → Always normalize and dedupe before lookup`);
    }
    
    if (r.full_disambiguation) {
      const articlesPerSec = r.full_disambiguation.opsPerSec * ARTICLE_MENTIONS.length;
      console.log(`   • Full pipeline: ~${articlesPerSec} articles/second`);
      console.log(`     → At 3-5 mentions per article, this is sustainable`);
    }
    
    console.log('\n💡 Recommendations for DisambiguationService:\n');
    console.log('   1. Pre-normalize all mentions before lookup');
    console.log('   2. Dedupe normalized mentions to avoid repeat queries');
    console.log('   3. Limit hierarchy fetches to top 3 candidates');
    console.log('   4. Cache canonical names (they rarely change)');
    console.log('   5. Consider lazy-loading hierarchy only when scoring');
    console.log('');
  }

  toJSON() {
    return {
      timestamp: new Date().toISOString(),
      articleCount: ARTICLE_MENTIONS.length,
      totalMentions: ARTICLE_MENTIONS.reduce((sum, arr) => sum + arr.length, 0),
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
  const bench = new CandidateGenerationBenchmark(dbPath);
  
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

module.exports = { CandidateGenerationBenchmark };
