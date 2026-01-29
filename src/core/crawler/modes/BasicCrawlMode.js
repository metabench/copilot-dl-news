'use strict';

const CrawlModeStrategy = require('./CrawlModeStrategy');

/**
 * Basic crawl mode strategy.
 * 
 * This is the default crawl mode that performs standard web crawling:
 * - Starts from a seed URL
 * - Optionally loads sitemaps
 * - Processes pages sequentially or concurrently
 * - Extracts links and follows them within configured depth
 * 
 * Basic mode does NOT use:
 * - Intelligent planning
 * - Gazetteer-based geographical crawling
 * - Priority weighting beyond depth-based ordering
 * 
 * @extends CrawlModeStrategy
 */
class BasicCrawlMode extends CrawlModeStrategy {
  /**
   * @override
   * @returns {string}
   */
  get modeId() {
    return 'basic';
  }

  /**
   * @override
   * @returns {string}
   */
  get displayName() {
    return 'Basic Crawl';
  }

  /**
   * Basic mode does not require special initialization.
   * @override
   * @returns {boolean}
   */
  requiresInit() {
    return false;
  }

  /**
   * Get the startup sequence for basic mode.
   * @override
   * @returns {string[]}
   */
  getStartupSequence() {
    // Basic mode: init, optional sitemap, seed URL, then crawl
    return ['init', 'sitemaps', 'seedStartUrl', 'markStartupComplete'];
  }

  /**
   * Get the crawl sequence for basic mode.
   * Uses sequential or concurrent depending on config.
   * @override
   * @returns {string[]}
   */
  getCrawlSequence() {
    const useConcurrent = this.config.concurrency > 1;
    return useConcurrent ? ['runConcurrentWorkers'] : ['runSequentialLoop'];
  }

  /**
   * Basic mode does not use the intelligent planner.
   * @override
   * @returns {boolean}
   */
  shouldRunPlanner() {
    return false;
  }

  /**
   * Basic mode loads sitemaps if enabled in config.
   * @override
   * @returns {boolean}
   */
  shouldLoadSitemaps() {
    return Boolean(this.config.useSitemap);
  }

  /**
   * Run the basic crawl loop.
   * 
   * This method orchestrates the crawl by:
   * 1. Seeding the initial URL(s)
   * 2. Processing pages from the queue
   * 3. Following extracted links within depth limits
   * 
   * The actual loop execution is delegated to the crawler's
   * existing sequential or concurrent runners.
   * 
   * @override
   * @async
   * @returns {Promise<import('./CrawlModeStrategy').ModeRunResult>}
   */
  async run() {
    const startTime = Date.now();
    
    try {
      // Delegate to the crawler's existing loop mechanisms
      const useConcurrent = this.config.concurrency > 1;
      
      if (useConcurrent) {
        await this.crawler._runConcurrentWorkers();
      } else {
        await this.crawler._runSequentialLoop();
      }
      
      const stats = this.crawler.stats || {};
      
      return {
        ok: true,
        articlesFound: stats.articles || 0,
        pagesProcessed: stats.visited || 0,
        metrics: {
          durationMs: Date.now() - startTime,
          queueExhausted: (stats.queued || 0) === 0,
          errors: stats.errors || 0
        }
      };
    } catch (error) {
      return {
        ok: false,
        reason: error.message || 'Unknown error in basic crawl',
        metrics: {
          durationMs: Date.now() - startTime,
          errorType: error.name || 'Error'
        }
      };
    }
  }

  /**
   * Get telemetry data for basic mode.
   * @override
   * @returns {Object}
   */
  getTelemetryData() {
    return {
      mode: this.modeId,
      displayName: this.displayName,
      concurrent: this.config.concurrency > 1,
      concurrency: this.config.concurrency,
      maxDepth: this.config.maxDepth,
      sitemapEnabled: this.config.useSitemap
    };
  }
}

module.exports = BasicCrawlMode;
