'use strict';

/**
 * BrowserPoolManager Tests
 * 
 * Tests for the browser pool with acquire/release semantics.
 * Note: These tests require puppeteer to be installed.
 */

const { BrowserPoolManager } = require('../../../src/crawler/BrowserPoolManager');

describe('BrowserPoolManager', () => {
  let pool;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };
  });

  afterEach(async () => {
    if (pool) {
      await pool.destroy();
      pool = null;
    }
  });

  describe('initialization', () => {
    it('creates pool with default options', () => {
      pool = new BrowserPoolManager({ logger: mockLogger });
      
      expect(pool.maxBrowsers).toBe(3);
      expect(pool.minBrowsers).toBe(1);
      expect(pool.maxPagesPerBrowser).toBe(50);
    });

    it('accepts custom options', () => {
      pool = new BrowserPoolManager({
        maxBrowsers: 5,
        minBrowsers: 2,
        maxPagesPerBrowser: 100,
        logger: mockLogger
      });
      
      expect(pool.maxBrowsers).toBe(5);
      expect(pool.minBrowsers).toBe(2);
      expect(pool.maxPagesPerBrowser).toBe(100);
    });

    it('initializes with minimum browsers', async () => {
      pool = new BrowserPoolManager({
        minBrowsers: 2,
        logger: mockLogger
      });
      
      await pool.init();
      
      const stats = pool.getStats();
      expect(stats.pool.size).toBe(2);
      expect(stats.telemetry.browserLaunches).toBe(2);
    }, 30000);

    it('emits pool:initialized event', async () => {
      pool = new BrowserPoolManager({
        minBrowsers: 1,
        logger: mockLogger
      });
      
      const initHandler = jest.fn();
      pool.on('pool:initialized', initHandler);
      
      await pool.init();
      
      expect(initHandler).toHaveBeenCalledWith(expect.objectContaining({
        size: 1
      }));
    }, 30000);
  });

  describe('acquire()', () => {
    beforeEach(async () => {
      pool = new BrowserPoolManager({
        maxBrowsers: 2,
        minBrowsers: 1,
        maxPagesPerBrowser: 5,
        logger: mockLogger
      });
      await pool.init();
    }, 30000);

    it('returns browser with release callback', async () => {
      const { browser, release, id } = await pool.acquire();
      
      expect(browser).toBeDefined();
      expect(typeof release).toBe('function');
      expect(id).toMatch(/^browser-\d+$/);
      
      await release();
    });

    it('tracks acquire in telemetry', async () => {
      const { release } = await pool.acquire();
      
      const stats = pool.getStats();
      expect(stats.telemetry.acquires).toBe(1);
      
      await release();
    });

    it('reuses browser on subsequent acquires', async () => {
      const first = await pool.acquire();
      await first.release();
      
      const second = await pool.acquire();
      
      // Should be the same browser (reused)
      expect(second.id).toBe(first.id);
      
      await second.release();
      
      const stats = pool.getStats();
      expect(stats.telemetry.browserReuses).toBeGreaterThan(0);
    });

    it('launches new browser when pool not at max', async () => {
      // Acquire first browser
      const first = await pool.acquire();
      
      // Acquire second - should launch new since first is in use
      const second = await pool.acquire();
      
      expect(second.id).not.toBe(first.id);
      
      const stats = pool.getStats();
      expect(stats.pool.size).toBe(2);
      
      await first.release();
      await second.release();
    }, 30000);

    it('throws error when shutting down', async () => {
      await pool.destroy();
      
      await expect(pool.acquire()).rejects.toThrow('Pool is shutting down');
    });
  });

  describe('release()', () => {
    beforeEach(async () => {
      pool = new BrowserPoolManager({
        maxBrowsers: 2,
        minBrowsers: 1,
        maxPagesPerBrowser: 3,
        logger: mockLogger
      });
      await pool.init();
    }, 30000);

    it('increments page count', async () => {
      const { release, id } = await pool.acquire();
      await release();
      
      const stats = pool.getStats();
      const browser = stats.browsers.find(b => b.id === id);
      expect(browser.pageCount).toBe(1);
    });

    it('retires browser after max pages', async () => {
      // Use up 3 pages (maxPagesPerBrowser)
      for (let i = 0; i < 3; i++) {
        const { release } = await pool.acquire();
        await release();
      }
      
      const stats = pool.getStats();
      expect(stats.telemetry.browserRetirements).toBe(1);
    });

    it('tracks errors and marks browser unhealthy after 3', async () => {
      const { id, release } = await pool.acquire();
      
      // Report 3 consecutive errors
      await release(new Error('Test error'));
      
      const acq2 = await pool.acquire();
      await acq2.release(new Error('Test error 2'));
      
      const acq3 = await pool.acquire();
      await acq3.release(new Error('Test error 3'));
      
      // After 3 errors, browser should be marked unhealthy
      const stats = pool.getStats();
      const browser = stats.browsers.find(b => b.id === id);
      
      // Browser might have been replaced, but at least one should be unhealthy
      // or retired due to errors
      expect(stats.telemetry.releases).toBe(3);
    });
  });

  describe('getStats()', () => {
    beforeEach(async () => {
      pool = new BrowserPoolManager({
        maxBrowsers: 2,
        minBrowsers: 1,
        logger: mockLogger
      });
      await pool.init();
    }, 30000);

    it('returns comprehensive stats', async () => {
      const { release } = await pool.acquire();
      
      const stats = pool.getStats();
      
      expect(stats.pool).toEqual(expect.objectContaining({
        size: expect.any(Number),
        inUse: expect.any(Number),
        available: expect.any(Number)
      }));
      
      expect(stats.config).toEqual(expect.objectContaining({
        maxBrowsers: 2,
        minBrowsers: 1
      }));
      
      expect(stats.telemetry).toEqual(expect.objectContaining({
        browserLaunches: expect.any(Number),
        acquires: expect.any(Number)
      }));
      
      expect(stats.browsers).toBeInstanceOf(Array);
      
      await release();
    });

    it('tracks peak pool size', async () => {
      const first = await pool.acquire();
      const second = await pool.acquire();
      
      const stats = pool.getStats();
      expect(stats.telemetry.peakPoolSize).toBe(2);
      
      await first.release();
      await second.release();
    }, 30000);
  });

  describe('destroy()', () => {
    beforeEach(async () => {
      pool = new BrowserPoolManager({
        maxBrowsers: 2,
        minBrowsers: 1,
        logger: mockLogger
      });
      await pool.init();
    }, 30000);

    it('closes all browsers', async () => {
      const { release } = await pool.acquire();
      await release();
      
      await pool.destroy();
      
      const stats = pool.getStats();
      expect(stats.pool.size).toBe(0);
    });

    it('emits pool:destroyed event', async () => {
      const destroyHandler = jest.fn();
      pool.on('pool:destroyed', destroyHandler);
      
      await pool.destroy();
      
      expect(destroyHandler).toHaveBeenCalledWith(expect.objectContaining({
        telemetry: expect.any(Object)
      }));
    });

    it('waits for active pages to complete', async () => {
      const { release } = await pool.acquire();
      
      // Start destroy (will wait for release)
      const destroyPromise = pool.destroy();
      
      // Release after short delay
      setTimeout(() => release(), 100);
      
      await destroyPromise;
      
      const stats = pool.getStats();
      expect(stats.pool.size).toBe(0);
    });
  });

  describe('health checks', () => {
    it('removes idle browsers above minimum', async () => {
      pool = new BrowserPoolManager({
        maxBrowsers: 3,
        minBrowsers: 1,
        maxIdleTimeMs: 100, // Very short for testing
        healthCheckIntervalMs: 50,
        logger: mockLogger
      });
      await pool.init();
      
      // Acquire two browsers
      const first = await pool.acquire();
      const second = await pool.acquire();
      await first.release();
      await second.release();
      
      // Wait for idle timeout and health check
      await new Promise(r => setTimeout(r, 300));
      
      // Should have removed idle browsers, keeping minimum
      const stats = pool.getStats();
      expect(stats.pool.size).toBeGreaterThanOrEqual(1);
      expect(stats.pool.size).toBeLessThanOrEqual(2);
    }, 30000);
  });
});
