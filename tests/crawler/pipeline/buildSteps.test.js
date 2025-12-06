/**
 * Tests for buildSteps - step builder factory
 */
const { buildSteps, getAvailableSteps, registerStepBuilder, STEP_BUILDERS } = require('../../../src/crawler/pipeline/buildSteps');
const { runPipeline } = require('../../../src/crawler/pipeline/runPipeline');

describe('buildSteps', () => {
  describe('step generation', () => {
    it('should return array of steps', () => {
      const steps = buildSteps({});
      
      expect(Array.isArray(steps)).toBe(true);
      expect(steps.length).toBeGreaterThan(0);
    });

    it('should include core validation steps', () => {
      const steps = buildSteps({});
      const stepIds = steps.map(s => s.id);
      
      expect(stepIds).toContain('validate-url');
    });

    it('should include fetch and parse steps', () => {
      const steps = buildSteps({});
      const stepIds = steps.map(s => s.id);
      
      expect(stepIds).toContain('fetch');
      expect(stepIds).toContain('parse-html');
    });
  });

  describe('conditional step inclusion', () => {
    it('should exclude robots check when validateRobots is false', () => {
      const steps = buildSteps({ validateRobots: false });
      const stepIds = steps.map(s => s.id);
      
      expect(stepIds).not.toContain('check-robots');
    });

    it('should include robots check when validateRobots is true', () => {
      const steps = buildSteps({ validateRobots: true });
      const stepIds = steps.map(s => s.id);
      
      expect(stepIds).toContain('check-robots');
    });

    it('should exclude cache step when preferCache is false', () => {
      const steps = buildSteps({ preferCache: false });
      const stepIds = steps.map(s => s.id);
      
      expect(stepIds).not.toContain('try-cache');
    });

    it('should include cache step when preferCache is true', () => {
      const steps = buildSteps({ preferCache: true });
      const stepIds = steps.map(s => s.id);
      
      expect(stepIds).toContain('try-cache');
    });

    it('should exclude article detection when structureOnly is true', () => {
      const steps = buildSteps({ structureOnly: true });
      const stepIds = steps.map(s => s.id);
      
      expect(stepIds).not.toContain('detect-article');
      expect(stepIds).not.toContain('save-article');
    });

    it('should exclude telemetry when enableTelemetry is false', () => {
      const steps = buildSteps({ enableTelemetry: false });
      const stepIds = steps.map(s => s.id);
      
      expect(stepIds).not.toContain('record-metrics');
    });
  });

  describe('handler integration', () => {
    it('should pass normalizer to normalize step', async () => {
      const normalizer = jest.fn(url => url.toLowerCase());
      
      const steps = buildSteps({}, { normalizer });
      const result = await runPipeline(steps, { url: 'HTTPS://EXAMPLE.COM' }, {});
      
      expect(result.ok).toBe(false); // Will fail at fetch (no fetcher)
      expect(normalizer).toHaveBeenCalledWith('HTTPS://EXAMPLE.COM');
    });

    it('should pass cache getter to cache step', async () => {
      const cacheGetter = jest.fn().mockResolvedValue({
        html: '<html><body>Cached</body></html>',
        crawledAt: new Date().toISOString(),
        source: 'cache'
      });
      
      const steps = buildSteps({ preferCache: true }, { cacheGetter });
      const ctx = { url: 'https://example.com' };
      const result = await runPipeline(steps, ctx, {});
      
      expect(cacheGetter).toHaveBeenCalled();
      expect(result.ctx.source).toBe('cache');
      expect(result.ctx.html).toBe('<html><body>Cached</body></html>');
    });

    it('should skip fetch when cache hit', async () => {
      const cacheGetter = jest.fn().mockResolvedValue({
        html: '<html></html>',
        source: 'cache'
      });
      const fetcher = jest.fn();
      
      const steps = buildSteps({ preferCache: true }, { cacheGetter, fetcher });
      await runPipeline(steps, { url: 'https://example.com' }, {});
      
      // Fetcher should not be called because cache was hit
      expect(fetcher).not.toHaveBeenCalled();
    });

    it('should call fetcher when cache miss', async () => {
      const cacheGetter = jest.fn().mockResolvedValue(null);
      const fetcher = jest.fn().mockResolvedValue({
        html: '<html><body>Fetched</body></html>',
        source: 'network',
        meta: {}
      });
      
      const steps = buildSteps({ preferCache: true }, { cacheGetter, fetcher });
      await runPipeline(steps, { url: 'https://example.com' }, {});
      
      expect(cacheGetter).toHaveBeenCalled();
      expect(fetcher).toHaveBeenCalled();
    });
  });

  describe('end-to-end execution', () => {
    it('should execute full pipeline with mocked handlers', async () => {
      const handlers = {
        normalizer: url => url.toLowerCase(),
        visitedChecker: () => false,
        policyChecker: () => ({ allow: true }),
        fetcher: jest.fn().mockResolvedValue({
          html: '<html><body><a href="/page2">Link</a></body></html>',
          source: 'network',
          meta: {}
        }),
        linkExtractor: ($, baseUrl) => [
          { url: new URL('/page2', baseUrl).href, type: 'nav' }
        ],
        enqueuer: jest.fn().mockReturnValue(true)
      };
      
      const steps = buildSteps({
        preferCache: false,
        validateRobots: false,
        enableTelemetry: false,
        structureOnly: true
      }, handlers);
      
      const result = await runPipeline(
        steps,
        { url: 'https://example.com/', depth: 0 },
        { logger: console }
      );
      
      expect(result.ok).toBe(true);
      expect(result.ctx.links).toHaveLength(1);
      expect(handlers.enqueuer).toHaveBeenCalled();
    });

    it('should stop on policy rejection', async () => {
      const handlers = {
        policyChecker: () => ({ allow: false, reason: 'domain-blocked' }),
        fetcher: jest.fn()
      };
      
      const steps = buildSteps({
        preferCache: false,
        validateRobots: false
      }, handlers);
      
      const result = await runPipeline(steps, { url: 'https://blocked.com' }, {});
      
      expect(result.ok).toBe(false);
      expect(result.abortedAt).toBe('check-policy');
      expect(handlers.fetcher).not.toHaveBeenCalled();
    });

    it('should stop on already-visited URL', async () => {
      const handlers = {
        visitedChecker: url => url.includes('visited'),
        fetcher: jest.fn()
      };
      
      const steps = buildSteps({
        preferCache: false,
        validateRobots: false
      }, handlers);
      
      const result = await runPipeline(steps, { url: 'https://example.com/visited' }, {});
      
      expect(result.ok).toBe(false);
      expect(result.abortedAt).toBe('check-visited');
      expect(handlers.fetcher).not.toHaveBeenCalled();
    });
  });
});

describe('getAvailableSteps', () => {
  it('should return list of step builder names', () => {
    const available = getAvailableSteps();
    
    expect(Array.isArray(available)).toBe(true);
    expect(available).toContain('validateUrl');
    expect(available).toContain('fetch');
    expect(available).toContain('parseHtml');
  });
});

describe('registerStepBuilder', () => {
  afterEach(() => {
    // Clean up registered custom step
    delete STEP_BUILDERS.customStep;
  });

  it('should allow registering custom step builders', () => {
    const customBuilder = (config) => {
      return { 
        id: 'custom-step',
        execute: async () => ({ ok: true }),
        label: 'Custom',
        optional: false
      };
    };
    
    registerStepBuilder('customStep', customBuilder);
    
    expect(getAvailableSteps()).toContain('customStep');
    expect(STEP_BUILDERS.customStep).toBe(customBuilder);
  });
});
