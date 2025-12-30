'use strict';

/**
 * Tests for cost-aware hub ranking in HubSeeder
 */

const { HubSeeder } = require('../../src/crawler/planner/HubSeeder');

describe('Cost-Aware Hub Ranking', () => {
  let mockEnqueueRequest;
  let mockNormalizeUrl;
  let mockState;
  let mockTelemetry;
  let enqueuedUrls;

  beforeEach(() => {
    enqueuedUrls = [];
    mockEnqueueRequest = jest.fn((req) => {
      enqueuedUrls.push(req.url);
      return true;
    });
    mockNormalizeUrl = jest.fn((url) => url);
    mockState = {
      hasSeededHub: jest.fn().mockReturnValue(false),
      hasVisited: jest.fn().mockReturnValue(false),
      addSeededHub: jest.fn()
    };
    mockTelemetry = {
      milestone: jest.fn(),
      problem: jest.fn()
    };
  });

  describe('_applyCostAwareRanking', () => {
    it('sorts hubs by estimated cost (lowest first)', async () => {
      const hubSeeder = new HubSeeder({
        enqueueRequest: mockEnqueueRequest,
        normalizeUrl: mockNormalizeUrl,
        state: mockState,
        telemetry: mockTelemetry,
        baseUrl: 'https://example.com'
      });

      const entries = [
        { url: 'https://example.com/expensive/', meta: { kind: 'section', priorityBias: 10 } },
        { url: 'https://example.com/cheap/', meta: { kind: 'section', priorityBias: 10 } },
        { url: 'https://example.com/medium/', meta: { kind: 'section', priorityBias: 10 } }
      ];

      const costEstimates = {
        available: true,
        model: { totalSamples: 100 },
        hubCosts: [
          { hubUrl: 'https://example.com/expensive/', estimatedMs: 500 },
          { hubUrl: 'https://example.com/cheap/', estimatedMs: 50 },
          { hubUrl: 'https://example.com/medium/', estimatedMs: 200 }
        ],
        totalEstimatedMs: 750
      };

      const result = hubSeeder._applyCostAwareRanking(entries, costEstimates);

      expect(result.applied).toBe(true);
      expect(result.sortedEntries.map(e => e.url)).toEqual([
        'https://example.com/cheap/',
        'https://example.com/medium/',
        'https://example.com/expensive/'
      ]);
      expect(result.stats.avgCostMs).toBe(250);
      expect(result.stats.minCostMs).toBe(50);
      expect(result.stats.maxCostMs).toBe(500);
    });

    it('uses priorityBias as tiebreaker when costs are equal', async () => {
      const hubSeeder = new HubSeeder({
        enqueueRequest: mockEnqueueRequest,
        normalizeUrl: mockNormalizeUrl,
        state: mockState,
        telemetry: mockTelemetry,
        baseUrl: 'https://example.com'
      });

      const entries = [
        { url: 'https://example.com/a/', meta: { kind: 'section', priorityBias: 5 } },
        { url: 'https://example.com/b/', meta: { kind: 'country', priorityBias: 40 } },
        { url: 'https://example.com/c/', meta: { kind: 'navigation', priorityBias: 2 } }
      ];

      // All have same cost
      const costEstimates = {
        available: true,
        model: { totalSamples: 50 },
        hubCosts: [
          { hubUrl: 'https://example.com/a/', estimatedMs: 100 },
          { hubUrl: 'https://example.com/b/', estimatedMs: 100 },
          { hubUrl: 'https://example.com/c/', estimatedMs: 100 }
        ],
        totalEstimatedMs: 300
      };

      const result = hubSeeder._applyCostAwareRanking(entries, costEstimates);

      expect(result.applied).toBe(true);
      // Should sort by priorityBias descending (higher priority first) when cost is equal
      expect(result.sortedEntries.map(e => e.url)).toEqual([
        'https://example.com/b/',  // priorityBias: 40
        'https://example.com/a/',  // priorityBias: 5
        'https://example.com/c/'   // priorityBias: 2
      ]);
    });

    it('falls back to default order when no telemetry', async () => {
      const hubSeeder = new HubSeeder({
        enqueueRequest: mockEnqueueRequest,
        normalizeUrl: mockNormalizeUrl,
        state: mockState,
        telemetry: mockTelemetry,
        baseUrl: 'https://example.com'
      });

      const entries = [
        { url: 'https://example.com/a/', meta: { kind: 'section', priorityBias: 10 } },
        { url: 'https://example.com/b/', meta: { kind: 'section', priorityBias: 10 } }
      ];

      // No cost estimates available
      const result = hubSeeder._applyCostAwareRanking(entries, null);

      expect(result.applied).toBe(false);
      expect(result.sortedEntries).toEqual(entries);
      expect(result.stats.reason).toBe('no-cost-estimates');
    });

    it('handles unavailable cost estimates gracefully', async () => {
      const hubSeeder = new HubSeeder({
        enqueueRequest: mockEnqueueRequest,
        normalizeUrl: mockNormalizeUrl,
        state: mockState,
        telemetry: mockTelemetry,
        baseUrl: 'https://example.com'
      });

      const entries = [
        { url: 'https://example.com/a/', meta: { kind: 'section' } }
      ];

      const costEstimates = {
        available: false,
        reason: 'No historical telemetry data'
      };

      const result = hubSeeder._applyCostAwareRanking(entries, costEstimates);

      expect(result.applied).toBe(false);
      expect(result.stats.reason).toBe('No historical telemetry data');
    });

    it('uses default cost for entries without estimates', async () => {
      const hubSeeder = new HubSeeder({
        enqueueRequest: mockEnqueueRequest,
        normalizeUrl: mockNormalizeUrl,
        state: mockState,
        telemetry: mockTelemetry,
        baseUrl: 'https://example.com'
      });

      const entries = [
        { url: 'https://example.com/known/', meta: { kind: 'section', priorityBias: 10 } },
        { url: 'https://example.com/unknown/', meta: { kind: 'section', priorityBias: 10 } }
      ];

      const costEstimates = {
        available: true,
        model: { totalSamples: 50 },
        hubCosts: [
          { hubUrl: 'https://example.com/known/', estimatedMs: 50 }
        ],
        totalEstimatedMs: 50
      };

      const result = hubSeeder._applyCostAwareRanking(entries, costEstimates);

      expect(result.applied).toBe(true);
      expect(result.stats.withEstimates).toBe(1);
      expect(result.stats.withoutEstimates).toBe(1);
      
      // Known (50ms) should come before unknown (default)
      expect(result.sortedEntries[0].url).toBe('https://example.com/known/');
      expect(result.sortedEntries[0].meta.estimatedCostMs).toBe(50);
    });

    it('emits milestone telemetry when cost-aware ranking applied', async () => {
      const hubSeeder = new HubSeeder({
        enqueueRequest: mockEnqueueRequest,
        normalizeUrl: mockNormalizeUrl,
        state: mockState,
        telemetry: mockTelemetry,
        baseUrl: 'https://example.com'
      });

      const entries = [
        { url: 'https://example.com/a/', meta: { kind: 'section' } }
      ];

      const costEstimates = {
        available: true,
        model: { totalSamples: 100 },
        hubCosts: [
          { hubUrl: 'https://example.com/a/', estimatedMs: 100 }
        ],
        totalEstimatedMs: 100
      };

      hubSeeder._applyCostAwareRanking(entries, costEstimates);

      expect(mockTelemetry.milestone).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'hub-seeder.cost-aware-ranking'
        })
      );
    });
  });

  describe('seedPlan with cost estimates', () => {
    it('seeds hubs in cost-sorted order', async () => {
      const hubSeeder = new HubSeeder({
        enqueueRequest: mockEnqueueRequest,
        normalizeUrl: mockNormalizeUrl,
        state: mockState,
        telemetry: mockTelemetry,
        baseUrl: 'https://example.com',
        db: null,
        disableDbRecording: true
      });

      const costEstimates = {
        available: true,
        model: { totalSamples: 100 },
        hubCosts: [
          { hubUrl: 'https://example.com/world/', estimatedMs: 500 },
          { hubUrl: 'https://example.com/sports/', estimatedMs: 100 }
        ],
        totalEstimatedMs: 600
      };

      const result = await hubSeeder.seedPlan({
        host: 'example.com',
        sectionSlugs: ['world', 'sports'],
        countryCandidates: [],
        navigationLinks: [],
        maxSeeds: 50,
        costEstimates
      });

      expect(result.costAwareRanking).toBe(true);
      expect(result.costStats.avgCostMs).toBe(300);
      
      // Sports (100ms) should be seeded before world (500ms)
      expect(enqueuedUrls[0]).toContain('sports');
      expect(enqueuedUrls[1]).toContain('world');
    });

    it('preserves existing behavior when no cost estimates', async () => {
      const hubSeeder = new HubSeeder({
        enqueueRequest: mockEnqueueRequest,
        normalizeUrl: mockNormalizeUrl,
        state: mockState,
        telemetry: mockTelemetry,
        baseUrl: 'https://example.com',
        db: null,
        disableDbRecording: true
      });

      const result = await hubSeeder.seedPlan({
        host: 'example.com',
        sectionSlugs: ['world', 'sports'],
        countryCandidates: [],
        navigationLinks: [],
        maxSeeds: 50
        // No costEstimates provided
      });

      expect(result.costAwareRanking).toBe(false);
      expect(result.costStats).toBeDefined();
      expect(result.costStats.reason).toBe('no-cost-estimates');
      
      // Original order preserved
      expect(enqueuedUrls[0]).toContain('world');
      expect(enqueuedUrls[1]).toContain('sports');
    });

    it('uses constructor costEstimates when not provided in seedPlan', async () => {
      const costEstimates = {
        available: true,
        model: { totalSamples: 50 },
        hubCosts: [
          { hubUrl: 'https://example.com/world/', estimatedMs: 500 },
          { hubUrl: 'https://example.com/sports/', estimatedMs: 100 }
        ],
        totalEstimatedMs: 600
      };

      const hubSeeder = new HubSeeder({
        enqueueRequest: mockEnqueueRequest,
        normalizeUrl: mockNormalizeUrl,
        state: mockState,
        telemetry: mockTelemetry,
        baseUrl: 'https://example.com',
        db: null,
        disableDbRecording: true,
        costEstimates // Passed via constructor
      });

      const result = await hubSeeder.seedPlan({
        host: 'example.com',
        sectionSlugs: ['world', 'sports'],
        countryCandidates: [],
        navigationLinks: [],
        maxSeeds: 50
        // No costEstimates in seedPlan call
      });

      expect(result.costAwareRanking).toBe(true);
      // Sports (100ms) should be seeded before world (500ms)
      expect(enqueuedUrls[0]).toContain('sports');
      expect(enqueuedUrls[1]).toContain('world');
    });
  });
});
