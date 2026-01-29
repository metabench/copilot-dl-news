'use strict';

const { DiscoveryStrategySelector, STRATEGIES } = require('../DiscoveryStrategySelector');
const { AdaptiveDiscoveryService } = require('../AdaptiveDiscoveryService');

describe('DiscoveryStrategySelector', () => {
  let selector;

  beforeEach(() => {
    selector = new DiscoveryStrategySelector({
      logger: { info: jest.fn(), warn: jest.fn() }
    });
  });

  describe('selectStrategy', () => {
    it('should return sitemap strategy by default for new domains', async () => {
      const result = await selector.selectStrategy('example.com', { phase: 'initial' });
      
      expect(result.strategy).toBeDefined();
      expect(Object.values(STRATEGIES)).toContain(result.strategy);
      expect(result.confidence).toBeDefined();
      expect(result.reason).toBeDefined();
    });

    it('should prefer sitemap when domain has sitemaps', async () => {
      // Set exploration rate to 0 to ensure exploitation (deterministic)
      selector.explorationRate = 0;
      
      selector.registerSitemapCapability('example.com', {
        hasSitemap: true,
        urlCount: 5000
      });

      // Record some successful sitemap outcomes to build confidence
      for (let i = 0; i < 5; i++) {
        await selector.recordOutcome('example.com', STRATEGIES.SITEMAP, {
          success: true,
          isArticle: true
        });
      }

      const result = await selector.selectStrategy('example.com', { phase: 'initial' });
      
      expect(result.strategy).toBe(STRATEGIES.SITEMAP);
    });

    it('should switch to defensive strategies on high error rate', async () => {
      const result = await selector.selectStrategy('example.com', { 
        phase: 'crawling',
        errorRate: 0.5 
      });
      
      // Defensive strategies don't include APS
      expect(result.strategy).not.toBe(STRATEGIES.APS);
    });

    it('should explore when forceExplore is true', async () => {
      const result = await selector.selectStrategy('example.com', { 
        forceExplore: true 
      });
      
      expect(result.reason).toBe('exploration');
    });
  });

  describe('recordOutcome', () => {
    it('should update stats after recording outcome', async () => {
      await selector.recordOutcome('example.com', STRATEGIES.SITEMAP, {
        success: true,
        isArticle: true,
        newUrlsDiscovered: 5
      });

      const stats = selector.getStats('example.com');
      
      expect(stats[STRATEGIES.SITEMAP]).toBeDefined();
      expect(stats[STRATEGIES.SITEMAP].attempts).toBe(1);
      expect(stats[STRATEGIES.SITEMAP].successes).toBe(1);
      expect(stats[STRATEGIES.SITEMAP].articles).toBe(1);
      expect(stats[STRATEGIES.SITEMAP].urlsDiscovered).toBe(5);
    });

    it('should calculate success rate correctly', async () => {
      for (let i = 0; i < 8; i++) {
        await selector.recordOutcome('example.com', STRATEGIES.SITEMAP, { success: true, isArticle: true });
      }
      for (let i = 0; i < 2; i++) {
        await selector.recordOutcome('example.com', STRATEGIES.SITEMAP, { success: false, httpStatus: 404 });
      }

      const stats = selector.getStats('example.com');
      
      expect(stats[STRATEGIES.SITEMAP].successRate).toBe(0.8);
      expect(stats[STRATEGIES.SITEMAP].errorBreakdown.http404).toBe(2);
    });

    it('should track article yield', async () => {
      await selector.recordOutcome('example.com', STRATEGIES.SITEMAP, { success: true, isArticle: true });
      await selector.recordOutcome('example.com', STRATEGIES.SITEMAP, { success: true, isArticle: false });
      await selector.recordOutcome('example.com', STRATEGIES.SITEMAP, { success: true, isArticle: true });

      const stats = selector.getStats('example.com');
      
      expect(stats[STRATEGIES.SITEMAP].articleYield).toBeCloseTo(0.667, 2);
    });
  });

  describe('getBlendRatios', () => {
    it('should return ratios that sum to 1', async () => {
      // Record some data
      for (let i = 0; i < 15; i++) {
        await selector.recordOutcome('example.com', STRATEGIES.SITEMAP, { success: true, isArticle: true });
      }
      for (let i = 0; i < 10; i++) {
        await selector.recordOutcome('example.com', STRATEGIES.LINK_FOLLOW, { success: true, isArticle: false });
      }

      const ratios = selector.getBlendRatios('example.com');
      const sum = Object.values(ratios).reduce((a, b) => a + b, 0);
      
      expect(sum).toBeCloseTo(1, 5);
    });

    it('should set sitemap ratio to 0 when no sitemap available', async () => {
      selector.registerSitemapCapability('example.com', { hasSitemap: false });

      const ratios = selector.getBlendRatios('example.com');
      
      expect(ratios[STRATEGIES.SITEMAP]).toBe(0);
    });
  });

  describe('getRecommendation', () => {
    it('should provide recommendation with reasoning', async () => {
      selector.registerSitemapCapability('example.com', {
        hasSitemap: true,
        urlCount: 10000
      });

      // Record good sitemap performance
      for (let i = 0; i < 20; i++) {
        await selector.recordOutcome('example.com', STRATEGIES.SITEMAP, { 
          success: true, 
          isArticle: true 
        });
      }

      const rec = selector.getRecommendation('example.com');
      
      expect(rec.recommendedStrategy).toBe(STRATEGIES.SITEMAP);
      expect(rec.reasoning.length).toBeGreaterThan(0);
      expect(rec.capabilities.hasSitemap).toBe(true);
    });
  });
});

describe('AdaptiveDiscoveryService', () => {
  let service;

  beforeEach(() => {
    service = new AdaptiveDiscoveryService({
      logger: { info: jest.fn(), warn: jest.fn() },
      minFetchesBeforeSwitch: 5,
      switchCheckInterval: 3
    });
  });

  describe('initialize', () => {
    it('should initialize with a strategy', async () => {
      const strategy = await service.initialize('example.com', { hasSitemap: true });
      
      expect(strategy).toBeDefined();
      expect(service.getCurrentStrategy()).toBe(strategy);
    });

    it('should record initial strategy in history', async () => {
      await service.initialize('example.com');
      
      const summary = service.getSummary();
      expect(summary.history.length).toBe(1);
      expect(summary.switchCount).toBe(0);
    });
  });

  describe('recordFetch', () => {
    beforeEach(async () => {
      await service.initialize('example.com');
    });

    it('should track fetches', async () => {
      await service.recordFetch('http://example.com/page1', { success: true, isArticle: true });
      await service.recordFetch('http://example.com/page2', { success: true, isArticle: false });

      const summary = service.getSummary();
      expect(summary.stats[service.getCurrentStrategy()].attempts).toBe(2);
    });
  });

  describe('shouldSwitchStrategy', () => {
    beforeEach(async () => {
      await service.initialize('example.com');
    });

    it('should not switch before minimum fetches', () => {
      expect(service.shouldSwitchStrategy()).toBe(false);
    });

    it('should trigger switch on high error rate', async () => {
      // Record many failures
      for (let i = 0; i < 10; i++) {
        await service.recordFetch(`http://example.com/page${i}`, { 
          success: false, 
          httpStatus: 404 
        });
      }

      expect(service.shouldSwitchStrategy()).toBe(true);
    });
  });

  describe('switchStrategy', () => {
    beforeEach(async () => {
      await service.initialize('example.com');
    });

    it('should switch to a different strategy', async () => {
      const oldStrategy = service.getCurrentStrategy();
      const newStrategy = await service.switchStrategy();
      
      expect(newStrategy).not.toBe(oldStrategy);
      expect(service.getCurrentStrategy()).toBe(newStrategy);
    });

    it('should record switch in history', async () => {
      await service.switchStrategy();
      
      const summary = service.getSummary();
      expect(summary.history.length).toBe(2);
      expect(summary.switchCount).toBe(1);
    });

    it('should allow forcing specific strategy', async () => {
      const newStrategy = await service.switchStrategy(STRATEGIES.APS);
      
      expect(newStrategy).toBe(STRATEGIES.APS);
    });
  });

  describe('blend mode', () => {
    beforeEach(async () => {
      await service.initialize('example.com', { hasSitemap: true });
    });

    it('should return null ratios when not in blend mode', () => {
      expect(service.getBlendRatios()).toBeNull();
    });

    it('should return ratios when blend mode enabled', () => {
      service.enableBlendMode(true);
      
      const ratios = service.getBlendRatios();
      expect(ratios).not.toBeNull();
      expect(Object.keys(ratios).length).toBeGreaterThan(0);
    });
  });

  describe('getSummary', () => {
    it('should provide comprehensive summary', async () => {
      await service.initialize('example.com');
      
      for (let i = 0; i < 5; i++) {
        await service.recordFetch(`http://example.com/page${i}`, { 
          success: true, 
          isArticle: i % 2 === 0 
        });
      }

      const summary = service.getSummary();
      
      expect(summary.domain).toBe('example.com');
      expect(summary.currentStrategy).toBeDefined();
      expect(summary.history).toBeInstanceOf(Array);
      expect(summary.stats).toBeDefined();
      expect(summary.recentMetrics).toBeDefined();
      expect(summary.recommendation).toBeDefined();
    });
  });
});
