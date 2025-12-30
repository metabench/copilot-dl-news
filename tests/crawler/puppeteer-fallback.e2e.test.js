'use strict';

/**
 * E2E Tests: Puppeteer Fallback on ECONNRESET
 * 
 * Tests the complete Puppeteer fallback flow:
 * 1. Network fetch fails with ECONNRESET
 * 2. Domain is in Puppeteer-enabled list
 * 3. Puppeteer fallback is triggered
 * 4. Telemetry events are emitted correctly
 */

const { FetchPipeline } = require('../../src/crawler/FetchPipeline');

// Track all telemetry events
function createEventTracker() {
  const events = [];
  return {
    events,
    handler: (eventName) => (data) => {
      events.push({ event: eventName, data, timestamp: Date.now() });
    },
    getByEvent: (name) => events.filter(e => e.event === name),
    hasEvent: (name) => events.some(e => e.event === name),
    clear: () => events.length = 0
  };
}

// Create ECONNRESET error like Node.js throws
function createEconnresetError() {
  const err = new Error('read ECONNRESET');
  err.code = 'ECONNRESET';
  err.errno = -104;
  err.syscall = 'read';
  return err;
}

// Mock PuppeteerFetcher that returns success
function createMockPuppeteerFetcher(options = {}) {
  const fetcher = {
    _telemetry: { browserLaunches: 0, browserReuses: 0, pagesFetched: 0, autoRestarts: 0, errorRestarts: 0 },
    _listeners: new Map(),
    
    async init() {
      this._telemetry.browserLaunches++;
      return this;
    },
    
    async fetch(url, opts = {}) {
      this._telemetry.pagesFetched++;
      this._telemetry.browserReuses++;
      
      // Emit fetch:success event
      const handlers = this._listeners.get('fetch:success') || [];
      handlers.forEach(h => h({ url, browserReused: true, sessionPageNumber: this._telemetry.pagesFetched }));
      
      // Return mock result (can be overridden)
      return options.fetchResult || {
        success: true,
        httpStatus: 200,
        html: '<html><body>Mock content</body></html>',
        contentLength: 42,
        finalUrl: url,
        durationMs: 150
      };
    },
    
    on(event, handler) {
      if (!this._listeners.has(event)) this._listeners.set(event, []);
      this._listeners.get(event).push(handler);
      return this;
    },
    
    emit(event, data) {
      const handlers = this._listeners.get(event) || [];
      handlers.forEach(h => h(data));
    },
    
    getTelemetry() {
      return { ...this._telemetry };
    },
    
    async destroy() {
      this._listeners.clear();
    }
  };
  
  return fetcher;
}

// Minimal pipeline options with mock fetch that fails
function createPipelineOpts(overrides = {}) {
  const logs = [];
  const logger = {
    info: (msg, meta) => logs.push({ level: 'info', msg, meta }),
    warn: (msg, meta) => logs.push({ level: 'warn', msg, meta }),
    error: (msg, meta) => logs.push({ level: 'error', msg, meta }),
    debug: (msg, meta) => logs.push({ level: 'debug', msg, meta })
  };
  
  return {
    // getUrlDecision must return a proper decision with analysis.normalized
    getUrlDecision: (url) => ({ 
      policy: 'network', 
      allow: true,
      analysis: { 
        normalized: url,
        invalid: false
      }
    }),
    normalizeUrl: url => url,
    isOnDomain: () => true,
    isAllowed: () => true,
    hasVisited: () => false,
    looksLikeArticle: () => true,
    getCachedArticle: async () => null,
    cache: null,
    preferCache: false,
    acquireDomainToken: async () => {},
    acquireRateToken: async () => {},
    rateLimitMs: 0,
    requestTimeoutMs: 5000,
    httpAgent: null,
    httpsAgent: null,
    currentDownloads: new Map(),
    emitProgress: () => {},
    note429: () => {},
    noteSuccess: () => {},
    recordError: () => {},
    handleConnectionReset: () => {},
    articleHeaderCache: new Map(),
    knownArticlesCache: new Map(),
    dbAdapter: null,
    parseRetryAfter: () => null,
    logger,
    _logs: logs,
    // Disable retries so ECONNRESET immediately triggers fallback
    networkRetryOptions: { maxAttempts: 1 },
    puppeteerFallback: {
      enabled: true,
      domains: ['theguardian.com', 'bloomberg.com'],
      onEconnreset: true
    },
    ...overrides
  };
}

describe('Puppeteer Fallback E2E', () => {
  let pipeline;
  let eventTracker;
  let mockPuppeteerFetcher;
  
  beforeEach(() => {
    eventTracker = createEventTracker();
    mockPuppeteerFetcher = createMockPuppeteerFetcher();
  });
  
  afterEach(async () => {
    if (pipeline) {
      try {
        await pipeline.destroyPuppeteer();
      } catch (e) {
        // Ignore cleanup errors
      }
      pipeline = null;
    }
    eventTracker.clear();
  });
  
  describe('Configuration', () => {
    test('should enable Puppeteer fallback by default', () => {
      const opts = createPipelineOpts();
      pipeline = new FetchPipeline(opts);
      
      expect(pipeline.puppeteerFallbackEnabled).toBe(true);
      expect(pipeline.puppeteerFallbackOnEconnreset).toBe(true);
    });
    
    test('should use custom domain list when provided', () => {
      const opts = createPipelineOpts({
        puppeteerFallback: {
          enabled: true,
          domains: ['custom.com', 'test.org'],
          onEconnreset: true
        }
      });
      pipeline = new FetchPipeline(opts);
      
      expect(pipeline.puppeteerFallbackDomains).toEqual(['custom.com', 'test.org']);
    });
    
    test('should disable fallback when enabled=false', () => {
      const opts = createPipelineOpts({
        puppeteerFallback: { enabled: false }
      });
      pipeline = new FetchPipeline(opts);
      
      expect(pipeline.puppeteerFallbackEnabled).toBe(false);
    });
  });
  
  describe('Domain Matching', () => {
    beforeEach(() => {
      const opts = createPipelineOpts();
      pipeline = new FetchPipeline(opts);
    });
    
    test('should match exact domain', () => {
      expect(pipeline._shouldUsePuppeteerFallback('theguardian.com')).toBe(true);
      expect(pipeline._shouldUsePuppeteerFallback('bloomberg.com')).toBe(true);
    });
    
    test('should match subdomain', () => {
      expect(pipeline._shouldUsePuppeteerFallback('www.theguardian.com')).toBe(true);
      expect(pipeline._shouldUsePuppeteerFallback('api.bloomberg.com')).toBe(true);
    });
    
    test('should reject non-matching domains', () => {
      expect(pipeline._shouldUsePuppeteerFallback('example.com')).toBe(false);
      expect(pipeline._shouldUsePuppeteerFallback('nottheguardian.com')).toBe(false);
    });
    
    test('should be case-insensitive', () => {
      expect(pipeline._shouldUsePuppeteerFallback('WWW.THEGUARDIAN.COM')).toBe(true);
      expect(pipeline._shouldUsePuppeteerFallback('Bloomberg.Com')).toBe(true);
    });
  });
  
  describe('ECONNRESET Fallback Trigger', () => {
    test('should trigger Puppeteer fallback on ECONNRESET for matching domain', async () => {
      let fetchCallCount = 0;
      
      // Mock fetch that fails with ECONNRESET
      const mockFetchFn = async () => {
        fetchCallCount++;
        throw createEconnresetError();
      };
      
      const opts = createPipelineOpts({ fetchFn: mockFetchFn });
      pipeline = new FetchPipeline(opts);
      
      // Inject mock PuppeteerFetcher
      pipeline._getPuppeteerFetcher = async () => {
        await mockPuppeteerFetcher.init();
        return mockPuppeteerFetcher;
      };
      
      // Wire up event tracking
      pipeline.on('fetch:success', eventTracker.handler('fetch:success'));
      pipeline.on('puppeteer:browser-launched', eventTracker.handler('puppeteer:browser-launched'));
      
      // Call fetch on a domain in the Puppeteer list (using correct { url } format)
      const result = await pipeline.fetch({ url: 'https://www.theguardian.com/news/article' });
      
      // Should have attempted regular fetch first
      expect(fetchCallCount).toBe(1);
      
      // Should have used Puppeteer fallback
      expect(mockPuppeteerFetcher._telemetry.pagesFetched).toBe(1);
      
      // Result should contain HTML from Puppeteer
      expect(result).toBeDefined();
      expect(result.html).toContain('Mock content');
    });
    
    test('should NOT trigger Puppeteer for non-matching domain on ECONNRESET', async () => {
      let fetchCallCount = 0;
      
      // Mock fetch that fails with ECONNRESET
      const mockFetchFn = async () => {
        fetchCallCount++;
        throw createEconnresetError();
      };
      
      const opts = createPipelineOpts({ fetchFn: mockFetchFn });
      pipeline = new FetchPipeline(opts);
      
      // Track if Puppeteer getter was called
      let puppeteerGetterCalled = false;
      pipeline._getPuppeteerFetcher = async () => {
        puppeteerGetterCalled = true;
        return mockPuppeteerFetcher;
      };
      
      // Call fetch on a domain NOT in the Puppeteer list
      const result = await pipeline.fetch({ url: 'https://example.com/article' });
      
      // Should return error result (FetchPipeline doesn't throw)
      expect(result.meta.status).toBe('error');
      expect(result.meta.error.code).toBe('ECONNRESET');
      
      // Should NOT have used Puppeteer
      expect(puppeteerGetterCalled).toBe(false);
    });
    
    test('should NOT trigger Puppeteer when onEconnreset=false', async () => {
      // Mock fetch that fails with ECONNRESET
      const mockFetchFn = async () => {
        throw createEconnresetError();
      };
      
      const opts = createPipelineOpts({
        fetchFn: mockFetchFn,
        puppeteerFallback: {
          enabled: true,
          domains: ['theguardian.com'],
          onEconnreset: false  // Disabled
        }
      });
      pipeline = new FetchPipeline(opts);
      
      // Track if Puppeteer getter was called
      let puppeteerGetterCalled = false;
      pipeline._getPuppeteerFetcher = async () => {
        puppeteerGetterCalled = true;
        return mockPuppeteerFetcher;
      };
      
      // Should return error without Puppeteer fallback
      const result = await pipeline.fetch({ url: 'https://www.theguardian.com/article' });
      
      expect(result.meta.status).toBe('error');
      expect(result.meta.error.code).toBe('ECONNRESET');
      expect(puppeteerGetterCalled).toBe(false);
    });
  });
  
  describe('Telemetry Events', () => {
    test('should emit fetch:success with fetchMethod=puppeteer-fallback', async () => {
      const mockFetchFn = async () => {
        throw createEconnresetError();
      };
      
      const opts = createPipelineOpts({ fetchFn: mockFetchFn });
      pipeline = new FetchPipeline(opts);
      
      // Inject mock PuppeteerFetcher
      pipeline._getPuppeteerFetcher = async () => {
        await mockPuppeteerFetcher.init();
        return mockPuppeteerFetcher;
      };
      
      // Track events
      pipeline.on('fetch:success', eventTracker.handler('fetch:success'));
      
      await pipeline.fetch({ url: 'https://www.theguardian.com/article' });
      
      // Check event was emitted
      expect(eventTracker.hasEvent('fetch:success')).toBe(true);
      
      const successEvents = eventTracker.getByEvent('fetch:success');
      expect(successEvents.length).toBeGreaterThan(0);
      
      const lastEvent = successEvents[successEvents.length - 1];
      expect(lastEvent.data.fetchMeta.fetchMethod).toBe('puppeteer-fallback');
    });
    
    test('should log Puppeteer attempt and success', async () => {
      const mockFetchFn = async () => {
        throw createEconnresetError();
      };
      
      const opts = createPipelineOpts({ fetchFn: mockFetchFn });
      pipeline = new FetchPipeline(opts);
      
      pipeline._getPuppeteerFetcher = async () => {
        await mockPuppeteerFetcher.init();
        return mockPuppeteerFetcher;
      };
      
      await pipeline.fetch({ url: 'https://www.theguardian.com/article' });
      
      // Check logs
      const logs = opts._logs;
      const puppeteerLogs = logs.filter(l => l.msg && l.msg.includes('[puppeteer]'));
      
      expect(puppeteerLogs.length).toBeGreaterThan(0);
      expect(puppeteerLogs.some(l => l.msg.includes('Attempting Puppeteer fallback'))).toBe(true);
      expect(puppeteerLogs.some(l => l.msg.includes('Success'))).toBe(true);
    });
  });
  
  describe('Puppeteer Telemetry Retrieval', () => {
    test('getPuppeteerTelemetry returns null when not initialized', () => {
      const opts = createPipelineOpts();
      pipeline = new FetchPipeline(opts);
      
      expect(pipeline.getPuppeteerTelemetry()).toBeNull();
    });
    
    test('getPuppeteerTelemetry returns stats after use', async () => {
      const mockFetchFn = async () => {
        throw createEconnresetError();
      };
      
      const opts = createPipelineOpts({ fetchFn: mockFetchFn });
      pipeline = new FetchPipeline(opts);
      
      pipeline._getPuppeteerFetcher = async () => {
        await mockPuppeteerFetcher.init();
        pipeline._puppeteerFetcher = mockPuppeteerFetcher;
        return mockPuppeteerFetcher;
      };
      
      await pipeline.fetch({ url: 'https://www.theguardian.com/article' });
      
      const telemetry = pipeline.getPuppeteerTelemetry();
      expect(telemetry).not.toBeNull();
      expect(telemetry.browserLaunches).toBe(1);
      expect(telemetry.pagesFetched).toBe(1);
    });
  });
});
