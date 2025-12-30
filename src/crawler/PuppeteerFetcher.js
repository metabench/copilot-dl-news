#!/usr/bin/env node
'use strict';

/**
 * PuppeteerFetcher — Headless browser fallback for sites that block node-fetch
 * 
 * Use when sites like The Guardian return ECONNRESET due to TLS fingerprinting.
 * Records fetch method in returned metadata for DB tracking.
 * 
 * Features:
 * - Browser session reuse with health monitoring
 * - Auto-restart after configurable page count or time
 * - Telemetry tracking for browser launch vs reuse
 * - Graceful degradation on browser failures
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
 * Default page navigation options
 */
const DEFAULT_NAVIGATION_OPTIONS = {
  waitUntil: 'domcontentloaded',
  timeout: 30000
};

/**
 * Default browser lifecycle options
 */
const DEFAULT_LIFECYCLE_OPTIONS = {
  reuseSession: true,
  maxPagesPerSession: 50,       // Restart browser after N pages
  maxSessionAgeMs: 10 * 60000,  // Restart browser after 10 minutes
  healthCheckIntervalMs: 30000, // Check browser health every 30s
  healthCheckEnabled: true,
  restartOnError: true,
  maxConsecutiveErrors: 3       // Force restart after N consecutive errors
};

class PuppeteerFetcher extends EventEmitter {
  /**
   * @param {Object} opts
   * @param {Object} [opts.launchOptions] - Puppeteer launch options
   * @param {Object} [opts.navigationOptions] - Page navigation options
   * @param {boolean} [opts.reuseSession=true] - Reuse browser session across fetches
   * @param {number} [opts.maxPages=5] - Max concurrent pages when reusing session
   * @param {number} [opts.maxPagesPerSession=50] - Restart browser after N pages
   * @param {number} [opts.maxSessionAgeMs=600000] - Restart browser after X ms
   * @param {boolean} [opts.healthCheckEnabled=true] - Enable periodic health checks
   * @param {number} [opts.healthCheckIntervalMs=30000] - Health check interval
   * @param {boolean} [opts.restartOnError=true] - Auto-restart on consecutive errors
   * @param {number} [opts.maxConsecutiveErrors=3] - Max consecutive errors before restart
   * @param {Object} [opts.logger] - Logger instance
   */
  constructor(opts = {}) {
    super();
    this.launchOptions = { ...DEFAULT_LAUNCH_OPTIONS, ...opts.launchOptions };
    this.navigationOptions = { ...DEFAULT_NAVIGATION_OPTIONS, ...opts.navigationOptions };
    this.logger = opts.logger || console;
    
    // Browser pool support (optional - takes precedence over session reuse)
    this._browserPool = opts.browserPool || null;
    this._usePool = !!this._browserPool;
    
    // Lifecycle options
    const lifecycle = { ...DEFAULT_LIFECYCLE_OPTIONS };
    this.reuseSession = opts.reuseSession !== undefined ? opts.reuseSession : lifecycle.reuseSession;
    this.maxPages = opts.maxPages || 5;
    this.maxPagesPerSession = opts.maxPagesPerSession || lifecycle.maxPagesPerSession;
    this.maxSessionAgeMs = opts.maxSessionAgeMs || lifecycle.maxSessionAgeMs;
    this.healthCheckEnabled = opts.healthCheckEnabled !== undefined ? opts.healthCheckEnabled : lifecycle.healthCheckEnabled;
    this.healthCheckIntervalMs = opts.healthCheckIntervalMs || lifecycle.healthCheckIntervalMs;
    this.restartOnError = opts.restartOnError !== undefined ? opts.restartOnError : lifecycle.restartOnError;
    this.maxConsecutiveErrors = opts.maxConsecutiveErrors || lifecycle.maxConsecutiveErrors;
    
    // Internal state
    this._browser = null;
    this._pagePool = [];
    this._activePages = 0;
    this._sessionStartTime = null;
    this._sessionPageCount = 0;
    this._consecutiveErrors = 0;
    this._healthCheckTimer = null;
    this._isRestarting = false;
    
    // Telemetry counters
    this._telemetry = {
      browserLaunches: 0,
      browserReuses: 0,
      pagesFetched: 0,
      fetchSuccesses: 0,
      fetchErrors: 0,
      healthChecksPassed: 0,
      healthChecksFailed: 0,
      autoRestarts: 0,
      errorRestarts: 0
    };
  }

  /**
   * Get telemetry stats for browser reuse tracking
   * @returns {Object} Telemetry counters
   */
  getTelemetry() {
    return {
      ...this._telemetry,
      currentSession: {
        active: !!this._browser,
        pageCount: this._sessionPageCount,
        ageMs: this._sessionStartTime ? Date.now() - this._sessionStartTime : 0,
        activePages: this._activePages,
        consecutiveErrors: this._consecutiveErrors
      }
    };
  }

  /**
   * Initialize the browser (call before fetch if reusing session)
   * @returns {Promise<PuppeteerFetcher>}
   */
  async init() {
    if (!this._browser) {
      await this._launchBrowser();
      this._startHealthCheck();
    }
    return this;
  }

  /**
   * Launch a new browser instance
   * @private
   */
  async _launchBrowser() {
    if (this._browser) {
      // Clean up existing browser first
      await this._closeBrowser();
    }
    
    const startTime = Date.now();
    this._browser = await puppeteer.launch(this.launchOptions);
    this._sessionStartTime = Date.now();
    this._sessionPageCount = 0;
    this._consecutiveErrors = 0;
    this._telemetry.browserLaunches++;
    
    const launchMs = Date.now() - startTime;
    this.logger.info(`[puppeteer] Browser launched in ${launchMs}ms (session #${this._telemetry.browserLaunches})`, { type: 'PUPPETEER' });
    this.emit('browser:launched', { launchMs, sessionNumber: this._telemetry.browserLaunches });
  }

  /**
   * Close the browser gracefully
   * @private
   */
  async _closeBrowser() {
    if (this._browser) {
      try {
        await this._browser.close();
      } catch (err) {
        this.logger.warn(`[puppeteer] Error closing browser: ${err.message}`, { type: 'PUPPETEER' });
      }
      this._browser = null;
      this._sessionStartTime = null;
      this.emit('browser:closed');
    }
  }

  /**
   * Start periodic health check timer
   * @private
   */
  _startHealthCheck() {
    if (!this.healthCheckEnabled || !this.reuseSession) return;
    
    this._stopHealthCheck(); // Clear any existing timer
    
    this._healthCheckTimer = setInterval(async () => {
      await this._performHealthCheck();
    }, this.healthCheckIntervalMs);
    
    // Don't keep Node alive just for health checks
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
   * Perform a health check on the browser
   * @private
   * @returns {Promise<boolean>} Whether browser is healthy
   */
  async _performHealthCheck() {
    if (!this._browser || this._isRestarting) return true;
    
    try {
      // Quick health check: try to get browser version
      const version = await Promise.race([
        this._browser.version(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Health check timeout')), 5000))
      ]);
      
      this._telemetry.healthChecksPassed++;
      
      // Check if we need auto-restart due to age or page count
      const sessionAgeMs = Date.now() - this._sessionStartTime;
      const needsAgeRestart = sessionAgeMs >= this.maxSessionAgeMs;
      const needsPageRestart = this._sessionPageCount >= this.maxPagesPerSession;
      
      if (needsAgeRestart || needsPageRestart) {
        const reason = needsAgeRestart 
          ? `session age (${Math.round(sessionAgeMs / 1000)}s)`
          : `page count (${this._sessionPageCount})`;
        
        // Only restart if no active pages
        if (this._activePages === 0) {
          this.logger.info(`[puppeteer] Auto-restarting browser due to ${reason}`, { type: 'PUPPETEER' });
          this._telemetry.autoRestarts++;
          await this._launchBrowser();
        } else {
          this.logger.debug(`[puppeteer] Auto-restart pending (${this._activePages} active pages)`, { type: 'PUPPETEER' });
        }
      }
      
      return true;
    } catch (err) {
      this._telemetry.healthChecksFailed++;
      this.logger.warn(`[puppeteer] Health check failed: ${err.message}`, { type: 'PUPPETEER' });
      
      // Browser is unhealthy, restart on next fetch
      if (this._activePages === 0 && this.restartOnError) {
        this._telemetry.errorRestarts++;
        await this._launchBrowser();
      }
      
      return false;
    }
  }

  /**
   * Check if browser should be restarted due to consecutive errors
   * @private
   */
  async _checkErrorRestart() {
    if (!this.restartOnError) return;
    
    if (this._consecutiveErrors >= this.maxConsecutiveErrors) {
      this.logger.warn(`[puppeteer] Restarting browser after ${this._consecutiveErrors} consecutive errors`, { type: 'PUPPETEER' });
      this._telemetry.errorRestarts++;
      this._consecutiveErrors = 0;
      
      if (this._activePages === 0) {
        await this._launchBrowser();
      }
    }
  }

  /**
   * Get or create a browser instance for fetch
   * @private
   * @returns {Promise<{browser: Browser, ownsBrowser: boolean, poolRelease?: Function}>}
   */
  async _getBrowser() {
    // Use pool if available (takes precedence)
    if (this._usePool && this._browserPool) {
      const acquired = await this._browserPool.acquire();
      this._telemetry.browserReuses++;
      return { 
        browser: acquired.browser, 
        ownsBrowser: false, 
        poolRelease: acquired.release,
        poolBrowserId: acquired.id
      };
    }
    
    if (!this.reuseSession) {
      // One-off browser for this fetch
      const browser = await puppeteer.launch(this.launchOptions);
      this._telemetry.browserLaunches++;
      return { browser, ownsBrowser: true };
    }
    
    // Reuse existing browser
    if (this._browser) {
      // Check if browser process is still alive
      try {
        await this._browser.version();
        this._telemetry.browserReuses++;
        return { browser: this._browser, ownsBrowser: false };
      } catch (err) {
        // Browser died, restart it
        this.logger.warn(`[puppeteer] Browser process died, restarting: ${err.message}`, { type: 'PUPPETEER' });
        await this._launchBrowser();
        return { browser: this._browser, ownsBrowser: false };
      }
    }
    
    // First fetch, launch browser
    await this._launchBrowser();
    return { browser: this._browser, ownsBrowser: false };
  }

  /**
   * Fetch a URL using Puppeteer
   * 
   * @param {string} url - URL to fetch
   * @param {Object} [opts] - Fetch options
   * @param {number} [opts.timeout] - Navigation timeout
   * @param {string} [opts.waitUntil] - Wait condition
   * @returns {Promise<FetchResult>}
   * 
   * @typedef {Object} FetchResult
   * @property {boolean} success - Whether fetch succeeded
   * @property {string} url - Original URL
   * @property {string} finalUrl - Final URL after redirects
   * @property {number|null} httpStatus - HTTP status code
   * @property {string|null} html - Page HTML content
   * @property {number} contentLength - Content length in bytes
   * @property {number} durationMs - Fetch duration
   * @property {string} fetchMethod - Always 'puppeteer'
   * @property {boolean} browserReused - Whether browser was reused
   * @property {number} sessionPageNumber - Page number in this session
   * @property {string|null} error - Error message if failed
   * @property {Object} metadata - Additional metadata
   */
  async fetch(url, opts = {}) {
    const startTime = Date.now();
    const navOptions = { ...this.navigationOptions, ...opts };
    
    let browser = null;
    let page = null;
    let ownsBrowser = false;
    let browserReused = false;
    let poolRelease = null;
    let fetchError = null;
    
    try {
      // Prevent concurrent restarts
      while (this._isRestarting) {
        await new Promise(r => setTimeout(r, 100));
      }
      
      // Get browser (reused, pooled, or new)
      const browserResult = await this._getBrowser();
      browser = browserResult.browser;
      ownsBrowser = browserResult.ownsBrowser;
      poolRelease = browserResult.poolRelease || null;
      browserReused = !ownsBrowser && this._telemetry.browserReuses > 0;

      page = await browser.newPage();
      this._activePages++;
      this._sessionPageCount++;
      this._telemetry.pagesFetched++;

      // Set viewport
      await page.setViewport({ width: 1920, height: 1080 });

      // Navigate
      const response = await page.goto(url, navOptions);
      
      const httpStatus = response?.status() || null;
      const finalUrl = page.url();
      const html = await page.content();
      const contentLength = Buffer.byteLength(html, 'utf8');
      const title = await page.title();
      const durationMs = Date.now() - startTime;

      // Extract links for crawler integration
      const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[href]'))
          .map(a => a.href)
          .filter(href => href.startsWith('http'));
      });

      // Reset consecutive error counter on success
      this._consecutiveErrors = 0;
      this._telemetry.fetchSuccesses++;
      
      this.emit('fetch:success', { 
        url, 
        finalUrl, 
        httpStatus, 
        durationMs, 
        browserReused,
        sessionPageNumber: this._sessionPageCount
      });

      return {
        success: true,
        url,
        finalUrl,
        httpStatus,
        html,
        contentLength,
        durationMs,
        fetchMethod: 'puppeteer',
        browserReused,
        sessionPageNumber: this._sessionPageCount,
        error: null,
        metadata: {
          title,
          linkCount: links.length,
          links: links.slice(0, 100), // Limit for memory
          userAgent: await page.evaluate(() => navigator.userAgent),
          sessionStats: {
            browserLaunches: this._telemetry.browserLaunches,
            browserReuses: this._telemetry.browserReuses,
            sessionPageCount: this._sessionPageCount
          }
        }
      };

    } catch (error) {
      const durationMs = Date.now() - startTime;
      this._consecutiveErrors++;
      this._telemetry.fetchErrors++;
      fetchError = error; // Track error for pool release
      
      this.emit('fetch:error', { 
        url, 
        error: error.message, 
        durationMs,
        consecutiveErrors: this._consecutiveErrors
      });
      
      // Check if we need to restart due to errors
      await this._checkErrorRestart();

      return {
        success: false,
        url,
        finalUrl: url,
        httpStatus: null,
        html: null,
        contentLength: 0,
        durationMs,
        fetchMethod: 'puppeteer',
        browserReused,
        sessionPageNumber: this._sessionPageCount,
        error: error.message,
        metadata: {}
      };

    } finally {
      if (page) {
        this._activePages--;
        try { await page.close(); } catch {}
      }
      if (ownsBrowser && browser) {
        try { await browser.close(); } catch {}
      }
      // Release pooled browser if applicable
      if (poolRelease) {
        try { await poolRelease(fetchError); } catch {}
      }
    }
  }

  /**
   * Batch fetch multiple URLs
   * 
   * @param {string[]} urls - URLs to fetch
   * @param {Object} [opts] - Fetch options
   * @param {number} [opts.concurrency=3] - Max concurrent fetches
   * @param {number} [opts.delayMs=1000] - Delay between fetches
   * @returns {Promise<FetchResult[]>}
   */
  async fetchMany(urls, opts = {}) {
    const concurrency = opts.concurrency || 3;
    const delayMs = opts.delayMs || 1000;
    const results = [];
    
    await this.init();

    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(url => this.fetch(url, opts))
      );
      results.push(...batchResults);

      // Rate limiting delay between batches
      if (i + concurrency < urls.length && delayMs > 0) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }

    return results;
  }

  /**
   * Force restart the browser (e.g., for memory management)
   * @returns {Promise<void>}
   */
  async restart() {
    if (this._isRestarting) return;
    
    this._isRestarting = true;
    try {
      // Wait for active pages to complete
      while (this._activePages > 0) {
        await new Promise(r => setTimeout(r, 100));
      }
      await this._launchBrowser();
      this.logger.info('[puppeteer] Browser manually restarted', { type: 'PUPPETEER' });
    } finally {
      this._isRestarting = false;
    }
  }

  /**
   * Close the browser and clean up
   */
  async destroy() {
    this._stopHealthCheck();
    await this._closeBrowser();
    
    // Log final telemetry
    const t = this._telemetry;
    this.logger.info(`[puppeteer] Session stats: launches=${t.browserLaunches} reuses=${t.browserReuses} pages=${t.pagesFetched} success=${t.fetchSuccesses} errors=${t.fetchErrors}`, { type: 'PUPPETEER' });
    this.emit('browser:destroyed', { telemetry: this._telemetry });
  }
}

// ─────────────────────────────────────────────────────────────
// CLI interface for testing
// ─────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help')) {
    console.log(`
PuppeteerFetcher — Headless browser fetch for blocked sites

Usage:
  node PuppeteerFetcher.js <url>              # Fetch single URL
  node PuppeteerFetcher.js <url1> <url2> ...  # Fetch multiple URLs
  
Options:
  --json      Output results as JSON
  --timeout   Navigation timeout in ms (default: 30000)
  --help      Show this help

Examples:
  node PuppeteerFetcher.js https://www.theguardian.com
  node PuppeteerFetcher.js https://www.theguardian.com https://www.bbc.com --json
`);
    return;
  }

  const urls = args.filter(a => !a.startsWith('--'));
  const json = args.includes('--json');
  const timeoutArg = args.find(a => a.startsWith('--timeout='));
  const timeout = timeoutArg ? parseInt(timeoutArg.split('=')[1]) : 30000;

  const fetcher = new PuppeteerFetcher();

  try {
    if (urls.length === 1) {
      const result = await fetcher.fetch(urls[0], { timeout });
      
      if (json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`\n${result.success ? '✅' : '❌'} ${result.url}`);
        console.log(`   Status:         ${result.httpStatus}`);
        console.log(`   Final URL:      ${result.finalUrl}`);
        console.log(`   Content:        ${(result.contentLength / 1024).toFixed(1)} KB`);
        console.log(`   Duration:       ${result.durationMs}ms`);
        console.log(`   Fetch Method:   ${result.fetchMethod}`);
        if (result.metadata.title) {
          console.log(`   Title:          ${result.metadata.title}`);
        }
        if (result.error) {
          console.log(`   Error:          ${result.error}`);
        }
      }
    } else {
      await fetcher.init();
      const results = await fetcher.fetchMany(urls, { timeout, concurrency: 2, delayMs: 1000 });
      
      if (json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        console.log(`\n📊 Fetched ${results.length} URLs:\n`);
        for (const r of results) {
          const status = r.success ? '✅' : '❌';
          console.log(`${status} ${r.httpStatus || 'ERR'} ${r.finalUrl} (${r.durationMs}ms, ${r.fetchMethod})`);
        }
      }
    }
  } finally {
    await fetcher.destroy();
  }
}

// Export for use as module
module.exports = { PuppeteerFetcher, DEFAULT_LAUNCH_OPTIONS, DEFAULT_NAVIGATION_OPTIONS };

// Run CLI if executed directly
if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
