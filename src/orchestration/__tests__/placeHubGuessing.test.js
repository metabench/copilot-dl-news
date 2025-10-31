'use strict';

/**
 * Basic integration test for orchestration layer
 * 
 * Tests that the orchestration module can be loaded and called
 * without errors. Full integration tests will be added later.
 */

const { guessPlaceHubsBatch, checkDomainReadiness } = require('../placeHubGuessing');
const { createPlaceHubDependencies } = require('../dependencies');
const path = require('path');
const fs = require('fs');

describe('Orchestration Layer - Basic Integration', () => {
  const testDbPath = path.join(__dirname, '..', '..', '..', 'data', 'news.db');
  
  beforeAll(() => {
    if (!fs.existsSync(testDbPath)) {
      throw new Error(`Test database not found at ${testDbPath}`);
    }
  });

  describe('Dependency Creation', () => {
    it('should create dependencies without errors', () => {
      const deps = createPlaceHubDependencies({
        dbPath: testDbPath,
        verbose: false
      });

      expect(deps).toBeDefined();
      expect(deps.db).toBeDefined();
      expect(deps.logger).toBeDefined();
      expect(deps.fetchFn).toBeDefined();
      expect(deps.queries).toBeDefined();
      expect(deps.analyzers).toBeDefined();
      expect(deps.analyzers.country).toBeDefined();
      expect(deps.analyzers.region).toBeDefined();
      expect(deps.analyzers.city).toBeDefined();
      expect(deps.validator).toBeDefined();
      expect(deps.stores).toBeDefined();
    });
  });

  describe('Readiness Check', () => {
    it('should check domain readiness without crashing', async () => {
      const deps = createPlaceHubDependencies({
        dbPath: testDbPath,
        verbose: false
      });

      const readiness = await checkDomainReadiness('theguardian.com', { timeoutSeconds: 1 }, deps);

      expect(readiness).toBeDefined();
      expect(readiness.status).toBeDefined();
      expect(['ready', 'data-limited', 'insufficient-data']).toContain(readiness.status);
      expect(readiness.domain).toBe('theguardian.com');
      expect(readiness.recommendations).toBeDefined();
      expect(Array.isArray(readiness.recommendations)).toBe(true);
    });

    it('should handle invalid domain gracefully', async () => {
      const deps = createPlaceHubDependencies({
        dbPath: testDbPath,
        verbose: false
      });

      await expect(
        checkDomainReadiness('', { timeoutSeconds: 1 }, deps)
      ).rejects.toThrow();
    });
  });

  describe('Batch Processing', () => {
    it('should process empty batch gracefully', async () => {
      const deps = createPlaceHubDependencies({
        dbPath: testDbPath,
        verbose: false
      });

      await expect(
        guessPlaceHubsBatch({ domainBatch: [] }, deps)
      ).rejects.toThrow(/Domain or host is required/);
    });

    it('should accept single domain via domain property', async () => {
      const deps = createPlaceHubDependencies({
        dbPath: testDbPath,
        verbose: false
      });

      const options = {
        domain: 'example.com',
        kinds: ['country'],
        limit: 1,
        apply: false,
        patternsPerPlace: 1,
        maxAgeDays: 7,
        readinessTimeoutSeconds: 1,
        readinessTimeoutMs: 1000
      };

      // This will fail due to insufficient data, but should not crash
      const result = await guessPlaceHubsBatch(options, deps);
      
      expect(result).toBeDefined();
      expect(result.aggregate).toBeDefined();
      expect(result.aggregate.batch.totalDomains).toBe(1);
    });
  });
});
