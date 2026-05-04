/**
 * Tests for DB access pattern benchmarks
 * 
 * These tests verify the benchmark infrastructure works correctly.
 * They don't test performance (that would be flaky) - just correctness.
 */
'use strict';

const path = require('path');

describe('DB Access Patterns Lab', () => {
  const dbPath = path.join(__dirname, '../../../data/news.db');
  
  describe('FastBenchmark', () => {
    const { FastBenchmark } = require('../benchmarks/gazetteer-fast.bench');
    let bench;
    
    beforeAll(() => {
      bench = new FastBenchmark(dbPath);
    });
    
    afterAll(() => {
      bench.close();
    });
    
    test('should find candidates for common place names', () => {
      const results = bench.stmts.exactName.all('London');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('id');
      expect(results[0]).toHaveProperty('country_code');
    });
    
    test('should find normalized matches', () => {
      const results = bench.stmts.normalizedName.all('london');
      expect(results.length).toBeGreaterThan(0);
    });
    
    test('should run benchmark without error', () => {
      const result = bench.benchmark('test_benchmark', () => {
        bench.stmts.exactName.all('Paris');
      }, 5);
      
      expect(result).toHaveProperty('iterations', 5);
      expect(result).toHaveProperty('opsPerSec');
      expect(result.opsPerSec).toBeGreaterThan(0);
    });
    
    test('toJSON returns valid structure', () => {
      bench.results = { test: { iterations: 10, totalMs: 100, avgMs: '10.0', opsPerSec: 100 } };
      const json = bench.toJSON();
      
      expect(json).toHaveProperty('timestamp');
      expect(json).toHaveProperty('testNamesCount');
      expect(json).toHaveProperty('benchmarks');
      expect(json.benchmarks).toHaveProperty('test');
    });
  });
  
  describe('CandidateGenerationBenchmark', () => {
    const { CandidateGenerationBenchmark } = require('../benchmarks/candidate-generation.bench');
    let bench;
    
    beforeAll(() => {
      bench = new CandidateGenerationBenchmark(dbPath);
    });
    
    afterAll(() => {
      bench.close();
    });
    
    test('should find candidates', () => {
      const candidates = bench.stmts.findCandidates.all('london');
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates[0]).toHaveProperty('place_id');
      expect(candidates[0]).toHaveProperty('population');
    });
    
    test('should get hierarchy for a place', () => {
      const candidates = bench.stmts.findCandidates.all('london');
      if (candidates.length > 0) {
        const hierarchy = bench.stmts.getHierarchy.all(candidates[0].place_id);
        // Hierarchy may be empty for some places, that's OK
        expect(Array.isArray(hierarchy)).toBe(true);
      }
    });
    
    test('normalize should lowercase and trim', () => {
      expect(bench.normalize('  New York  ')).toBe('new york');
      expect(bench.normalize('LONDON')).toBe('london');
    });
    
    test('toJSON returns valid structure', () => {
      bench.results = { test: { iterations: 10, totalMs: 100, avgMs: '10.0', opsPerSec: 100 } };
      const json = bench.toJSON();
      
      expect(json).toHaveProperty('articleCount');
      expect(json).toHaveProperty('totalMentions');
      expect(json).toHaveProperty('benchmarks');
    });
  });
});
