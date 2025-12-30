'use strict';

/**
 * SelfHealingService Test Suite
 * 
 * Tests for the self-healing error recovery system.
 */

const {
  SelfHealingService,
  DiagnosticEngine,
  RemediationStrategies,
  HealingReport,
  FailureTypes
} = require('../../../src/crawler/healing');

// Mock dependencies
const createMockLogger = () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
});

const createMockProxyManager = () => ({
  isEnabled: jest.fn().mockReturnValue(true),
  getProxy: jest.fn().mockReturnValue({ name: 'proxy1', url: 'http://proxy1:8080' }),
  getAvailableProxyNames: jest.fn().mockReturnValue(['proxy1', 'proxy2']),
  recordFailure: jest.fn(),
  recordSuccess: jest.fn()
});

const createMockRateLimitTracker = () => ({
  recordRateLimit: jest.fn().mockReturnValue(5000),
  recordFailure: jest.fn(),
  recordSuccess: jest.fn(),
  getDelay: jest.fn().mockReturnValue(1000),
  setInterval: jest.fn()
});

const createMockPuppeteerDomainManager = () => ({
  addDomain: jest.fn(),
  learnDomain: jest.fn(),
  isDomain: jest.fn().mockReturnValue(false)
});

const createMockDomainHealthTracker = () => ({
  pauseDomain: jest.fn(),
  flagForReview: jest.fn(),
  isHealthy: jest.fn().mockReturnValue(true)
});

const createMockTemplateLearner = () => ({
  queueForRelearning: jest.fn()
});

describe('DiagnosticEngine', () => {
  let engine;
  let logger;

  beforeEach(() => {
    logger = createMockLogger();
    engine = new DiagnosticEngine({ logger });
  });

  describe('FailureTypes', () => {
    test('should expose all failure type constants', () => {
      expect(FailureTypes.STALE_PROXY).toBe('STALE_PROXY');
      expect(FailureTypes.LAYOUT_CHANGE).toBe('LAYOUT_CHANGE');
      expect(FailureTypes.RATE_LIMITED).toBe('RATE_LIMITED');
      expect(FailureTypes.DNS_FAILURE).toBe('DNS_FAILURE');
      expect(FailureTypes.CONTENT_BLOCK).toBe('CONTENT_BLOCK');
      expect(FailureTypes.SOFT_BLOCK).toBe('SOFT_BLOCK');
      expect(FailureTypes.CONNECTION_RESET).toBe('CONNECTION_RESET');
      expect(FailureTypes.TIMEOUT).toBe('TIMEOUT');
      expect(FailureTypes.SSL_ERROR).toBe('SSL_ERROR');
      expect(FailureTypes.UNKNOWN).toBe('UNKNOWN');
    });
  });

  describe('diagnose - RATE_LIMITED', () => {
    test('should diagnose 429 status code as RATE_LIMITED', () => {
      const error = new Error('Too Many Requests');
      const context = { statusCode: 429, domain: 'example.com' };
      
      const result = engine.diagnose(error, context);
      
      expect(result.type).toBe(FailureTypes.RATE_LIMITED);
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
      expect(result.evidence.statusMatch).toBe(true);
    });

    test('should diagnose rate limit body patterns', () => {
      const error = new Error('Rate limit exceeded');
      const context = { 
        statusCode: 200, 
        body: 'You have exceeded the rate limit. Please slow down.',
        domain: 'example.com'
      };
      
      const result = engine.diagnose(error, context);
      
      expect(result.type).toBe(FailureTypes.RATE_LIMITED);
      expect(result.evidence.matchedPatterns.length).toBeGreaterThan(0);
    });

    test('should detect Retry-After header', () => {
      const error = new Error('Too Many Requests');
      const context = { 
        statusCode: 429, 
        headers: { 'retry-after': '60' },
        domain: 'example.com'
      };
      
      const result = engine.diagnose(error, context);
      
      expect(result.type).toBe(FailureTypes.RATE_LIMITED);
      expect(result.evidence.matchedHeaders).toContain('retry-after');
    });
  });

  describe('diagnose - DNS_FAILURE', () => {
    test('should diagnose ENOTFOUND as DNS_FAILURE', () => {
      const error = new Error('getaddrinfo ENOTFOUND example.com');
      error.code = 'ENOTFOUND';
      
      const result = engine.diagnose(error, { domain: 'example.com' });
      
      expect(result.type).toBe(FailureTypes.DNS_FAILURE);
      expect(result.confidence).toBeGreaterThanOrEqual(0.95);
    });

    test('should diagnose EAI_NONAME as DNS_FAILURE', () => {
      const error = new Error('DNS lookup failed');
      error.code = 'EAI_NONAME';
      
      const result = engine.diagnose(error, { domain: 'example.com' });
      
      expect(result.type).toBe(FailureTypes.DNS_FAILURE);
    });

    test('should detect DNS-related error messages', () => {
      const error = new Error('Failed to resolve hostname');
      
      const result = engine.diagnose(error, { domain: 'example.com' });
      
      expect(result.type).toBe(FailureTypes.DNS_FAILURE);
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe('diagnose - CONTENT_BLOCK', () => {
    test('should diagnose JavaScript required page', () => {
      const error = new Error('Empty content');
      const context = { 
        statusCode: 200, 
        body: '<html><body>Please enable JavaScript to continue</body></html>',
        domain: 'example.com'
      };
      
      const result = engine.diagnose(error, context);
      
      expect(result.type).toBe(FailureTypes.CONTENT_BLOCK);
      expect(result.evidence.matchedPatterns.length).toBeGreaterThan(0);
    });

    test('should diagnose noscript tag presence', () => {
      const error = new Error('Content issue');
      const context = { 
        statusCode: 200, 
        body: '<html><noscript>This page requires JavaScript</noscript></html>',
        domain: 'example.com'
      };
      
      const result = engine.diagnose(error, context);
      
      expect(result.type).toBe(FailureTypes.CONTENT_BLOCK);
    });
  });

  describe('diagnose - SOFT_BLOCK', () => {
    test('should diagnose CAPTCHA page', () => {
      const error = new Error('Blocked');
      const context = { 
        statusCode: 403, 
        body: '<html><body>Please complete the CAPTCHA to continue</body></html>',
        domain: 'example.com'
      };
      
      const result = engine.diagnose(error, context);
      
      expect(result.type).toBe(FailureTypes.SOFT_BLOCK);
      expect(result.evidence.matchedPatterns.length).toBeGreaterThan(0);
    });

    test('should diagnose Cloudflare challenge', () => {
      const error = new Error('Blocked');
      const context = { 
        statusCode: 503, 
        body: 'Checking your browser before accessing cloudflare...',
        domain: 'example.com'
      };
      
      const result = engine.diagnose(error, context);
      
      expect(result.type).toBe(FailureTypes.SOFT_BLOCK);
    });

    test('should diagnose recaptcha', () => {
      const error = new Error('Verification required');
      const context = { 
        statusCode: 200, 
        body: '<div class="g-recaptcha">Verify you are human</div>',
        domain: 'example.com'
      };
      
      const result = engine.diagnose(error, context);
      
      expect(result.type).toBe(FailureTypes.SOFT_BLOCK);
    });
  });

  describe('diagnose - STALE_PROXY', () => {
    test('should diagnose consecutive 403 errors with proxy', () => {
      // Simulate 5+ consecutive errors
      for (let i = 0; i < 6; i++) {
        engine.diagnose(new Error('Forbidden'), { 
          domain: 'test.com', 
          statusCode: 403,
          proxyName: 'proxy1'
        });
      }
      
      const result = engine.diagnose(new Error('Forbidden'), { 
        domain: 'test.com', 
        statusCode: 403,
        proxyName: 'proxy1'
      });
      
      expect(result.type).toBe(FailureTypes.STALE_PROXY);
    });

    test('should diagnose proxy authentication error (407)', () => {
      const error = new Error('Proxy Authentication Required');
      const context = { 
        statusCode: 407, 
        proxyName: 'proxy1',
        domain: 'example.com'
      };
      
      const result = engine.diagnose(error, context);
      
      expect(result.type).toBe(FailureTypes.STALE_PROXY);
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });
  });

  describe('diagnose - LAYOUT_CHANGE', () => {
    test('should diagnose confidence drop > 30%', () => {
      const error = new Error('Low confidence');
      const context = { 
        previousConfidence: 0.9, 
        currentConfidence: 0.5, // 44% drop
        domain: 'example.com'
      };
      
      const result = engine.diagnose(error, context);
      
      expect(result.type).toBe(FailureTypes.LAYOUT_CHANGE);
      expect(result.evidence.dropPercent).toBeDefined();
    });

    test('should not diagnose small confidence drop', () => {
      const error = new Error('Slight variation');
      const context = { 
        previousConfidence: 0.9, 
        currentConfidence: 0.8, // 11% drop
        domain: 'example.com'
      };
      
      const result = engine.diagnose(error, context);
      
      expect(result.type).not.toBe(FailureTypes.LAYOUT_CHANGE);
    });
  });

  describe('diagnose - CONNECTION_RESET', () => {
    test('should diagnose ECONNRESET', () => {
      const error = new Error('Connection reset');
      error.code = 'ECONNRESET';
      
      const result = engine.diagnose(error, { domain: 'example.com' });
      
      expect(result.type).toBe(FailureTypes.CONNECTION_RESET);
    });

    test('should diagnose EPIPE', () => {
      const error = new Error('Broken pipe');
      error.code = 'EPIPE';
      
      const result = engine.diagnose(error, { domain: 'example.com' });
      
      expect(result.type).toBe(FailureTypes.CONNECTION_RESET);
    });
  });

  describe('diagnose - TIMEOUT', () => {
    test('should diagnose ETIMEDOUT', () => {
      const error = new Error('Connection timed out');
      error.code = 'ETIMEDOUT';
      
      const result = engine.diagnose(error, { domain: 'example.com' });
      
      expect(result.type).toBe(FailureTypes.TIMEOUT);
    });

    test('should diagnose timeout in error message', () => {
      const error = new Error('Request timed out after 30000ms');
      
      const result = engine.diagnose(error, { domain: 'example.com' });
      
      expect(result.type).toBe(FailureTypes.TIMEOUT);
    });
  });

  describe('diagnose - SSL_ERROR', () => {
    test('should diagnose certificate expired', () => {
      const error = new Error('Certificate has expired');
      error.code = 'CERT_HAS_EXPIRED';
      
      const result = engine.diagnose(error, { domain: 'example.com' });
      
      expect(result.type).toBe(FailureTypes.SSL_ERROR);
    });

    test('should diagnose self-signed certificate', () => {
      const error = new Error('Self-signed certificate');
      error.code = 'DEPTH_ZERO_SELF_SIGNED_CERT';
      
      const result = engine.diagnose(error, { domain: 'example.com' });
      
      expect(result.type).toBe(FailureTypes.SSL_ERROR);
    });
  });

  describe('getPatterns', () => {
    test('should return detection patterns', () => {
      const patterns = engine.getPatterns();
      
      expect(patterns).toHaveProperty(FailureTypes.RATE_LIMITED);
      expect(patterns).toHaveProperty(FailureTypes.DNS_FAILURE);
      expect(patterns[FailureTypes.RATE_LIMITED].statusCodes).toContain(429);
    });
  });

  describe('domain tracking', () => {
    test('should track consecutive errors per domain', () => {
      engine.diagnose(new Error('Error 1'), { domain: 'test.com', statusCode: 500 });
      engine.diagnose(new Error('Error 2'), { domain: 'test.com', statusCode: 500 });
      
      const state = engine.getDomainErrorState('test.com');
      
      expect(state.count).toBe(2);
    });

    test('should reset domain tracking', () => {
      engine.diagnose(new Error('Error'), { domain: 'test.com', statusCode: 500 });
      engine.resetDomainTracking('test.com');
      
      const state = engine.getDomainErrorState('test.com');
      
      expect(state).toBeNull();
    });
  });
});

describe('RemediationStrategies', () => {
  let strategies;
  let logger;

  beforeEach(() => {
    logger = createMockLogger();
    strategies = new RemediationStrategies({ logger });
  });

  describe('getStrategy', () => {
    test('should return strategy for known failure type', () => {
      const strategy = strategies.getStrategy(FailureTypes.RATE_LIMITED);
      
      expect(strategy).toBeDefined();
      expect(typeof strategy).toBe('function');
    });

    test('should return UNKNOWN strategy for unknown type', () => {
      const strategy = strategies.getStrategy('NONEXISTENT_TYPE');
      
      expect(strategy).toBeDefined();
    });

    test('should list available strategies', () => {
      const available = strategies.getAvailableStrategies();
      
      expect(available).toContain(FailureTypes.RATE_LIMITED);
      expect(available).toContain(FailureTypes.DNS_FAILURE);
      expect(available).toContain(FailureTypes.STALE_PROXY);
    });
  });

  describe('apply - STALE_PROXY', () => {
    test('should rotate proxy on stale proxy', async () => {
      const proxyManager = createMockProxyManager();
      
      const result = await strategies.apply(FailureTypes.STALE_PROXY, 'example.com', {
        proxyManager,
        proxyName: 'proxy1',
        diagnosis: { evidence: { statusCode: 403 } }
      });
      
      expect(result.success).toBe(true);
      expect(result.action).toBe('rotate_proxy');
      expect(result.retry).toBe(true);
      expect(proxyManager.recordFailure).toHaveBeenCalledWith('proxy1', expect.any(Object));
    });

    test('should fail if no proxy manager', async () => {
      const result = await strategies.apply(FailureTypes.STALE_PROXY, 'example.com', {
        proxyName: 'proxy1'
      });
      
      expect(result.success).toBe(false);
      expect(result.retry).toBe(false);
    });
  });

  describe('apply - RATE_LIMITED', () => {
    test('should increase delay via tracker', async () => {
      const rateLimitTracker = createMockRateLimitTracker();
      
      const result = await strategies.apply(FailureTypes.RATE_LIMITED, 'example.com', {
        rateLimitTracker,
        diagnosis: { evidence: { statusCode: 429 } }
      });
      
      expect(result.success).toBe(true);
      expect(result.action).toBe('increase_delay');
      expect(result.retry).toBe(true);
      expect(result.delayMs).toBeGreaterThan(0);
      expect(rateLimitTracker.recordRateLimit).toHaveBeenCalled();
    });

    test('should suggest delay without tracker', async () => {
      const result = await strategies.apply(FailureTypes.RATE_LIMITED, 'example.com', {});
      
      expect(result.success).toBe(true);
      expect(result.retry).toBe(true);
      expect(result.delayMs).toBeGreaterThan(0);
    });
  });

  describe('apply - DNS_FAILURE', () => {
    test('should pause domain on DNS failure', async () => {
      const domainHealthTracker = createMockDomainHealthTracker();
      
      const result = await strategies.apply(FailureTypes.DNS_FAILURE, 'example.com', {
        domainHealthTracker
      });
      
      expect(result.success).toBe(true);
      expect(result.action).toBe('pause_domain');
      expect(result.retry).toBe(false);
      expect(domainHealthTracker.pauseDomain).toHaveBeenCalled();
    });
  });

  describe('apply - CONTENT_BLOCK', () => {
    test('should upgrade to Puppeteer', async () => {
      const puppeteerDomainManager = createMockPuppeteerDomainManager();
      
      const result = await strategies.apply(FailureTypes.CONTENT_BLOCK, 'example.com', {
        puppeteerDomainManager
      });
      
      expect(result.success).toBe(true);
      expect(result.action).toBe('upgrade_to_puppeteer');
      expect(result.retry).toBe(true);
      expect(puppeteerDomainManager.addDomain).toHaveBeenCalled();
    });
  });

  describe('apply - SOFT_BLOCK', () => {
    test('should route through proxy and flag for review', async () => {
      const proxyManager = createMockProxyManager();
      const domainHealthTracker = createMockDomainHealthTracker();
      
      const result = await strategies.apply(FailureTypes.SOFT_BLOCK, 'example.com', {
        proxyManager,
        domainHealthTracker,
        diagnosis: { evidence: { matchedPatterns: ['captcha'] } }
      });
      
      expect(result.action).toBe('route_through_proxy_and_flag');
      expect(result.details.flagged).toBe(true);
      expect(domainHealthTracker.flagForReview).toHaveBeenCalled();
    });
  });

  describe('apply - LAYOUT_CHANGE', () => {
    test('should queue for template relearning', async () => {
      const templateLearner = createMockTemplateLearner();
      
      const result = await strategies.apply(FailureTypes.LAYOUT_CHANGE, 'example.com', {
        templateLearner,
        diagnosis: { evidence: { previousConfidence: 0.9, currentConfidence: 0.5 } }
      });
      
      expect(result.success).toBe(true);
      expect(result.action).toBe('queue_template_relearn');
      expect(result.retry).toBe(false);
      expect(templateLearner.queueForRelearning).toHaveBeenCalled();
    });
  });

  describe('registerStrategy', () => {
    test('should register custom strategy', async () => {
      const customStrategy = jest.fn().mockResolvedValue({
        success: true,
        action: 'custom_action',
        retry: true
      });
      
      strategies.registerStrategy('CUSTOM_TYPE', customStrategy);
      
      const result = await strategies.apply('CUSTOM_TYPE', 'example.com', {});
      
      expect(result.action).toBe('custom_action');
      expect(customStrategy).toHaveBeenCalled();
    });
  });
});

describe('HealingReport', () => {
  let report;
  let logger;

  beforeEach(() => {
    logger = createMockLogger();
    report = new HealingReport({ logger });
  });

  describe('record', () => {
    test('should record healing event', async () => {
      const diagnosis = { type: FailureTypes.RATE_LIMITED, confidence: 0.95 };
      const remediation = { action: 'increase_delay', success: true };
      
      const event = await report.record('example.com', diagnosis, remediation, true);
      
      expect(event.domain).toBe('example.com');
      expect(event.failureType).toBe(FailureTypes.RATE_LIMITED);
      expect(event.success).toBe(true);
    });

    test('should update in-memory stats', async () => {
      await report.record('example.com', 
        { type: FailureTypes.RATE_LIMITED, confidence: 0.9 },
        { success: true },
        true
      );
      
      const stats = await report.getStats();
      
      expect(stats.total).toBe(1);
      expect(stats.successful).toBe(1);
    });

    test('should emit healing event', async () => {
      const listener = jest.fn();
      report.on('healing', listener);
      
      await report.record('example.com', 
        { type: FailureTypes.DNS_FAILURE, confidence: 0.99 },
        { success: true },
        true
      );
      
      expect(listener).toHaveBeenCalled();
    });
  });

  describe('getRecent', () => {
    test('should return recent events in order', async () => {
      await report.record('a.com', { type: 'A' }, {}, true);
      await report.record('b.com', { type: 'B' }, {}, true);
      await report.record('c.com', { type: 'C' }, {}, true);
      
      const recent = await report.getRecent(2);
      
      expect(recent.length).toBe(2);
      expect(recent[0].domain).toBe('c.com');
      expect(recent[1].domain).toBe('b.com');
    });
  });

  describe('getByDomain', () => {
    test('should filter by domain', async () => {
      await report.record('a.com', { type: 'A' }, {}, true);
      await report.record('b.com', { type: 'B' }, {}, true);
      await report.record('a.com', { type: 'A2' }, {}, false);
      
      const events = await report.getByDomain('a.com');
      
      expect(events.length).toBe(2);
      expect(events.every(e => e.domain === 'a.com')).toBe(true);
    });
  });

  describe('getByType', () => {
    test('should filter by failure type', async () => {
      await report.record('a.com', { type: FailureTypes.RATE_LIMITED }, {}, true);
      await report.record('b.com', { type: FailureTypes.DNS_FAILURE }, {}, true);
      await report.record('c.com', { type: FailureTypes.RATE_LIMITED }, {}, false);
      
      const events = await report.getByType(FailureTypes.RATE_LIMITED);
      
      expect(events.length).toBe(2);
      expect(events.every(e => e.failureType === FailureTypes.RATE_LIMITED)).toBe(true);
    });
  });

  describe('getStats', () => {
    test('should calculate success rate', async () => {
      await report.record('a.com', { type: 'A' }, {}, true);
      await report.record('b.com', { type: 'B' }, {}, true);
      await report.record('c.com', { type: 'C' }, {}, false);
      
      const stats = await report.getStats();
      
      expect(stats.total).toBe(3);
      expect(stats.successful).toBe(2);
      expect(stats.failed).toBe(1);
      expect(stats.successRate).toBeCloseTo(0.667, 2);
    });

    test('should break down by failure type', async () => {
      await report.record('a.com', { type: FailureTypes.RATE_LIMITED }, {}, true);
      await report.record('b.com', { type: FailureTypes.RATE_LIMITED }, {}, true);
      await report.record('c.com', { type: FailureTypes.DNS_FAILURE }, {}, false);
      
      const stats = await report.getStats();
      
      const rateLimit = stats.byFailureType.find(t => t.failureType === FailureTypes.RATE_LIMITED);
      expect(rateLimit.count).toBe(2);
      expect(rateLimit.successful).toBe(2);
    });
  });

  describe('clear', () => {
    test('should clear all data', async () => {
      await report.record('a.com', { type: 'A' }, {}, true);
      
      report.clear();
      
      expect(report.size).toBe(0);
      const stats = await report.getStats();
      expect(stats.total).toBe(0);
    });
  });
});

describe('SelfHealingService', () => {
  let service;
  let logger;
  let proxyManager;
  let rateLimitTracker;
  let puppeteerDomainManager;
  let domainHealthTracker;
  let templateLearner;

  beforeEach(() => {
    logger = createMockLogger();
    proxyManager = createMockProxyManager();
    rateLimitTracker = createMockRateLimitTracker();
    puppeteerDomainManager = createMockPuppeteerDomainManager();
    domainHealthTracker = createMockDomainHealthTracker();
    templateLearner = createMockTemplateLearner();
    
    service = new SelfHealingService({
      logger,
      proxyManager,
      rateLimitTracker,
      puppeteerDomainManager,
      domainHealthTracker,
      templateLearner
    });
  });

  describe('handleFailure', () => {
    test('should diagnose and remediate rate limit', async () => {
      const error = new Error('Too Many Requests');
      const context = { statusCode: 429, url: 'http://example.com/page' };
      
      const result = await service.handleFailure('example.com', error, context);
      
      expect(result.success).toBe(true);
      expect(result.failureType).toBe(FailureTypes.RATE_LIMITED);
      expect(result.retry).toBe(true);
      expect(result.delayMs).toBeGreaterThan(0);
    });

    test('should diagnose and remediate DNS failure', async () => {
      const error = new Error('DNS lookup failed');
      error.code = 'ENOTFOUND';
      
      const result = await service.handleFailure('example.com', error, {});
      
      expect(result.failureType).toBe(FailureTypes.DNS_FAILURE);
      expect(result.retry).toBe(false);
      expect(domainHealthTracker.pauseDomain).toHaveBeenCalled();
    });

    test('should diagnose and remediate content block', async () => {
      const error = new Error('Empty content');
      const context = { 
        statusCode: 200, 
        body: 'Please enable JavaScript to continue'
      };
      
      const result = await service.handleFailure('example.com', error, context);
      
      expect(result.failureType).toBe(FailureTypes.CONTENT_BLOCK);
      expect(puppeteerDomainManager.addDomain).toHaveBeenCalled();
    });

    test('should emit events during healing', async () => {
      const diagnosisListener = jest.fn();
      const remediationListener = jest.fn();
      const healedListener = jest.fn();
      
      service.on('diagnosis', diagnosisListener);
      service.on('remediation', remediationListener);
      service.on('healed', healedListener);
      
      await service.handleFailure('example.com', new Error('Rate limit'), { statusCode: 429 });
      
      expect(diagnosisListener).toHaveBeenCalled();
      expect(remediationListener).toHaveBeenCalled();
      expect(healedListener).toHaveBeenCalled();
    });

    test('should return no retry when disabled', async () => {
      service.setEnabled(false);
      
      const result = await service.handleFailure('example.com', new Error('Error'), {});
      
      expect(result.success).toBe(false);
      expect(result.retry).toBe(false);
      expect(result.message).toContain('disabled');
    });
  });

  describe('getStats', () => {
    test('should track handled failures', async () => {
      await service.handleFailure('a.com', new Error('Rate limit'), { statusCode: 429 });
      await service.handleFailure('b.com', new Error('DNS fail'), { statusCode: 0 });
      
      const stats = await service.getStats();
      
      expect(stats.handledFailures).toBe(2);
      expect(stats.byFailureType).toBeDefined();
    });

    test('should calculate success rate', async () => {
      // Rate limit - should succeed
      await service.handleFailure('a.com', new Error('Rate limit'), { statusCode: 429 });
      // Another rate limit
      await service.handleFailure('b.com', new Error('Rate limit'), { statusCode: 429 });
      
      const stats = await service.getStats();
      
      expect(stats.successRate).toBeGreaterThan(0);
    });
  });

  describe('getHistory', () => {
    test('should return domain history', async () => {
      await service.handleFailure('example.com', new Error('Error 1'), { statusCode: 429 });
      await service.handleFailure('other.com', new Error('Error 2'), { statusCode: 429 });
      await service.handleFailure('example.com', new Error('Error 3'), { statusCode: 503 });
      
      const history = await service.getHistory('example.com');
      
      expect(history.length).toBe(2);
      expect(history.every(e => e.domain === 'example.com')).toBe(true);
    });
  });

  describe('hasRecentIssues', () => {
    test('should detect recent issues', async () => {
      await service.handleFailure('example.com', new Error('Error'), { statusCode: 429 });
      
      const hasIssues = await service.hasRecentIssues('example.com', 60);
      
      expect(hasIssues).toBe(true);
    });

    test('should return false for clean domain', async () => {
      const hasIssues = await service.hasRecentIssues('clean.com', 60);
      
      expect(hasIssues).toBe(false);
    });
  });

  describe('resetDomain', () => {
    test('should reset domain tracking in diagnostics', async () => {
      // Generate some errors to build up tracking
      await service.handleFailure('example.com', new Error('Error'), { statusCode: 500 });
      
      service.resetDomain('example.com');
      
      const state = service.diagnostics.getDomainErrorState('example.com');
      expect(state).toBeNull();
    });
  });

  describe('injectDependencies', () => {
    test('should inject dependencies after construction', () => {
      const bareService = new SelfHealingService({ logger });
      
      bareService.injectDependencies({
        proxyManager: createMockProxyManager(),
        rateLimitTracker: createMockRateLimitTracker()
      });
      
      expect(bareService.proxyManager).toBeDefined();
      expect(bareService.rateLimitTracker).toBeDefined();
    });
  });

  describe('FailureTypes static accessor', () => {
    test('should expose FailureTypes', () => {
      expect(SelfHealingService.FailureTypes).toBe(FailureTypes);
      expect(SelfHealingService.FailureTypes.RATE_LIMITED).toBe('RATE_LIMITED');
    });
  });
});

describe('Integration', () => {
  test('should handle complete healing workflow', async () => {
    const logger = createMockLogger();
    const proxyManager = createMockProxyManager();
    const rateLimitTracker = createMockRateLimitTracker();
    
    const service = new SelfHealingService({
      logger,
      proxyManager,
      rateLimitTracker
    });
    
    // Simulate a rate limit scenario
    const error = new Error('Too Many Requests');
    const context = {
      url: 'http://example.com/article',
      statusCode: 429,
      headers: { 'retry-after': '30' }
    };
    
    const result = await service.handleFailure('example.com', error, context);
    
    // Verify the complete workflow
    expect(result.failureType).toBe(FailureTypes.RATE_LIMITED);
    expect(result.diagnosis.confidence).toBeGreaterThan(0.9);
    expect(result.remediation.action).toBe('increase_delay');
    expect(result.retry).toBe(true);
    expect(result.delayMs).toBeGreaterThan(0);
    
    // Verify stats were updated
    const stats = await service.getStats();
    expect(stats.handledFailures).toBe(1);
    expect(stats.successfulRemediations).toBe(1);
    
    // Verify history was recorded
    const history = await service.getHistory('example.com');
    expect(history.length).toBe(1);
  });

  test('should chain multiple failure types correctly', async () => {
    const service = new SelfHealingService({
      logger: createMockLogger(),
      puppeteerDomainManager: createMockPuppeteerDomainManager(),
      domainHealthTracker: createMockDomainHealthTracker()
    });
    
    // First: DNS failure - no retry
    const dnsResult = await service.handleFailure('bad-dns.com', 
      Object.assign(new Error('DNS failed'), { code: 'ENOTFOUND' }), 
      {}
    );
    expect(dnsResult.failureType).toBe(FailureTypes.DNS_FAILURE);
    expect(dnsResult.retry).toBe(false);
    
    // Second: Content block - retry with Puppeteer
    const blockResult = await service.handleFailure('js-required.com',
      new Error('Empty'),
      { statusCode: 200, body: 'Enable JavaScript' }
    );
    expect(blockResult.failureType).toBe(FailureTypes.CONTENT_BLOCK);
    expect(blockResult.retry).toBe(true);
    
    // Verify both were tracked
    const stats = await service.getStats();
    expect(stats.handledFailures).toBe(2);
  });
});
