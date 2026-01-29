'use strict';

const ServiceContainer = require('./ServiceContainer');
const { registerPolicyServices } = require('./groups/PolicyServices');
const { registerPlanningServices } = require('./groups/PlanningServices');
const { registerProcessingServices } = require('./groups/ProcessingServices');
const { registerTelemetryServices } = require('./groups/TelemetryServices');
const { registerStorageServices } = require('./groups/StorageServices');

/**
 * Wire all crawler services into a container.
 *
 * Creates a fully configured ServiceContainer with all service groups
 * registered and ready for lazy instantiation.
 *
 * @param {Object} config - Crawler configuration
 * @param {string} config.jobId - Unique job identifier
 * @param {string} config.startUrl - Starting URL for the crawl
 * @param {string} [config.crawlType='basic'] - Crawl strategy type
 * @param {number} [config.maxDepth] - Maximum crawl depth
 * @param {number} [config.maxPages] - Maximum pages to crawl
 * @param {number} [config.maxRetries=3] - Maximum retry attempts
 * @param {string} [config.userAgent] - User agent string
 * @param {boolean} [config.respectRobots=true] - Respect robots.txt
 * @param {boolean} [config.stayOnDomain=true] - Stay on start domain
 *
 * @param {Object} [options] - Additional options
 * @param {Object} [options.db] - Pre-configured database adapter
 * @param {Object} [options.cache] - Pre-configured cache instance
 * @param {Object} [options.existingContext] - Existing CrawlContext to reuse
 *
 * @returns {ServiceContainer} Configured service container
 *
 * @example
 * const container = wireServices({
 *   jobId: 'crawl-123',
 *   startUrl: 'https://example.com',
 *   maxPages: 100
 * });
 *
 * const policy = container.get('policy');
 * const decision = await policy.getDecision('https://example.com/page');
 */
function wireServices(config, options = {}) {
  const container = new ServiceContainer();

  // ============================================================
  // CORE SERVICES
  // ============================================================

  // Configuration (available to all services)
  container.register('config', () => Object.freeze({ ...config }), { group: 'core' });

  // CrawlContext - central state management
  container.register('context', () => {
    if (options.existingContext) {
      return options.existingContext;
    }

    const CrawlContext = require('../context/CrawlContext');
    return CrawlContext.create({
      jobId: config.jobId || `job-${Date.now()}`,
      startUrl: config.startUrl,
      crawlType: config.crawlType || 'basic',
      maxDepth: config.maxDepth,
      maxPages: config.maxPages
    });
  }, { group: 'core' });

  // ============================================================
  // SERVICE GROUPS (order matters - dependencies first)
  // ============================================================

  // Storage services (cache, db, article storage)
  registerStorageServices(container, config, options);

  // Telemetry services (events, metrics, progress)
  registerTelemetryServices(container, config);

  // Policy services (robots, url decisions)
  registerPolicyServices(container, config);

  // Planning services (planner, seeds, milestones)
  registerPlanningServices(container, config);

  // ============================================================
  // COORDINATION SERVICES
  // ============================================================

  // Retry coordinator
  container.register('retryCoordinator', (c) => {
    const RetryCoordinator = require('../retry/RetryCoordinator');
    return new RetryCoordinator({
      context: c.get('context'),
      maxRetries: config.maxRetries ?? 3,
      network: {
        baseDelayMs: config.retryBaseDelay ?? 1000,
        maxDelayMs: config.retryMaxDelay ?? 30000
      },
      host: {
        maxErrors: config.hostMaxErrors ?? 5,
        lockoutMs: config.hostLockoutMs ?? 300000
      },
      domain: {
        requestsPerMinute: config.requestsPerMinute ?? 60,
        minDelayMs: config.minRequestDelay ?? 100
      }
    });
  }, { group: 'coordination', dependencies: ['context'] });

  // Processing services (depends on retryCoordinator and urlDecisionOrchestrator)
  registerProcessingServices(container, config);

  // Sequence runner
  container.register('sequenceRunner', (c) => {
    const { createSequenceRunner } = require('../sequence/SequenceRunner');
    const telemetry = c.get('telemetry');

    return createSequenceRunner({
      operations: c.tryGet('operations') || {},
      logger: console,
      telemetry: telemetry.forSequenceRunner()
    });
  }, { group: 'coordination', dependencies: ['telemetry'] });

  // ============================================================
  // VALIDATION
  // ============================================================

  // Validate dependencies after all registrations
  const validation = container.validateDependencies();
  if (!validation.valid) {
    const warnings = validation.missing
      .map(m => `${m.service} requires ${m.dependency}`)
      .join(', ');
    console.warn(`[wireServices] Missing dependencies: ${warnings}`);
  }

  return container;
}

/**
 * Create a minimal container for testing.
 *
 * @param {Object} [overrides] - Service overrides
 * @returns {ServiceContainer}
 */
function createTestContainer(overrides = {}) {
  const container = new ServiceContainer();

  // Minimal config
  container.register('config', () => ({
    jobId: 'test-job',
    startUrl: 'http://test.example.com',
    crawlType: 'basic',
    maxPages: 10,
    ...overrides.config
  }));

  // Minimal context
  container.register('context', () => {
    if (overrides.context) return overrides.context;

    const CrawlContext = require('../context/CrawlContext');
    return CrawlContext.create({
      jobId: 'test-job',
      startUrl: 'http://test.example.com'
    });
  });

  // Apply overrides
  for (const [name, factory] of Object.entries(overrides)) {
    if (name !== 'config' && name !== 'context') {
      if (typeof factory === 'function') {
        container.register(name, factory);
      } else {
        container.set(name, factory);
      }
    }
  }

  return container;
}

module.exports = {
  wireServices,
  createTestContainer,
  ServiceContainer
};
