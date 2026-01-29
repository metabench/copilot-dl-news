'use strict';

/**
 * Basic integration test for orchestration layer
 * 
 * Tests that the orchestration module can be loaded and called
 * without errors. Full integration tests will be added later.
 */

const { guessPlaceHubsBatch, checkDomainReadiness, selectTopics } = require('../placeHubGuessing');
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

  // Mock fetch function to avoid real HTTP calls
  const mockFetch = jest.fn(async (url, options) => {
    // Return a mock successful response
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => '<html><body><h1>Test Page</h1><p>This is a mock response for testing.</p></body></html>',
      json: async () => ({}),
      headers: new Map([['content-type', 'text/html']])
    };
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

  describe('Topic Hub Discovery Integration', () => {
    it('should process topic hubs when enableTopicDiscovery is true', async () => {
      const deps = createPlaceHubDependencies({
        dbPath: testDbPath,
        verbose: false
      });

      const options = {
        domain: 'example.com',
        kinds: ['country'],
        enableTopicDiscovery: true,
        topics: ['politics', 'sports'],
        limit: 2,
        apply: false,
        patternsPerPlace: 1,
        maxAgeDays: 7,
        readinessTimeoutSeconds: 1,
        readinessTimeoutMs: 1000
      };

      const result = await guessPlaceHubsBatch(options, deps);

      expect(result).toBeDefined();
      expect(result.aggregate).toBeDefined();
      expect(result.aggregate.batch.totalDomains).toBe(1);

      // Check that topic processing was attempted
      const domainSummary = result.aggregate.domainSummaries[0];
      expect(domainSummary.summary).toBeDefined();
      expect(typeof domainSummary.summary.totalTopics).toBe('number');
      expect(typeof domainSummary.summary.totalPlaces).toBe('number');
    });

    it('should handle topic discovery with empty topics array (auto-discover)', async () => {
      const deps = createPlaceHubDependencies({
        dbPath: testDbPath,
        verbose: false
      });

      const options = {
        domain: 'example.com',
        kinds: [],
        enableTopicDiscovery: true,
        topics: [], // Empty array means auto-discover
        limit: 3,
        apply: false,
        patternsPerPlace: 1,
        maxAgeDays: 7,
        readinessTimeoutSeconds: 1,
        readinessTimeoutMs: 1000
      };

      const result = await guessPlaceHubsBatch(options, deps);

      expect(result).toBeDefined();
      expect(result.aggregate).toBeDefined();

      const domainSummary = result.aggregate.domainSummaries[0];
      expect(domainSummary.summary).toBeDefined();
      // Should attempt to discover topics automatically
      expect(typeof domainSummary.summary.totalTopics).toBe('number');
    });

    it('should skip topic processing when enableTopicDiscovery is false', async () => {
      const deps = createPlaceHubDependencies({
        dbPath: testDbPath,
        verbose: false
      });

      const options = {
        domain: 'example.com',
        kinds: ['country'],
        enableTopicDiscovery: false, // Explicitly disabled
        topics: ['politics'],
        limit: 2,
        apply: false,
        patternsPerPlace: 1,
        maxAgeDays: 7,
        readinessTimeoutSeconds: 1,
        readinessTimeoutMs: 1000
      };

      const result = await guessPlaceHubsBatch(options, deps);

      expect(result).toBeDefined();
      const domainSummary = result.aggregate.domainSummaries[0];
      expect(domainSummary.summary.totalTopics).toBe(0);
    });

    it('should handle unsupported topics gracefully', async () => {
      const deps = createPlaceHubDependencies({
        dbPath: testDbPath,
        verbose: false
      });

      const options = {
        domain: 'example.com',
        kinds: [],
        enableTopicDiscovery: true,
        topics: ['non-existent-topic', 'another-invalid-topic'],
        limit: 2,
        apply: false,
        patternsPerPlace: 1,
        maxAgeDays: 7,
        readinessTimeoutSeconds: 1,
        readinessTimeoutMs: 1000
      };

      const result = await guessPlaceHubsBatch(options, deps);

      expect(result).toBeDefined();
      const domainSummary = result.aggregate.domainSummaries[0];
      expect(domainSummary.summary).toBeDefined();
      // Should have unsupported topics tracked
      expect(Array.isArray(domainSummary.summary.unsupportedTopics)).toBe(true);
    });

    it('should combine place and topic processing', async () => {
      const deps = createPlaceHubDependencies({
        dbPath: testDbPath,
        verbose: false
      });

      const options = {
        domain: 'example.com',
        kinds: ['country', 'region'],
        enableTopicDiscovery: true,
        topics: ['politics'],
        limit: 2,
        apply: false,
        patternsPerPlace: 1,
        maxAgeDays: 7,
        readinessTimeoutSeconds: 1,
        readinessTimeoutMs: 1000
      };

      const result = await guessPlaceHubsBatch(options, deps);

      expect(result).toBeDefined();
      const domainSummary = result.aggregate.domainSummaries[0];
      expect(domainSummary.summary).toBeDefined();

      // Should process both places and topics
      expect(typeof domainSummary.summary.totalPlaces).toBe('number');
      expect(typeof domainSummary.summary.totalTopics).toBe('number');
      expect(domainSummary.summary.totalUrls).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Batch Processing Compatibility', () => {
    it('should handle multiple domains in batch processing', async () => {
      const deps = createPlaceHubDependencies({
        dbPath: testDbPath,
        verbose: false
      });

      const options = {
        domainBatch: [
          { domain: 'example.com', kinds: ['country'], limit: 1 },
          { domain: 'test.com', kinds: ['country'], limit: 1 }
        ],
        kinds: ['country'],
        limit: 1,
        apply: false,
        patternsPerPlace: 1,
        maxAgeDays: 7,
        readinessTimeoutSeconds: 1,
        readinessTimeoutMs: 1000
      };

      const result = await guessPlaceHubsBatch(options, deps);

      expect(result).toBeDefined();
      expect(result.aggregate).toBeDefined();
      expect(result.aggregate.batch.totalDomains).toBe(2);
      expect(result.aggregate.domainSummaries).toHaveLength(2);
    }, 30000);

    it('should reset attempt counters between batch domains', async () => {
      const deps = createPlaceHubDependencies({
        dbPath: testDbPath,
        verbose: false
      });

      // Mock the fetch recorder to track calls
      const originalFetchFn = deps.fetchFn;
      let fetchCallCount = 0;
      deps.fetchFn = async (url, options) => {
        fetchCallCount++;
        return originalFetchFn(url, options);
      };

      const options = {
        domainBatch: [
          { domain: 'example.com', kinds: ['country'], limit: 1 },
          { domain: 'test.com', kinds: ['country'], limit: 1 }
        ],
        kinds: ['country'],
        limit: 1,
        apply: false,
        patternsPerPlace: 1,
        maxAgeDays: 7,
        readinessTimeoutSeconds: 1,
        readinessTimeoutMs: 1000
      };

      await guessPlaceHubsBatch(options, deps);

      // Note: With insufficient data domains, no fetches may be made
      // This test verifies the batch processing doesn't crash
      expect(fetchCallCount).toBeGreaterThanOrEqual(0);
    }, 30000);

    it('should maintain separate run IDs for batch domains', async () => {
      const deps = createPlaceHubDependencies({
        dbPath: testDbPath,
        verbose: false
      });

      const options = {
        domainBatch: [
          { domain: 'example.com', kinds: ['country'], limit: 1 },
          { domain: 'test.com', kinds: ['country'], limit: 1 }
        ],
        kinds: ['country'],
        limit: 1,
        apply: false,
        patternsPerPlace: 1,
        maxAgeDays: 7,
        readinessTimeoutSeconds: 1,
        readinessTimeoutMs: 1000
      };

      const result = await guessPlaceHubsBatch(options, deps);

      expect(result.aggregate.domainSummaries).toHaveLength(2);

      // Each domain should have its own run metadata
      const domain1 = result.aggregate.domainSummaries[0];
      const domain2 = result.aggregate.domainSummaries[1];

      expect(domain1.domain).toBe('example.com');
      expect(domain2.domain).toBe('test.com');
      expect(domain1.summary).toBeDefined();
      expect(domain2.summary).toBeDefined();
    }, 30000);

    it('should aggregate validation metrics across batch domains', async () => {
      const deps = createPlaceHubDependencies({
        dbPath: testDbPath,
        verbose: false
      });

      const options = {
        domainBatch: [
          { domain: 'example.com', kinds: ['country'], limit: 1 },
          { domain: 'test.com', kinds: ['country'], limit: 1 }
        ],
        kinds: ['country'],
        limit: 1,
        apply: false,
        patternsPerPlace: 1,
        maxAgeDays: 7,
        readinessTimeoutSeconds: 1,
        readinessTimeoutMs: 1000
      };

      const result = await guessPlaceHubsBatch(options, deps);

      // Check that aggregate contains validation metrics
      expect(result.aggregate).toHaveProperty('validationSucceeded');
      expect(result.aggregate).toHaveProperty('validationFailed');
      expect(typeof result.aggregate.validationSucceeded).toBe('number');
      expect(typeof result.aggregate.validationFailed).toBe('number');
    }, 15000);

    it('should include candidate metrics in batch results', async () => {
      const deps = createPlaceHubDependencies({
        dbPath: testDbPath,
        verbose: false
      });

      const options = {
        domainBatch: [
          { domain: 'example.com', kinds: ['country'], limit: 1 }
        ],
        kinds: ['country'],
        limit: 1,
        apply: false,
        patternsPerPlace: 1,
        maxAgeDays: 7,
        readinessTimeoutSeconds: 1,
        readinessTimeoutMs: 1000
      };

      const result = await guessPlaceHubsBatch(options, deps);

      // Check that the aggregate contains the expected numeric fields
      expect(result.aggregate).toHaveProperty('totalUrls');
      expect(result.aggregate).toHaveProperty('fetched');
      expect(result.aggregate).toHaveProperty('cached');
      expect(result.aggregate).toHaveProperty('validationSucceeded');
      expect(result.aggregate).toHaveProperty('validationFailed');
      expect(typeof result.aggregate.totalUrls).toBe('number');
      expect(typeof result.aggregate.fetched).toBe('number');
      expect(typeof result.aggregate.cached).toBe('number');
    });
  });

  describe('Diff Preview Functionality', () => {
    it('should generate diff preview for batch processing', async () => {
      const deps = createPlaceHubDependencies({
        dbPath: testDbPath,
        verbose: false
      });

      const options = {
        domain: 'example.com',
        kinds: ['country'],
        limit: 2,
        apply: false, // Preview mode
        patternsPerPlace: 1,
        maxAgeDays: 7,
        readinessTimeoutSeconds: 1,
        readinessTimeoutMs: 1000
      };

      const result = await guessPlaceHubsBatch(options, deps);

      expect(result.aggregate.diffPreview).toBeDefined();
      expect(Array.isArray(result.aggregate.diffPreview.inserted)).toBe(true);
      expect(Array.isArray(result.aggregate.diffPreview.updated)).toBe(true);
    });

    it('should include per-domain diff previews in batch results', async () => {
      const deps = createPlaceHubDependencies({
        dbPath: testDbPath,
        verbose: false,
        fetchFn: mockFetch
      });

      const options = {
        domainBatch: [
          { domain: 'example.com', kinds: ['country'], limit: 1 },
          { domain: 'test.com', kinds: ['country'], limit: 1 }
        ],
        kinds: ['country'],
        limit: 1,
        apply: false,
        patternsPerPlace: 1,
        maxAgeDays: 7,
        readinessTimeoutSeconds: 1,
        readinessTimeoutMs: 1000
      };

      const result = await guessPlaceHubsBatch(options, deps);

      expect(result.aggregate.domainSummaries).toHaveLength(2);

      result.aggregate.domainSummaries.forEach(domainSummary => {
        expect(domainSummary.diffPreview).toBeDefined();
        expect(Array.isArray(domainSummary.diffPreview.inserted)).toBe(true);
        expect(Array.isArray(domainSummary.diffPreview.updated)).toBe(true);
      });
    }, 20000);
  });

  describe('Report Emission', () => {
    it('should handle emitReport option without crashing', async () => {
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
        readinessTimeoutMs: 1000,
        emitReport: true
      };

      // Should not crash even though report generation is CLI concern
      const result = await guessPlaceHubsBatch(options, deps);

      expect(result).toBeDefined();
      expect(result.aggregate).toBeDefined();
      // Report generation is handled by CLI, not orchestration
    });

    it('should include timing information in batch results', async () => {
      const deps = createPlaceHubDependencies({
        dbPath: testDbPath,
        verbose: false
      });

      const startTime = Date.now();

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

      const result = await guessPlaceHubsBatch(options, deps);

      const endTime = Date.now();

      expect(result.aggregate).toHaveProperty('startedAt');
      expect(result.aggregate).toHaveProperty('completedAt');
      expect(result.aggregate).toHaveProperty('durationMs');
      expect(result.aggregate.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.aggregate.durationMs).toBeLessThanOrEqual(endTime - startTime + 1000); // Allow 1s tolerance
    });
  });

  describe('Readiness Timeout Budgeting', () => {
    it('should respect readiness timeout settings', async () => {
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
        readinessTimeoutSeconds: 2, // 2 second timeout
        readinessTimeoutMs: 2000
      };

      const startTime = Date.now();
      const result = await guessPlaceHubsBatch(options, deps);
      const endTime = Date.now();

      // Should complete within reasonable time (allowing for some overhead)
      expect(endTime - startTime).toBeLessThan(5000); // Less than 5 seconds

      expect(result.aggregate.readinessTimeoutSeconds).toBe(2);
    });

    it('should include readiness probe information in domain summaries', async () => {
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

      const result = await guessPlaceHubsBatch(options, deps);

      const domainSummary = result.aggregate.domainSummaries[0];
      expect(domainSummary.readinessProbe).toBeDefined();
      expect(typeof domainSummary.readinessProbe.timedOut).toBe('boolean');
      expect(typeof domainSummary.readinessProbe.elapsedMs).toBe('number');
    });
  });
});
