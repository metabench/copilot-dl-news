'use strict';

const CrawlModeStrategy = require('./CrawlModeStrategy');

/**
 * Gazetteer crawl mode strategy.
 * 
 * This mode is designed for geographical/location-based crawling:
 * - Uses a gazetteer (place name database) to guide discovery
 * - Crawls country/region-specific news hubs
 * - Processes locations in stages (seed → hub → article)
 * - Maintains per-country statistics and coverage metrics
 * 
 * Gazetteer mode features:
 * - Stage-based processing (configurable via gazetteerStages)
 * - Country targeting (via targetCountries or limitCountries)
 * - Sequential processing (ignores concurrency setting)
 * - Geographic priority scoring
 * 
 * @extends CrawlModeStrategy
 */
class GazetteerCrawlMode extends CrawlModeStrategy {
  /**
   * @override
   * @returns {string}
   */
  get modeId() {
    return 'gazetteer';
  }

  /**
   * @override
   * @returns {string}
   */
  get displayName() {
    return 'Gazetteer/Geography Crawl';
  }

  /**
   * Gazetteer mode requires initialization to set up the gazetteer manager.
   * @override
   * @returns {boolean}
   */
  requiresInit() {
    return true;
  }

  /**
   * Initialize the gazetteer mode.
   * Sets up the gazetteer manager and validates configuration.
   * @override
   * @async
   * @returns {Promise<void>}
   */
  async init() {
    // Ensure gazetteer manager is available
    if (!this.crawler.gazetteerManager) {
      throw new Error('GazetteerManager is required for gazetteer mode');
    }
    
    // Configure stage filter if specified
    if (this.config.gazetteerStageFilter) {
      this.stageFilter = this.config.gazetteerStageFilter;
    }
    
    // Set up country targeting
    if (this.config.targetCountries) {
      this.targetCountries = new Set(
        this.config.targetCountries.map(c => c.toLowerCase())
      );
    }
    
    this.limitCountries = this.config.limitCountries;
  }

  /**
   * Get the startup sequence for gazetteer mode.
   * Gazetteer has its own specialized startup.
   * @override
   * @returns {string[]}
   */
  getStartupSequence() {
    // Gazetteer mode: init only, then run gazetteer pipeline
    return ['init', 'markStartupComplete'];
  }

  /**
   * Get the crawl sequence for gazetteer mode.
   * Uses the dedicated gazetteer runner.
   * @override
   * @returns {string[]}
   */
  getCrawlSequence() {
    return ['runGazetteerMode'];
  }

  /**
   * Gazetteer mode does not use the standard intelligent planner.
   * It has its own gazetteer-specific planning.
   * @override
   * @returns {boolean}
   */
  shouldRunPlanner() {
    return false;
  }

  /**
   * Gazetteer mode typically does not load sitemaps.
   * Discovery is driven by the gazetteer database.
   * @override
   * @returns {boolean}
   */
  shouldLoadSitemaps() {
    return false;
  }

  /**
   * Configure gazetteer-specific services.
   * @override
   * @param {Object} serviceContainer - Container with available services
   */
  configureServices(serviceContainer) {
    // Set flags for gazetteer mode on the crawler
    this.crawler.isGazetteerMode = true;
    this.crawler.gazetteerVariant = this.config.crawlType === 'geography' ? 'geography' : 'gazetteer';
    
    // Structure-only mode doesn't save articles
    if (this.config.structureOnly) {
      this.crawler.structureOnly = true;
    }
  }

  /**
   * Run the gazetteer crawl.
   * 
   * Gazetteer mode processes locations from the gazetteer database:
   * 1. Load countries/regions from gazetteer
   * 2. For each location, discover news hubs
   * 3. Process hub pages to find articles
   * 4. Save articles with geographic metadata
   * 
   * The actual execution is delegated to GazetteerManager.
   * 
   * @override
   * @async
   * @returns {Promise<import('./CrawlModeStrategy').ModeRunResult>}
   */
  async run() {
    const startTime = Date.now();
    
    try {
      // Delegate to the gazetteer manager
      await this.crawler.gazetteerManager.run();
      
      const stats = this.crawler.stats || {};
      const gazStats = this.crawler.gazetteerManager?.getStats?.() || {};
      
      return {
        ok: true,
        articlesFound: gazStats.articles || stats.articles || 0,
        pagesProcessed: gazStats.pagesProcessed || stats.visited || 0,
        metrics: {
          durationMs: Date.now() - startTime,
          countriesProcessed: gazStats.countriesProcessed || 0,
          hubsDiscovered: gazStats.hubsDiscovered || 0,
          stagesCompleted: gazStats.stagesCompleted || []
        }
      };
    } catch (error) {
      return {
        ok: false,
        reason: error.message || 'Unknown error in gazetteer crawl',
        metrics: {
          durationMs: Date.now() - startTime,
          errorType: error.name || 'Error'
        }
      };
    }
  }

  /**
   * Handle gazetteer mode completion.
   * Logs summary statistics for geographic coverage.
   * @override
   * @async
   * @param {import('./CrawlModeStrategy').ModeRunResult} result
   * @returns {Promise<void>}
   */
  async onComplete(result) {
    if (result.ok && result.metrics) {
      // Emit telemetry for gazetteer completion
      this.crawler.telemetry?.milestoneOnce?.('gazetteer:complete', {
        kind: 'gazetteer-complete',
        message: `Gazetteer crawl complete: ${result.metrics.countriesProcessed || 0} countries`,
        details: result.metrics
      });
    }
  }

  /**
   * Get telemetry data for gazetteer mode.
   * @override
   * @returns {Object}
   */
  getTelemetryData() {
    return {
      mode: this.modeId,
      displayName: this.displayName,
      variant: this.crawler.gazetteerVariant || 'gazetteer',
      stageFilter: this.stageFilter ? Array.from(this.stageFilter) : null,
      targetCountries: this.targetCountries ? Array.from(this.targetCountries) : null,
      limitCountries: this.limitCountries || null,
      structureOnly: Boolean(this.config.structureOnly)
    };
  }
}

module.exports = GazetteerCrawlMode;
