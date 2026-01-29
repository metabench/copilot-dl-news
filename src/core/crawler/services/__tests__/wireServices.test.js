'use strict';

const { wireServices, createTestContainer, ServiceContainer } = require('../wireServices');

describe('wireServices', () => {
  describe('basic wiring', () => {
    it('should create a ServiceContainer', () => {
      const container = wireServices({
        jobId: 'test-job',
        startUrl: 'https://example.com'
      });

      expect(container).toBeInstanceOf(ServiceContainer);
    });

    it('should register core services', () => {
      const container = wireServices({
        jobId: 'test-job',
        startUrl: 'https://example.com'
      });

      expect(container.has('config')).toBe(true);
      expect(container.has('context')).toBe(true);
    });

    it('should register service groups', () => {
      const container = wireServices({
        jobId: 'test-job',
        startUrl: 'https://example.com'
      });

      // Check group presence
      expect(container.listGroups()).toContain('core');
      expect(container.listGroups()).toContain('policy');
      expect(container.listGroups()).toContain('planning');
      expect(container.listGroups()).toContain('storage');
      expect(container.listGroups()).toContain('telemetry');
    });

    it('should provide frozen config', () => {
      const container = wireServices({
        jobId: 'test-job',
        startUrl: 'https://example.com',
        maxPages: 100
      });

      const config = container.get('config');

      expect(config.maxPages).toBe(100);
      expect(Object.isFrozen(config)).toBe(true);
    });
  });

  describe('CrawlContext', () => {
    it('should create context with config values', () => {
      const container = wireServices({
        jobId: 'my-job-123',
        startUrl: 'https://example.com',
        crawlType: 'intelligent',
        maxPages: 50,
        maxDepth: 3
      });

      const context = container.get('context');

      expect(context.jobId).toBe('my-job-123');
      expect(context.startUrl).toBe('https://example.com');
      expect(context.crawlType).toBe('intelligent');
      expect(context.maxPages).toBe(50);
      expect(context.maxDepth).toBe(3);
    });

    it('should use existing context if provided', () => {
      const CrawlContext = require('../../context/CrawlContext');
      const existingContext = CrawlContext.create({ jobId: 'existing' });

      const container = wireServices(
        { startUrl: 'https://example.com' },
        { existingContext }
      );

      expect(container.get('context')).toBe(existingContext);
    });
  });

  describe('policy services', () => {
    it('should register urlDecisionOrchestrator', () => {
      const container = wireServices({
        jobId: 'test-job',
        startUrl: 'https://example.com'
      });

      expect(container.has('urlDecisionOrchestrator')).toBe(true);
    });

    it('should register policy facade', () => {
      const container = wireServices({
        jobId: 'test-job',
        startUrl: 'https://example.com'
      });

      const policy = container.get('policy');

      expect(policy).toBeDefined();
      expect(typeof policy.canCrawl).toBe('function');
      expect(typeof policy.shouldQueue).toBe('function');
      expect(typeof policy.getDecision).toBe('function');
    });

    it('should configure orchestrator from config', () => {
      const container = wireServices({
        jobId: 'test-job',
        startUrl: 'https://example.com',
        stayOnDomain: true,
        maxDepth: 5,
        respectRobots: false
      });

      const orchestrator = container.get('urlDecisionOrchestrator');

      expect(orchestrator.config.stayOnDomain).toBe(true);
      expect(orchestrator.config.maxDepth).toBe(5);
      expect(orchestrator.config.respectRobots).toBe(false);
    });
  });

  describe('planning services', () => {
    it('should register planning facade', () => {
      const container = wireServices({
        jobId: 'test-job',
        startUrl: 'https://example.com'
      });

      const planning = container.get('planning');

      expect(planning).toBeDefined();
      expect(typeof planning.initialize).toBe('function');
      expect(typeof planning.getNextTarget).toBe('function');
    });

    it('should register milestone tracker', () => {
      const container = wireServices({
        jobId: 'test-job',
        startUrl: 'https://example.com'
      });

      expect(container.has('milestoneTracker')).toBe(true);
    });
  });

  describe('telemetry services', () => {
    it('should register telemetry facade', () => {
      const container = wireServices({
        jobId: 'test-job',
        startUrl: 'https://example.com'
      });

      const telemetry = container.get('telemetry');

      expect(telemetry).toBeDefined();
      expect(typeof telemetry.emit).toBe('function');
      expect(typeof telemetry.on).toBe('function');
    });

    it('should register eventBus', () => {
      const container = wireServices({
        jobId: 'test-job',
        startUrl: 'https://example.com'
      });

      const eventBus = container.get('eventBus');

      expect(eventBus).toBeDefined();
      expect(typeof eventBus.emit).toBe('function');
    });
  });

  describe('storage services', () => {
    it('should register cache', () => {
      const container = wireServices({
        jobId: 'test-job',
        startUrl: 'https://example.com'
      });

      const cache = container.get('cache');

      expect(cache).toBeDefined();
      expect(typeof cache.get).toBe('function');
      expect(typeof cache.set).toBe('function');
    });

    it('should use provided cache', () => {
      const customCache = {
        get: jest.fn(),
        set: jest.fn()
      };

      const container = wireServices(
        { startUrl: 'https://example.com' },
        { cache: customCache }
      );

      expect(container.get('cache')).toBe(customCache);
    });

    it('should register storage facade', () => {
      const container = wireServices({
        jobId: 'test-job',
        startUrl: 'https://example.com'
      });

      const storage = container.get('storage');

      expect(storage).toBeDefined();
      expect(typeof storage.cacheGet).toBe('function');
      expect(typeof storage.cacheSet).toBe('function');
    });
  });

  describe('coordination services', () => {
    it('should register retryCoordinator', () => {
      const container = wireServices({
        jobId: 'test-job',
        startUrl: 'https://example.com'
      });

      expect(container.has('retryCoordinator')).toBe(true);

      const coordinator = container.get('retryCoordinator');
      expect(typeof coordinator.shouldRetry).toBe('function');
    });

    it('should register sequenceRunner', () => {
      const container = wireServices({
        jobId: 'test-job',
        startUrl: 'https://example.com'
      });

      expect(container.has('sequenceRunner')).toBe(true);
    });
  });
});

describe('createTestContainer', () => {
  it('should create minimal container', () => {
    const container = createTestContainer();

    expect(container).toBeInstanceOf(ServiceContainer);
    expect(container.has('config')).toBe(true);
    expect(container.has('context')).toBe(true);
  });

  it('should accept config overrides', () => {
    const container = createTestContainer({
      config: { maxPages: 999 }
    });

    const config = container.get('config');
    expect(config.maxPages).toBe(999);
  });

  it('should accept service overrides', () => {
    const mockPolicy = { canCrawl: jest.fn() };

    const container = createTestContainer({
      policy: mockPolicy
    });

    expect(container.get('policy')).toBe(mockPolicy);
  });
});
