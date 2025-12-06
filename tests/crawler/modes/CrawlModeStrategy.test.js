'use strict';

const {
  CrawlModeStrategy,
  BasicCrawlMode,
  GazetteerCrawlMode,
  IntelligentCrawlMode,
  createModeStrategy
} = require('../../../src/crawler/modes');

// Mock crawler object for testing
function createMockCrawler(overrides = {}) {
  return {
    stats: { visited: 10, articles: 5, queued: 0, errors: 0 },
    _runSequentialLoop: jest.fn().mockResolvedValue(undefined),
    _runConcurrentWorkers: jest.fn().mockResolvedValue(undefined),
    gazetteerManager: {
      run: jest.fn().mockResolvedValue(undefined),
      getStats: jest.fn().mockReturnValue({ countriesProcessed: 3, hubsDiscovered: 10 })
    },
    _ensureIntelligentPlanRunner: jest.fn(),
    intelligentPlanRunner: {
      savePlanSummary: jest.fn().mockResolvedValue(undefined)
    },
    _intelligentPlanSummary: { seedsGenerated: 20, hubsIdentified: 5 },
    telemetry: {
      milestoneOnce: jest.fn(),
      problem: jest.fn()
    },
    enhancedFeatures: {},
    ...overrides
  };
}

// Mock config object for testing
function createMockConfig(overrides = {}) {
  return {
    concurrency: 1,
    maxDepth: 3,
    useSitemap: true,
    crawlType: 'basic',
    ...overrides
  };
}

// Create a test context
function createTestContext(crawlerOverrides = {}, configOverrides = {}) {
  return {
    crawler: createMockCrawler(crawlerOverrides),
    config: createMockConfig(configOverrides),
    services: {},
    state: {}
  };
}

describe('CrawlModeStrategy', () => {
  describe('abstract class behavior', () => {
    it('throws when instantiated directly', () => {
      expect(() => {
        new CrawlModeStrategy(createTestContext());
      }).toThrow('CrawlModeStrategy is abstract');
    });

    it('throws when modeId is not implemented', () => {
      class TestMode extends CrawlModeStrategy {}
      const mode = new TestMode(createTestContext());
      expect(() => mode.modeId).toThrow('modeId getter must be implemented');
    });

    it('throws when run() is not implemented', async () => {
      class TestMode extends CrawlModeStrategy {
        get modeId() { return 'test'; }
      }
      const mode = new TestMode(createTestContext());
      await expect(mode.run()).rejects.toThrow('run() must be implemented');
    });
  });

  describe('factory method', () => {
    it('creates BasicCrawlMode for basic type', () => {
      const mode = CrawlModeStrategy.create('basic', createTestContext());
      expect(mode).toBeInstanceOf(BasicCrawlMode);
    });

    it('creates GazetteerCrawlMode for gazetteer type', () => {
      const mode = CrawlModeStrategy.create('gazetteer', createTestContext());
      expect(mode).toBeInstanceOf(GazetteerCrawlMode);
    });

    it('creates GazetteerCrawlMode for geography type', () => {
      const mode = CrawlModeStrategy.create('geography', createTestContext());
      expect(mode).toBeInstanceOf(GazetteerCrawlMode);
    });

    it('creates IntelligentCrawlMode for intelligent type', () => {
      const mode = CrawlModeStrategy.create('intelligent', createTestContext());
      expect(mode).toBeInstanceOf(IntelligentCrawlMode);
    });

    it('defaults to BasicCrawlMode for unknown types', () => {
      const mode = CrawlModeStrategy.create('unknown', createTestContext());
      expect(mode).toBeInstanceOf(BasicCrawlMode);
    });
  });
});

describe('BasicCrawlMode', () => {
  let context;
  let mode;

  beforeEach(() => {
    context = createTestContext();
    mode = new BasicCrawlMode(context);
  });

  describe('properties', () => {
    it('has correct modeId', () => {
      expect(mode.modeId).toBe('basic');
    });

    it('has correct displayName', () => {
      expect(mode.displayName).toBe('Basic Crawl');
    });

    it('does not require init', () => {
      expect(mode.requiresInit()).toBe(false);
    });

    it('does not run planner', () => {
      expect(mode.shouldRunPlanner()).toBe(false);
    });
  });

  describe('sequences', () => {
    it('returns correct startup sequence', () => {
      expect(mode.getStartupSequence()).toEqual([
        'init', 'sitemaps', 'seedStartUrl', 'markStartupComplete'
      ]);
    });

    it('returns sequential loop for concurrency 1', () => {
      expect(mode.getCrawlSequence()).toEqual(['runSequentialLoop']);
    });

    it('returns concurrent workers for concurrency > 1', () => {
      context = createTestContext({}, { concurrency: 4 });
      mode = new BasicCrawlMode(context);
      expect(mode.getCrawlSequence()).toEqual(['runConcurrentWorkers']);
    });
  });

  describe('run', () => {
    it('runs sequential loop for concurrency 1', async () => {
      const result = await mode.run();
      expect(context.crawler._runSequentialLoop).toHaveBeenCalled();
      expect(result.ok).toBe(true);
    });

    it('runs concurrent workers for concurrency > 1', async () => {
      context = createTestContext({}, { concurrency: 4 });
      mode = new BasicCrawlMode(context);
      const result = await mode.run();
      expect(context.crawler._runConcurrentWorkers).toHaveBeenCalled();
      expect(result.ok).toBe(true);
    });

    it('returns metrics on success', async () => {
      const result = await mode.run();
      expect(result.articlesFound).toBe(5);
      expect(result.pagesProcessed).toBe(10);
      expect(result.metrics.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('handles errors gracefully', async () => {
      context.crawler._runSequentialLoop.mockRejectedValue(new Error('Test error'));
      const result = await mode.run();
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('Test error');
    });
  });

  describe('telemetry', () => {
    it('returns expected telemetry data', () => {
      const data = mode.getTelemetryData();
      expect(data.mode).toBe('basic');
      expect(data.concurrent).toBe(false);
      expect(data.maxDepth).toBe(3);
    });
  });
});

describe('GazetteerCrawlMode', () => {
  let context;
  let mode;

  beforeEach(() => {
    context = createTestContext({}, { crawlType: 'gazetteer' });
    mode = new GazetteerCrawlMode(context);
  });

  describe('properties', () => {
    it('has correct modeId', () => {
      expect(mode.modeId).toBe('gazetteer');
    });

    it('has correct displayName', () => {
      expect(mode.displayName).toBe('Gazetteer/Geography Crawl');
    });

    it('requires init', () => {
      expect(mode.requiresInit()).toBe(true);
    });

    it('does not run planner', () => {
      expect(mode.shouldRunPlanner()).toBe(false);
    });

    it('does not load sitemaps', () => {
      expect(mode.shouldLoadSitemaps()).toBe(false);
    });
  });

  describe('init', () => {
    it('throws if gazetteerManager is missing', async () => {
      context.crawler.gazetteerManager = null;
      mode = new GazetteerCrawlMode(context);
      await expect(mode.init()).rejects.toThrow('GazetteerManager is required');
    });

    it('initializes successfully with gazetteerManager', async () => {
      await expect(mode.init()).resolves.not.toThrow();
    });

    it('sets up stage filter from config', async () => {
      context.config.gazetteerStageFilter = new Set(['seed', 'hub']);
      mode = new GazetteerCrawlMode(context);
      await mode.init();
      expect(mode.stageFilter).toBe(context.config.gazetteerStageFilter);
    });
  });

  describe('sequences', () => {
    it('returns simplified startup sequence', () => {
      expect(mode.getStartupSequence()).toEqual(['init', 'markStartupComplete']);
    });

    it('returns gazetteer crawl sequence', () => {
      expect(mode.getCrawlSequence()).toEqual(['runGazetteerMode']);
    });
  });

  describe('run', () => {
    it('delegates to gazetteerManager.run()', async () => {
      const result = await mode.run();
      expect(context.crawler.gazetteerManager.run).toHaveBeenCalled();
      expect(result.ok).toBe(true);
    });

    it('returns gazetteer-specific metrics', async () => {
      const result = await mode.run();
      expect(result.metrics.countriesProcessed).toBe(3);
      expect(result.metrics.hubsDiscovered).toBe(10);
    });
  });

  describe('configureServices', () => {
    it('sets isGazetteerMode flag', () => {
      mode.configureServices({});
      expect(context.crawler.isGazetteerMode).toBe(true);
    });

    it('sets gazetteerVariant', () => {
      mode.configureServices({});
      expect(context.crawler.gazetteerVariant).toBe('gazetteer');
    });
  });
});

describe('IntelligentCrawlMode', () => {
  let context;
  let mode;

  beforeEach(() => {
    context = createTestContext({}, { crawlType: 'intelligent' });
    mode = new IntelligentCrawlMode(context);
  });

  describe('properties', () => {
    it('has correct modeId', () => {
      expect(mode.modeId).toBe('intelligent');
    });

    it('has correct displayName', () => {
      expect(mode.displayName).toBe('Intelligent Crawl');
    });

    it('requires init', () => {
      expect(mode.requiresInit()).toBe(true);
    });

    it('runs planner', () => {
      expect(mode.shouldRunPlanner()).toBe(true);
    });
  });

  describe('init', () => {
    it('enables planner', async () => {
      await mode.init();
      expect(context.crawler.plannerEnabled).toBe(true);
    });

    it('calls _ensureIntelligentPlanRunner', async () => {
      await mode.init();
      expect(context.crawler._ensureIntelligentPlanRunner).toHaveBeenCalled();
    });

    it('sets up target hosts from config', async () => {
      context.config.intTargetHosts = ['example.com', 'test.org'];
      mode = new IntelligentCrawlMode(context);
      await mode.init();
      expect(mode.targetHosts).toBeInstanceOf(Set);
      expect(mode.targetHosts.has('example.com')).toBe(true);
    });
  });

  describe('sequences', () => {
    it('includes planner in startup sequence', () => {
      expect(mode.getStartupSequence()).toContain('planner');
    });

    it('uses concurrent workers', () => {
      expect(mode.getCrawlSequence()).toEqual(['runConcurrentWorkers']);
    });
  });

  describe('run', () => {
    it('runs concurrent workers', async () => {
      const result = await mode.run();
      expect(context.crawler._runConcurrentWorkers).toHaveBeenCalled();
      expect(result.ok).toBe(true);
    });

    it('returns planner metrics', async () => {
      const result = await mode.run();
      expect(result.metrics.plannerSeeds).toBe(20);
      expect(result.metrics.plannerHubsIdentified).toBe(5);
    });
  });

  describe('onComplete', () => {
    it('emits telemetry on success', async () => {
      const result = { ok: true, pagesProcessed: 100, metrics: {} };
      await mode.onComplete(result);
      expect(context.crawler.telemetry.milestoneOnce).toHaveBeenCalledWith(
        'intelligent:complete',
        expect.any(Object)
      );
    });

    it('saves plan summary', async () => {
      const result = { ok: true, metrics: {} };
      await mode.onComplete(result);
      expect(context.crawler.intelligentPlanRunner.savePlanSummary).toHaveBeenCalled();
    });
  });

  describe('configureServices', () => {
    it('enables planner', () => {
      mode.configureServices({});
      expect(context.crawler.plannerEnabled).toBe(true);
    });
  });
});

describe('createModeStrategy', () => {
  it('creates mode via factory function', () => {
    const context = createTestContext();
    const mode = createModeStrategy('basic', context);
    expect(mode).toBeInstanceOf(BasicCrawlMode);
  });

  it('maps to correct mode types', () => {
    const context = createTestContext();
    expect(createModeStrategy('basic', context)).toBeInstanceOf(BasicCrawlMode);
    expect(createModeStrategy('gazetteer', context)).toBeInstanceOf(GazetteerCrawlMode);
    expect(createModeStrategy('intelligent', context)).toBeInstanceOf(IntelligentCrawlMode);
  });
});
