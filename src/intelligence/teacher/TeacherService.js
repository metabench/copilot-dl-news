'use strict';

const EventEmitter = require('events');

/**
 * TeacherService - Orchestrates Puppeteer-based page rendering.
 * 
 * The "Teacher" learns page layouts by rendering them in a headless browser,
 * extracting visual structure, and generating layout signatures that the
 * fast crawler can use for future visits.
 * 
 * Design principles:
 * - Lazy initialization (browser starts on first use)
 * - Pooled pages for efficiency
 * - Graceful degradation if Puppeteer unavailable
 * - Observable events for monitoring
 * 
 * @extends EventEmitter
 * @fires TeacherService#browser:launched
 * @fires TeacherService#page:created
 * @fires TeacherService#render:start
 * @fires TeacherService#render:complete
 * @fires TeacherService#render:error
 */
class TeacherService extends EventEmitter {
  /**
   * @param {Object} options
   * @param {number} [options.pagePoolSize=3] - Number of pages to keep ready
   * @param {number} [options.navigationTimeout=30000] - Page navigation timeout in ms
   * @param {number} [options.renderTimeout=10000] - Post-navigation render wait in ms
   * @param {boolean} [options.headless=true] - Run browser in headless mode
   * @param {string[]} [options.blockedResourceTypes] - Resource types to block (e.g., 'image', 'font')
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    super();
    
    this.pagePoolSize = options.pagePoolSize ?? 3;
    this.navigationTimeout = options.navigationTimeout ?? 30000;
    this.renderTimeout = options.renderTimeout ?? 10000;
    this.headless = options.headless ?? true;
    this.blockedResourceTypes = options.blockedResourceTypes ?? ['image', 'media', 'font'];
    this.logger = options.logger ?? console;
    
    this._browser = null;
    this._pagePool = [];
    this._isInitializing = false;
    this._initPromise = null;
    this._puppeteer = null;
    this._stats = {
      pagesRendered: 0,
      errors: 0,
      avgRenderTimeMs: 0
    };
  }

  /**
   * Check if Puppeteer is available.
   * @returns {boolean}
   */
  static isAvailable() {
    try {
      require.resolve('puppeteer');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Initialize the browser and page pool.
   * Safe to call multiple times (idempotent).
   * @returns {Promise<boolean>} True if initialization succeeded
   */
  async initialize() {
    if (this._browser) return true;
    
    if (this._isInitializing) {
      return this._initPromise;
    }
    
    this._isInitializing = true;
    this._initPromise = this._doInitialize();
    
    try {
      const result = await this._initPromise;
      return result;
    } finally {
      this._isInitializing = false;
    }
  }

  async _doInitialize() {
    try {
      this._puppeteer = require('puppeteer');
    } catch (err) {
      this.logger.warn('[TeacherService] Puppeteer not available:', err.message);
      return false;
    }

    try {
      this._browser = await this._puppeteer.launch({
        headless: this.headless ? 'new' : false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu'
        ]
      });
      
      this.emit('browser:launched', { 
        headless: this.headless,
        pid: this._browser.process()?.pid 
      });
      
      // Pre-create page pool
      for (let i = 0; i < this.pagePoolSize; i++) {
        const page = await this._createPage();
        this._pagePool.push(page);
      }
      
      this.logger.info(`[TeacherService] Initialized with ${this.pagePoolSize} pages`);
      return true;
    } catch (err) {
      this.logger.error('[TeacherService] Failed to launch browser:', err.message);
      this.emit('browser:error', { error: err.message });
      return false;
    }
  }

  async _createPage() {
    const page = await this._browser.newPage();
    
    // Set viewport to common desktop size
    await page.setViewport({ width: 1280, height: 800 });
    
    // Set user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Block unnecessary resources for faster loading
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (this.blockedResourceTypes.includes(request.resourceType())) {
        request.abort();
      } else {
        request.continue();
      }
    });
    
    this.emit('page:created');
    return page;
  }

  /**
   * Acquire a page from the pool.
   * @private
   * @returns {Promise<import('puppeteer').Page>}
   */
  async _acquirePage() {
    if (!this._browser) {
      const initialized = await this.initialize();
      if (!initialized) {
        throw new Error('TeacherService not available (Puppeteer missing or failed to launch)');
      }
    }
    
    if (this._pagePool.length > 0) {
      return this._pagePool.pop();
    }
    
    // Pool exhausted, create a new page
    return this._createPage();
  }

  /**
   * Release a page back to the pool.
   * @private
   * @param {import('puppeteer').Page} page
   */
  async _releasePage(page) {
    try {
      // Clear page state for reuse
      await page.goto('about:blank', { waitUntil: 'domcontentloaded' });
      
      if (this._pagePool.length < this.pagePoolSize) {
        this._pagePool.push(page);
      } else {
        await page.close();
      }
    } catch {
      // Page might be crashed, ignore
    }
  }

  /**
   * Render a URL and return the fully rendered HTML.
   * 
   * @param {string} url - URL to render
   * @param {Object} [options]
   * @param {number} [options.waitForSelector] - CSS selector to wait for before considering page ready
   * @param {number} [options.extraWaitMs=1000] - Extra wait time after load for JS execution
   * @returns {Promise<{html: string, metrics: Object}>}
   */
  async render(url, options = {}) {
    const extraWaitMs = options.extraWaitMs ?? 1000;
    const waitForSelector = options.waitForSelector ?? null;
    
    const startTime = Date.now();
    this.emit('render:start', { url });
    
    let page = null;
    try {
      page = await this._acquirePage();
      
      // Navigate to URL
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: this.navigationTimeout
      });
      
      // Wait for specific selector if provided
      if (waitForSelector) {
        await page.waitForSelector(waitForSelector, { 
          timeout: this.renderTimeout 
        });
      }
      
      // Extra wait for JavaScript execution
      if (extraWaitMs > 0) {
        await new Promise(resolve => setTimeout(resolve, extraWaitMs));
      }
      
      // Extract rendered HTML
      const html = await page.content();
      
      // Collect performance metrics
      const metrics = await page.metrics();
      const renderTimeMs = Date.now() - startTime;
      
      // Update stats
      this._stats.pagesRendered++;
      this._stats.avgRenderTimeMs = (
        (this._stats.avgRenderTimeMs * (this._stats.pagesRendered - 1) + renderTimeMs) / 
        this._stats.pagesRendered
      );
      
      this.emit('render:complete', { 
        url, 
        renderTimeMs,
        htmlLength: html.length 
      });
      
      return {
        html,
        metrics: {
          renderTimeMs,
          jsHeapUsedSize: metrics.JSHeapUsedSize,
          documents: metrics.Documents,
          frames: metrics.Frames
        }
      };
    } catch (err) {
      this._stats.errors++;
      this.emit('render:error', { url, error: err.message });
      throw err;
    } finally {
      if (page) {
        await this._releasePage(page);
      }
    }
  }

  /**
   * Render a URL and extract visual structure.
   * 
   * @param {string} url
   * @param {Object} [options]
   * @returns {Promise<{html: string, structure: Object}>}
   */
  async analyzeVisualStructure(url, options = {}) {
    const startTime = Date.now();
    let page = null;
    
    try {
      page = await this._acquirePage();
      
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: this.navigationTimeout
      });
      
      // Wait for content to settle
      await new Promise(resolve => setTimeout(resolve, options.extraWaitMs ?? 1000));
      
      // Extract visual structure via page.evaluate
      const structure = await page.evaluate(() => {
        /**
         * Find the largest text block on the page.
         * This is typically the main article content.
         */
        function findLargestTextBlock() {
          const candidates = [];
          const textElements = document.querySelectorAll('p, article, div, section, main');
          
          for (const el of textElements) {
            const text = el.innerText || '';
            const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
            const rect = el.getBoundingClientRect();
            
            if (wordCount > 50 && rect.width > 200 && rect.height > 100) {
              candidates.push({
                tagName: el.tagName.toLowerCase(),
                className: el.className,
                id: el.id,
                wordCount,
                rect: {
                  x: Math.round(rect.x),
                  y: Math.round(rect.y),
                  width: Math.round(rect.width),
                  height: Math.round(rect.height)
                },
                area: rect.width * rect.height
              });
            }
          }
          
          // Sort by word count descending, take the best
          candidates.sort((a, b) => b.wordCount - a.wordCount);
          return candidates[0] || null;
        }
        
        /**
         * Find metadata region (typically header area with title, date, author).
         */
        function findMetadataBlock() {
          const metaSelectors = [
            'header', '.article-header', '.post-header', '.entry-header',
            '[class*="meta"]', '[class*="byline"]', 'time', '.author'
          ];
          
          for (const selector of metaSelectors) {
            const el = document.querySelector(selector);
            if (el) {
              const rect = el.getBoundingClientRect();
              return {
                selector,
                tagName: el.tagName.toLowerCase(),
                rect: {
                  x: Math.round(rect.x),
                  y: Math.round(rect.y),
                  width: Math.round(rect.width),
                  height: Math.round(rect.height)
                }
              };
            }
          }
          return null;
        }
        
        /**
         * Build a simplified DOM skeleton for hashing.
         */
        function buildSkeleton(el = document.body, depth = 0, maxDepth = 5) {
          if (!el || depth > maxDepth) return null;
          
          const children = [];
          for (const child of el.children) {
            const skeleton = buildSkeleton(child, depth + 1, maxDepth);
            if (skeleton) children.push(skeleton);
          }
          
          return {
            tag: el.tagName.toLowerCase(),
            childCount: el.children.length,
            hasText: (el.innerText || '').trim().length > 0,
            children: children.length > 0 ? children : undefined
          };
        }
        
        return {
          title: document.title,
          largestTextBlock: findLargestTextBlock(),
          metadataBlock: findMetadataBlock(),
          skeleton: buildSkeleton(document.body, 0, 4),
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
            scrollHeight: document.body.scrollHeight
          }
        };
      });
      
      const html = await page.content();
      const renderTimeMs = Date.now() - startTime;
      
      this.emit('render:complete', { 
        url, 
        renderTimeMs, 
        hasLargestTextBlock: !!structure.largestTextBlock 
      });
      
      return {
        html,
        structure,
        metrics: { renderTimeMs }
      };
    } finally {
      if (page) {
        await this._releasePage(page);
      }
    }
  }

  /**
   * Get service statistics.
   * @returns {Object}
   */
  getStats() {
    return {
      ...this._stats,
      poolSize: this._pagePool.length,
      isAvailable: !!this._browser
    };
  }

  /**
   * Shutdown the browser and clean up resources.
   */
  async shutdown() {
    if (this._browser) {
      try {
        // Close all pooled pages
        for (const page of this._pagePool) {
          await page.close().catch(() => {});
        }
        this._pagePool = [];
        
        await this._browser.close();
        this._browser = null;
        this.logger.info('[TeacherService] Browser shut down');
      } catch (err) {
        this.logger.warn('[TeacherService] Error during shutdown:', err.message);
      }
    }
  }
}

module.exports = { TeacherService };
