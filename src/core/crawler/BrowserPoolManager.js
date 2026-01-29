'use strict';

/**
 * BrowserPoolManager — Manages a pool of reusable browser instances
 * 
 * Provides acquire/release semantics for concurrent browser access,
 * health monitoring, and automatic lifecycle management.
 * 
 * Features:
 * - Pool of N browsers (configurable)
 * - acquire() returns least-used browser with release callback
 * - Health checks remove crashed browsers
 * - Automatic restart on errors
 * - Telemetry tracking for pool utilization
 * 
 * @module BrowserPoolManager
 */

const puppeteer = require('puppeteer');
const EventEmitter = require('events');

/**
 * Default Puppeteer launch options for stealth browsing
 */
const DEFAULT_LAUNCH_OPTIONS = {
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--disable-gpu',
    '--window-size=1920,1080'
  ]
};

/**
 * Default pool configuration
 */
const DEFAULT_POOL_OPTIONS = {
  maxBrowsers: 3,
  maxPagesPerBrowser: 50,
  maxIdleTimeMs: 60000,       // Remove idle browser after 1 minute
  healthCheckIntervalMs: 30000,
  minBrowsers: 1,             // Keep at least 1 browser warm
  launchTimeout: 30000,       // Browser launch timeout
  acquireTimeout: 10000       // Max time to wait for available browser
};

/**
 * @typedef {Object} PooledBrowser
 * @property {string} id - Unique browser ID
 * @property {Object} browser - Puppeteer browser instance
 * @property {number} pageCount - Pages fetched with this browser
 * @property {number} createdAt - Creation timestamp
 * @property {number} lastUsedAt - Last usage timestamp
 * @property {number} activePages - Currently active pages
 * @property {boolean} healthy - Health status
 * @property {number} consecutiveErrors - Consecutive error count
 */

class BrowserPoolManager extends EventEmitter {
  /**
   * @param {Object} [opts]
   * @param {number} [opts.maxBrowsers=3] - Maximum browsers in pool
   * @param {number} [opts.maxPagesPerBrowser=50] - Retire browser after N pages
   * @param {number} [opts.maxIdleTimeMs=60000] - Remove idle browsers after N ms
   * @param {number} [opts.healthCheckIntervalMs=30000] - Health check interval
   * @param {number} [opts.minBrowsers=1] - Minimum warm browsers
   * @param {Object} [opts.launchOptions] - Puppeteer launch options
   * @param {Object} [opts.logger] - Logger instance
   */
  constructor(opts = {}) {
    super();
    this.maxBrowsers = opts.maxBrowsers || DEFAULT_POOL_OPTIONS.maxBrowsers;
    this.maxPagesPerBrowser = opts.maxPagesPerBrowser || DEFAULT_POOL_OPTIONS.maxPagesPerBrowser;
    this.maxIdleTimeMs = opts.maxIdleTimeMs || DEFAULT_POOL_OPTIONS.maxIdleTimeMs;
    this.healthCheckIntervalMs = opts.healthCheckIntervalMs || DEFAULT_POOL_OPTIONS.healthCheckIntervalMs;
    this.minBrowsers = opts.minBrowsers || DEFAULT_POOL_OPTIONS.minBrowsers;
    this.launchTimeout = opts.launchTimeout || DEFAULT_POOL_OPTIONS.launchTimeout;
    this.acquireTimeout = opts.acquireTimeout || DEFAULT_POOL_OPTIONS.acquireTimeout;
    this.launchOptions = { ...DEFAULT_LAUNCH_OPTIONS, ...opts.launchOptions };
    this.logger = opts.logger || console;
    
    /** @type {Map<string, PooledBrowser>} */
    this._pool = new Map();
    
    /** @type {Set<string>} - IDs of browsers currently in use */
    this._inUse = new Set();
    
    this._idCounter = 0;
    this._healthCheckTimer = null;
    this._shuttingDown = false;
    
    // Telemetry
    this._telemetry = {
      browserLaunches: 0,
      browserReuses: 0,
      browserRetirements: 0,
      browserCrashes: 0,
      acquires: 0,
      releases: 0,
      healthChecksPassed: 0,
      healthChecksFailed: 0,
      waitTimeouts: 0,
      peakPoolSize: 0
    };
  }

  /**
   * Initialize the pool with minimum browsers
   * @returns {Promise<BrowserPoolManager>}
   */
  async init() {
    this.logger.info(`[BrowserPoolManager] Initializing pool (min=${this.minBrowsers}, max=${this.maxBrowsers})`);
    
    // Launch minimum browsers in parallel
    const launchPromises = [];
    for (let i = 0; i < this.minBrowsers; i++) {
      launchPromises.push(this._launchBrowser());
    }
    
    await Promise.all(launchPromises);
    this._startHealthCheck();
    
    this.emit('pool:initialized', { size: this._pool.size });
    return this;
  }

  /**
   * Launch a new browser and add to pool
   * @private
   * @returns {Promise<PooledBrowser>}
   */
  async _launchBrowser() {
    const id = `browser-${++this._idCounter}`;
    const startTime = Date.now();
    
    try {
      // Launch with timeout
      const browser = await Promise.race([
        puppeteer.launch(this.launchOptions),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Browser launch timeout')), this.launchTimeout)
        )
      ]);
      
      const launchMs = Date.now() - startTime;
      this._telemetry.browserLaunches++;
      
      /** @type {PooledBrowser} */
      const pooled = {
        id,
        browser,
        pageCount: 0,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
        activePages: 0,
        healthy: true,
        consecutiveErrors: 0
      };
      
      this._pool.set(id, pooled);
      
      // Track peak pool size
      if (this._pool.size > this._telemetry.peakPoolSize) {
        this._telemetry.peakPoolSize = this._pool.size;
      }
      
      this.logger.info(`[BrowserPoolManager] Browser ${id} launched in ${launchMs}ms (pool size: ${this._pool.size})`);
      this.emit('browser:launched', { id, launchMs, poolSize: this._pool.size });
      
      return pooled;
    } catch (err) {
      this.logger.error(`[BrowserPoolManager] Failed to launch browser ${id}: ${err.message}`);
      this.emit('browser:launch-failed', { id, error: err.message });
      throw err;
    }
  }

  /**
   * Close a browser and remove from pool
   * @private
   * @param {string} id - Browser ID
   * @param {string} [reason] - Reason for removal
   */
  async _removeBrowser(id, reason = 'unknown') {
    const pooled = this._pool.get(id);
    if (!pooled) return;
    
    this._pool.delete(id);
    this._inUse.delete(id);
    
    try {
      await pooled.browser.close();
    } catch (err) {
      this.logger.warn(`[BrowserPoolManager] Error closing browser ${id}: ${err.message}`);
    }
    
    this.logger.info(`[BrowserPoolManager] Browser ${id} removed (reason: ${reason}, pool size: ${this._pool.size})`);
    this.emit('browser:removed', { id, reason, poolSize: this._pool.size });
  }

  /**
   * Find the best available browser for acquisition
   * @private
   * @returns {PooledBrowser|null}
   */
  _findAvailableBrowser() {
    let best = null;
    let bestScore = Infinity;
    
    for (const [id, pooled] of this._pool) {
      // Skip browsers in use or unhealthy
      if (this._inUse.has(id) || !pooled.healthy) continue;
      
      // Skip browsers that should be retired
      if (pooled.pageCount >= this.maxPagesPerBrowser) continue;
      
      // Score by page count (prefer less used)
      const score = pooled.pageCount + (pooled.activePages * 10);
      if (score < bestScore) {
        best = pooled;
        bestScore = score;
      }
    }
    
    return best;
  }

  /**
   * Acquire a browser from the pool
   * 
   * @returns {Promise<{browser: Object, release: () => Promise<void>, id: string}>}
   * @throws {Error} If no browser available within timeout
   */
  async acquire() {
    if (this._shuttingDown) {
      throw new Error('Pool is shutting down');
    }
    
    const startTime = Date.now();
    this._telemetry.acquires++;
    
    // Try to find an available browser
    let pooled = this._findAvailableBrowser();
    
    // If none available and pool not at max, launch new one
    if (!pooled && this._pool.size < this.maxBrowsers) {
      try {
        pooled = await this._launchBrowser();
      } catch (err) {
        // If launch fails, wait for existing browser
        this.logger.warn(`[BrowserPoolManager] Launch failed, waiting for available browser`);
      }
    }
    
    // If still none, wait for one to become available
    if (!pooled) {
      const waitStart = Date.now();
      const waitEnd = waitStart + this.acquireTimeout;
      
      while (!pooled && Date.now() < waitEnd) {
        await new Promise(r => setTimeout(r, 100));
        pooled = this._findAvailableBrowser();
      }
      
      if (!pooled) {
        this._telemetry.waitTimeouts++;
        throw new Error(`Acquire timeout: no browser available after ${this.acquireTimeout}ms`);
      }
    }
    
    // Mark as in use
    this._inUse.add(pooled.id);
    pooled.activePages++;
    pooled.lastUsedAt = Date.now();
    this._telemetry.browserReuses++;
    
    const acquireMs = Date.now() - startTime;
    this.emit('browser:acquired', { id: pooled.id, acquireMs });
    
    // Create release callback
    const release = async (error = null) => {
      await this._release(pooled.id, error);
    };
    
    return {
      browser: pooled.browser,
      release,
      id: pooled.id
    };
  }

  /**
   * Release a browser back to the pool
   * @private
   * @param {string} id - Browser ID
   * @param {Error|null} [error] - Error if fetch failed
   */
  async _release(id, error = null) {
    const pooled = this._pool.get(id);
    if (!pooled) return;
    
    this._telemetry.releases++;
    pooled.activePages = Math.max(0, pooled.activePages - 1);
    pooled.pageCount++;
    pooled.lastUsedAt = Date.now();
    
    // Track errors
    if (error) {
      pooled.consecutiveErrors++;
      if (pooled.consecutiveErrors >= 3) {
        pooled.healthy = false;
        this.logger.warn(`[BrowserPoolManager] Browser ${id} marked unhealthy after ${pooled.consecutiveErrors} errors`);
      }
    } else {
      pooled.consecutiveErrors = 0;
    }
    
    // Check if browser should be retired
    if (pooled.pageCount >= this.maxPagesPerBrowser) {
      this._telemetry.browserRetirements++;
      // Only remove if no active pages
      if (pooled.activePages === 0) {
        this._inUse.delete(id);
        await this._removeBrowser(id, `retired (${pooled.pageCount} pages)`);
        
        // Maintain minimum pool size
        if (this._pool.size < this.minBrowsers && !this._shuttingDown) {
          this._launchBrowser().catch(err => {
            this.logger.warn(`[BrowserPoolManager] Failed to maintain min pool: ${err.message}`);
          });
        }
        return;
      }
    }
    
    // Release for reuse
    if (pooled.activePages === 0) {
      this._inUse.delete(id);
    }
    
    this.emit('browser:released', { id, pageCount: pooled.pageCount });
  }

  /**
   * Start periodic health check
   * @private
   */
  _startHealthCheck() {
    if (this._healthCheckTimer) return;
    
    this._healthCheckTimer = setInterval(async () => {
      await this._performHealthCheck();
    }, this.healthCheckIntervalMs);
    
    // Don't keep Node alive for health checks
    if (this._healthCheckTimer.unref) {
      this._healthCheckTimer.unref();
    }
  }

  /**
   * Stop health check timer
   * @private
   */
  _stopHealthCheck() {
    if (this._healthCheckTimer) {
      clearInterval(this._healthCheckTimer);
      this._healthCheckTimer = null;
    }
  }

  /**
   * Perform health check on all browsers
   * @private
   */
  async _performHealthCheck() {
    if (this._shuttingDown) return;
    
    const now = Date.now();
    const toRemove = [];
    
    for (const [id, pooled] of this._pool) {
      try {
        // Check if browser is responsive
        await Promise.race([
          pooled.browser.version(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Health check timeout')), 5000)
          )
        ]);
        
        pooled.healthy = true;
        this._telemetry.healthChecksPassed++;
        
        // Check for idle browsers above minimum
        if (this._pool.size > this.minBrowsers && 
            !this._inUse.has(id) && 
            pooled.activePages === 0 &&
            now - pooled.lastUsedAt > this.maxIdleTimeMs) {
          toRemove.push({ id, reason: 'idle' });
        }
      } catch (err) {
        this._telemetry.healthChecksFailed++;
        pooled.healthy = false;
        
        if (!this._inUse.has(id) && pooled.activePages === 0) {
          this._telemetry.browserCrashes++;
          toRemove.push({ id, reason: `crashed: ${err.message}` });
        }
      }
    }
    
    // Remove dead/idle browsers
    for (const { id, reason } of toRemove) {
      await this._removeBrowser(id, reason);
    }
    
    // Maintain minimum pool size
    if (this._pool.size < this.minBrowsers && !this._shuttingDown) {
      const deficit = this.minBrowsers - this._pool.size;
      for (let i = 0; i < deficit; i++) {
        try {
          await this._launchBrowser();
        } catch (err) {
          this.logger.warn(`[BrowserPoolManager] Failed to maintain min pool: ${err.message}`);
        }
      }
    }
    
    this.emit('healthcheck:complete', {
      poolSize: this._pool.size,
      inUse: this._inUse.size,
      removed: toRemove.length
    });
  }

  /**
   * Get pool statistics
   * @returns {Object}
   */
  getStats() {
    const browsers = [];
    let totalActivePages = 0;
    
    for (const [id, pooled] of this._pool) {
      browsers.push({
        id,
        pageCount: pooled.pageCount,
        activePages: pooled.activePages,
        healthy: pooled.healthy,
        ageMs: Date.now() - pooled.createdAt,
        idleMs: Date.now() - pooled.lastUsedAt,
        inUse: this._inUse.has(id)
      });
      totalActivePages += pooled.activePages;
    }
    
    return {
      pool: {
        size: this._pool.size,
        inUse: this._inUse.size,
        available: this._pool.size - this._inUse.size,
        totalActivePages
      },
      config: {
        maxBrowsers: this.maxBrowsers,
        minBrowsers: this.minBrowsers,
        maxPagesPerBrowser: this.maxPagesPerBrowser,
        maxIdleTimeMs: this.maxIdleTimeMs
      },
      telemetry: { ...this._telemetry },
      browsers
    };
  }

  /**
   * Destroy the pool and close all browsers
   * @returns {Promise<void>}
   */
  async destroy() {
    this._shuttingDown = true;
    this._stopHealthCheck();
    
    this.logger.info(`[BrowserPoolManager] Destroying pool (${this._pool.size} browsers)`);
    
    // Wait for active pages to complete (with timeout)
    const waitStart = Date.now();
    const waitTimeout = 10000;
    
    while (this._inUse.size > 0 && Date.now() - waitStart < waitTimeout) {
      await new Promise(r => setTimeout(r, 100));
    }
    
    // Close all browsers
    const closePromises = [];
    for (const [id] of this._pool) {
      closePromises.push(this._removeBrowser(id, 'shutdown'));
    }
    
    await Promise.all(closePromises);
    
    // Log final telemetry
    const t = this._telemetry;
    this.logger.info(`[BrowserPoolManager] Final stats: launches=${t.browserLaunches} reuses=${t.browserReuses} retirements=${t.browserRetirements} crashes=${t.browserCrashes}`);
    
    this.emit('pool:destroyed', { telemetry: this._telemetry });
  }
}

module.exports = { BrowserPoolManager, DEFAULT_POOL_OPTIONS, DEFAULT_LAUNCH_OPTIONS };
