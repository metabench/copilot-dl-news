'use strict';

const Crawler = require('../Crawler');
const { CrawlerState } = require('../../CrawlerState');
const { StartupProgressTracker } = require('../../StartupProgressTracker');

jest.mock('../../CrawlerState');
jest.mock('../../StartupProgressTracker');

describe('Crawler base class', () => {
  let mockState;
  let mockStartupTracker;
  let createdCrawlers = [];

  beforeEach(() => {
    jest.clearAllMocks();
    createdCrawlers = [];
    
    mockState = {
      getStats: jest.fn().mockReturnValue({ pagesDownloaded: 0, queue: 0 })
    };
    CrawlerState.mockImplementation(() => mockState);
    
    mockStartupTracker = {
      startStage: jest.fn(),
      completeStage: jest.fn(),
      skipStage: jest.fn(),
      failStage: jest.fn(),
      markComplete: jest.fn()
    };
    StartupProgressTracker.mockImplementation(() => mockStartupTracker);
  });

  afterEach(async () => {
    // Clean up all created crawlers to prevent async handle leaks
    for (const crawler of createdCrawlers) {
      if (crawler.httpAgent) {
        crawler.httpAgent.destroy();
      }
      if (crawler.httpsAgent) {
        crawler.httpsAgent.destroy();
      }
    }
    createdCrawlers = [];
  });

  describe('constructor', () => {
    it('initializes core state and dependencies', () => {
      const crawler = new Crawler('https://example.com', { rateLimitMs: 500 });
      createdCrawlers.push(crawler);

      expect(crawler.startUrl).toBe('https://example.com');
      expect(crawler.rateLimitMs).toBe(500);
      expect(crawler.state).toBe(mockState);
      expect(crawler.startupTracker).toBe(mockStartupTracker);
      expect(crawler._paused).toBe(false);
      expect(crawler._abortRequested).toBe(false);
      expect(crawler.busyWorkers).toBe(0);
    });

    it('initializes HTTP agents with keepAlive', () => {
      const crawler = new Crawler('https://example.com', { maxSockets: 100 });
      createdCrawlers.push(crawler);

      expect(crawler.httpAgent).toBeDefined();
      expect(crawler.httpsAgent).toBeDefined();
      expect(crawler.httpAgent.options.keepAlive).toBe(true);
      expect(crawler.httpsAgent.options.keepAlive).toBe(true);
      expect(crawler.httpAgent.options.maxSockets).toBe(100);
    });

    it('uses default options when not provided', () => {
      const crawler = new Crawler('https://example.com');
      createdCrawlers.push(crawler);

      expect(crawler.rateLimitMs).toBe(1000);
      expect(crawler._progressEmitIntervalMs).toBe(5000);
    });
  });

  describe('pause/resume/abort control', () => {
    it('pauses and emits paused event', (done) => {
      const crawler = new Crawler('https://example.com');
      createdCrawlers.push(crawler);
      
      crawler.on('paused', () => {
        expect(crawler.isPaused()).toBe(true);
        done();
      });

      crawler.pause();
    });

    it('resumes and emits resumed event', (done) => {
      const crawler = new Crawler('https://example.com');
      createdCrawlers.push(crawler);
      crawler.pause();

      crawler.on('resumed', () => {
        expect(crawler.isPaused()).toBe(false);
        done();
      });

      crawler.resume();
    });

    it('requests abort and emits abort-requested event', (done) => {
      const crawler = new Crawler('https://example.com');
      createdCrawlers.push(crawler);

      crawler.on('abort-requested', () => {
        expect(crawler.isAbortRequested()).toBe(true);
        done();
      });

      crawler.requestAbort();
    });
  });

  describe('startup stage tracking', () => {
    it('tracks successful stage execution', async () => {
      const crawler = new Crawler('https://example.com');
      createdCrawlers.push(crawler);
      const stageFn = jest.fn().mockResolvedValue({ status: 'completed', message: 'Done' });

      const result = await crawler._trackStartupStage('init', 'Initialize', stageFn);

      expect(mockStartupTracker.startStage).toHaveBeenCalledWith('init', { label: 'Initialize' });
      expect(stageFn).toHaveBeenCalled();
      expect(mockStartupTracker.completeStage).toHaveBeenCalledWith('init', {
        label: 'Initialize',
        message: 'Done',
        details: undefined
      });
      expect(result).toEqual({ status: 'completed', message: 'Done' });
    });

    it('handles skipped stages', async () => {
      const crawler = new Crawler('https://example.com');
      createdCrawlers.push(crawler);
      const stageFn = jest.fn().mockResolvedValue({ status: 'skipped', message: 'Not needed' });

      await crawler._trackStartupStage('optional', 'Optional Stage', stageFn);

      expect(mockStartupTracker.skipStage).toHaveBeenCalledWith('optional', {
        label: 'Optional Stage',
        message: 'Not needed',
        details: undefined
      });
    });

    it('handles failed stages', async () => {
      const crawler = new Crawler('https://example.com');
      createdCrawlers.push(crawler);
      const error = new Error('Stage failed');
      const stageFn = jest.fn().mockRejectedValue(error);

      await expect(crawler._trackStartupStage('init', 'Initialize', stageFn))
        .rejects.toThrow('Stage failed');

      expect(mockStartupTracker.failStage).toHaveBeenCalledWith('init', error, {
        label: 'Initialize'
      });
    });

    it('skips stage when fn is not provided', async () => {
      const crawler = new Crawler('https://example.com');
      createdCrawlers.push(crawler);

      const result = await crawler._trackStartupStage('optional', 'Optional Stage', null);

      expect(mockStartupTracker.skipStage).toHaveBeenCalledWith('optional', {
        label: 'Optional Stage',
        message: 'No operation'
      });
      expect(result).toBeUndefined();
    });

    it('emits startup-stage events', (done) => {
      const crawler = new Crawler('https://example.com');
      createdCrawlers.push(crawler);
      const stageFn = jest.fn().mockResolvedValue({ status: 'completed' });
      const events = [];

      crawler.on('startup-stage', (event) => {
        events.push(event);
        
        if (events.length === 2) {
          expect(events[0]).toMatchObject({ status: 'started', id: 'init', label: 'Initialize' });
          expect(events[1]).toMatchObject({ status: 'completed', id: 'init', label: 'Initialize' });
          done();
        }
      });

      crawler._trackStartupStage('init', 'Initialize', stageFn);
    });

    it('marks startup complete', (done) => {
      const crawler = new Crawler('https://example.com');
      createdCrawlers.push(crawler);

      crawler.on('startup-complete', () => {
        expect(mockStartupTracker.markComplete).toHaveBeenCalled();
        done();
      });

      crawler._markStartupComplete();
    });
  });

  describe('progress emission', () => {
    it('emits progress with state stats', (done) => {
      const crawler = new Crawler('https://example.com');
      createdCrawlers.push(crawler);
      mockState.getStats.mockReturnValue({ pagesDownloaded: 10, queue: 5 });

      crawler.on('progress', (data) => {
        expect(data.stats).toEqual({ pagesDownloaded: 10, queue: 5 });
        expect(data.paused).toBe(false);
        expect(data.abortRequested).toBe(false);
        done();
      });

      crawler.emitProgress();
    });

    it('throttles progress events based on interval', () => {
      const crawler = new Crawler('https://example.com', { progressEmitIntervalMs: 1000 });
      createdCrawlers.push(crawler);
      const progressSpy = jest.fn();
      crawler.on('progress', progressSpy);

      crawler.emitProgress();
      crawler.emitProgress(); // Should be throttled
      crawler.emitProgress(); // Should be throttled

      expect(progressSpy).toHaveBeenCalledTimes(1);
    });

    it('emits startup progress', (done) => {
      const crawler = new Crawler('https://example.com');
      createdCrawlers.push(crawler);

      crawler.on('startup-progress', (data) => {
        expect(data.stage).toBe('init');
        expect(data.statusText).toBe('Starting...');
        done();
      });

      crawler._emitStartupProgress({ stage: 'init' }, 'Starting...');
    });
  });

  describe('rate limiting', () => {
    it('enforces minimum delay between requests', async () => {
      const crawler = new Crawler('https://example.com', { rateLimitMs: 100 });
      createdCrawlers.push(crawler);
      
      const start = Date.now();
      await crawler.acquireRateToken();
      await crawler.acquireRateToken();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(100);
    });

    it('allows immediate first request', async () => {
      const crawler = new Crawler('https://example.com', { rateLimitMs: 1000 });
      createdCrawlers.push(crawler);
      
      const start = Date.now();
      await crawler.acquireRateToken();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('worker orchestration', () => {
    it('tracks busy worker count', () => {
      const crawler = new Crawler('https://example.com');
      createdCrawlers.push(crawler);

      expect(crawler.busyWorkers).toBe(0);
      
      crawler._incrementBusyWorkers();
      expect(crawler.busyWorkers).toBe(1);
      
      crawler._incrementBusyWorkers();
      expect(crawler.busyWorkers).toBe(2);
      
      crawler._decrementBusyWorkers();
      expect(crawler.busyWorkers).toBe(1);
    });

    it('emits workers-idle when all workers finish', (done) => {
      const crawler = new Crawler('https://example.com');
      createdCrawlers.push(crawler);
      
      crawler.on('workers-idle', () => {
        expect(crawler.busyWorkers).toBe(0);
        done();
      });

      crawler._incrementBusyWorkers();
      crawler._incrementBusyWorkers();
      crawler._decrementBusyWorkers();
      crawler._decrementBusyWorkers();
    });
  });

  describe('lifecycle hooks', () => {
    it('provides init hook that subclasses can override', async () => {
      class TestCrawler extends Crawler {
        async init() {
          this.initialized = true;
        }
      }

      const crawler = new TestCrawler('https://example.com');
      createdCrawlers.push(crawler);
      await crawler.init();

      expect(crawler.initialized).toBe(true);
    });

    it('throws error if crawl() not implemented by subclass', async () => {
      const crawler = new Crawler('https://example.com');
      createdCrawlers.push(crawler);

      await expect(crawler.crawl()).rejects.toThrow('crawl() must be implemented by subclass');
    });
  });

  describe('cleanup', () => {
    it('destroys HTTP agents on dispose', async () => {
      const crawler = new Crawler('https://example.com');
      createdCrawlers.push(crawler);
      const httpDestroySpy = jest.spyOn(crawler.httpAgent, 'destroy');
      const httpsDestroySpy = jest.spyOn(crawler.httpsAgent, 'destroy');

      await crawler.dispose();

      expect(httpDestroySpy).toHaveBeenCalled();
      expect(httpsDestroySpy).toHaveBeenCalled();
    });

    it('closes database adapter if present', async () => {
      const crawler = new Crawler('https://example.com');
      createdCrawlers.push(crawler);
      const mockDbAdapter = { close: jest.fn() };
      crawler.dbAdapter = mockDbAdapter;

      await crawler.dispose();

      expect(mockDbAdapter.close).toHaveBeenCalled();
    });

    it('emits disposed event', (done) => {
      const crawler = new Crawler('https://example.com');
      createdCrawlers.push(crawler);

      crawler.on('disposed', () => {
        done();
      });

      crawler.dispose();
    });
  });

  describe('EventEmitter integration', () => {
    it('extends EventEmitter and supports event listeners', (done) => {
      const crawler = new Crawler('https://example.com');
      createdCrawlers.push(crawler);

      crawler.on('custom-event', (data) => {
        expect(data.test).toBe('value');
        done();
      });

      crawler.emit('custom-event', { test: 'value' });
    });
  });
});
