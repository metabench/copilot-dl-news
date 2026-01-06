'use strict';

const { PageExecutionService } = require('../PageExecutionService');
const { CrawlerState } = require('../CrawlerState');

describe('PageExecutionService place hub pattern learning', () => {
  // Minimal mocks for PageExecutionService dependencies
  const createMockService = (overrides = {}) => {
    const fetchPipeline = {
      fetch: jest.fn().mockResolvedValue({
        source: 'network',
        html: '<html><a href="/world/france">France</a></html>',
        meta: { url: 'https://example.com/' }
      })
    };

    const navigationDiscoveryService = {
      discover: jest.fn().mockReturnValue({
        looksLikeArticle: false,
        navigationLinks: [],
        articleLinks: [],
        allLinks: overrides.allLinks || [
          { url: 'https://example.com/world/france', type: 'nav' },
          { url: 'https://example.com/news/article-123', type: 'article' }
        ],
        linkSummary: {},
        $: null
      })
    };

    const contentAcquisitionService = { 
      acquire: jest.fn().mockReturnValue({ isArticle: false }) 
    };

    const enqueueRequest = jest.fn();
    const state = new CrawlerState();

    const service = new PageExecutionService({
      maxDepth: 3,
      getStats: () => ({ pagesDownloaded: 0 }),
      state,
      fetchPipeline,
      navigationDiscoveryService,
      contentAcquisitionService,
      articleProcessor: null,
      milestoneTracker: null,
      adaptiveSeedPlanner: null,
      enqueueRequest,
      telemetry: null,
      recordError: jest.fn(),
      normalizeUrl: (url) => url,
      looksLikeArticle: () => false,
      noteDepthVisit: jest.fn(),
      emitProgress: jest.fn(),
      getDbAdapter: () => ({ isEnabled: () => false }),
      computeContentSignals: jest.fn(),
      computeUrlSignals: jest.fn(),
      combineSignals: jest.fn(),
      domain: 'example.com',
      placeHubPatternLearningService: overrides.placeHubPatternLearningService || null,
      ...overrides
    });

    // Disable country hub checks
    jest.spyOn(service, '_isTotalPrioritisationEnabled').mockReturnValue(false);
    jest.spyOn(service, '_isCountryHubPage').mockReturnValue(false);

    return { service, enqueueRequest, state };
  };

  describe('when placeHubPatternLearningService is provided', () => {
    test('should call predictPlaceHub for each discovered link', async () => {
      const mockLearningService = {
        predictPlaceHub: jest.fn().mockReturnValue({
          isPlaceHub: false,
          confidence: 0,
          placeKind: null,
          reason: 'No match'
        }),
        recordValidation: jest.fn()
      };

      const { service, enqueueRequest } = createMockService({
        placeHubPatternLearningService: mockLearningService
      });

      await service.processPage({ url: 'https://example.com/', depth: 0, context: {} });

      // Should have called predictPlaceHub for each link
      expect(mockLearningService.predictPlaceHub).toHaveBeenCalledTimes(2);
      expect(mockLearningService.predictPlaceHub).toHaveBeenCalledWith(
        'https://example.com/world/france',
        'example.com'
      );
      expect(mockLearningService.predictPlaceHub).toHaveBeenCalledWith(
        'https://example.com/news/article-123',
        'example.com'
      );
    });

    test('should annotate enqueue request with place hub prediction metadata', async () => {
      const mockLearningService = {
        predictPlaceHub: jest.fn().mockImplementation((url) => {
          if (url.includes('/world/')) {
            return {
              isPlaceHub: true,
              confidence: 0.85,
              placeKind: 'country',
              reason: 'Matches /world/ pattern'
            };
          }
          return { isPlaceHub: false, confidence: 0, placeKind: null, reason: 'No match' };
        }),
        recordValidation: jest.fn()
      };

      const { service, enqueueRequest } = createMockService({
        placeHubPatternLearningService: mockLearningService
      });

      await service.processPage({ url: 'https://example.com/', depth: 0, context: {} });

      // Find the enqueue call for the /world/france URL
      const worldCall = enqueueRequest.mock.calls.find(
        call => call[0].url === 'https://example.com/world/france'
      );
      expect(worldCall).toBeDefined();
      expect(worldCall[0].meta).toEqual(expect.objectContaining({
        predictedPlaceHub: true,
        placeHubConfidence: 0.85,
        placeHubKind: 'country',
        placeHubReason: 'Matches /world/ pattern'
      }));
    });

    test('should boost priority for predicted place hubs', async () => {
      const mockLearningService = {
        predictPlaceHub: jest.fn().mockImplementation((url) => {
          if (url.includes('/world/')) {
            return {
              isPlaceHub: true,
              confidence: 0.9,
              placeKind: 'region',
              reason: 'Matches pattern'
            };
          }
          return { isPlaceHub: false, confidence: 0, placeKind: null, reason: 'No match' };
        }),
        recordValidation: jest.fn()
      };

      const { service, enqueueRequest } = createMockService({
        placeHubPatternLearningService: mockLearningService
      });

      await service.processPage({ url: 'https://example.com/', depth: 0, context: {} });

      // Check the world/france call has boosted priority
      const worldCall = enqueueRequest.mock.calls.find(
        call => call[0].url === 'https://example.com/world/france'
      );
      expect(worldCall).toBeDefined();
      // forcePriority should be 70 + floor(0.9 * 20) = 70 + 18 = 88
      expect(worldCall[0].meta.forcePriority).toBe(88);
    });

    test('should not annotate links below confidence threshold', async () => {
      const mockLearningService = {
        predictPlaceHub: jest.fn().mockReturnValue({
          isPlaceHub: true,
          confidence: 0.3, // Below 0.4 threshold
          placeKind: 'city',
          reason: 'Low confidence match'
        }),
        recordValidation: jest.fn()
      };

      const { service, enqueueRequest } = createMockService({
        placeHubPatternLearningService: mockLearningService
      });

      await service.processPage({ url: 'https://example.com/', depth: 0, context: {} });

      // All enqueue calls should have null or undefined meta (no place hub annotation)
      for (const call of enqueueRequest.mock.calls) {
        expect(call[0].meta?.predictedPlaceHub).toBeUndefined();
      }
    });

    test('should silently handle prediction errors', async () => {
      const mockLearningService = {
        predictPlaceHub: jest.fn().mockImplementation(() => {
          throw new Error('Database connection failed');
        }),
        recordValidation: jest.fn()
      };

      const { service, enqueueRequest } = createMockService({
        placeHubPatternLearningService: mockLearningService
      });

      // Should not throw
      await expect(
        service.processPage({ url: 'https://example.com/', depth: 0, context: {} })
      ).resolves.not.toThrow();

      // Links should still be enqueued
      expect(enqueueRequest).toHaveBeenCalled();
    });
  });

  describe('when placeHubPatternLearningService is null', () => {
    test('should not attempt place hub prediction', async () => {
      const { service, enqueueRequest } = createMockService({
        placeHubPatternLearningService: null
      });

      await service.processPage({ url: 'https://example.com/', depth: 0, context: {} });

      // Links should be enqueued without any place hub metadata
      expect(enqueueRequest).toHaveBeenCalled();
      for (const call of enqueueRequest.mock.calls) {
        expect(call[0].meta?.predictedPlaceHub).toBeUndefined();
      }
    });
  });

  describe('_recordPlaceHubValidation', () => {
    test('should call recordValidation on the learning service for seeded hubs', async () => {
      const mockLearningService = {
        predictPlaceHub: jest.fn().mockReturnValue({ isPlaceHub: false, confidence: 0 }),
        recordValidation: jest.fn()
      };

      const { service, state } = createMockService({
        placeHubPatternLearningService: mockLearningService,
        allLinks: [] // No links to enqueue
      });

      // Set up a seeded hub
      state.addSeededHub('https://example.com/world/france', { 
        kind: 'country', 
        countryName: 'France' 
      });

      // Override fetch to simulate visiting the seeded hub
      service.fetchPipeline.fetch = jest.fn().mockResolvedValue({
        source: 'network',
        html: '<html></html>',
        meta: { url: 'https://example.com/world/france' }
      });

      await service.processPage({ 
        url: 'https://example.com/world/france', 
        depth: 0, 
        context: {} 
      });

      // Should have called recordValidation with isPlaceHub = true (country hub)
      expect(mockLearningService.recordValidation).toHaveBeenCalledWith(
        'https://example.com/world/france',
        'example.com',
        true
      );
    });

    test('should not call recordValidation when service is null', async () => {
      const { service, state } = createMockService({
        placeHubPatternLearningService: null,
        allLinks: []
      });

      state.addSeededHub('https://example.com/world/france', { 
        kind: 'country' 
      });

      service.fetchPipeline.fetch = jest.fn().mockResolvedValue({
        source: 'network',
        html: '<html></html>',
        meta: { url: 'https://example.com/world/france' }
      });

      // Should not throw
      await expect(
        service.processPage({ 
          url: 'https://example.com/world/france', 
          depth: 0, 
          context: {} 
        })
      ).resolves.not.toThrow();
    });
  });
});
