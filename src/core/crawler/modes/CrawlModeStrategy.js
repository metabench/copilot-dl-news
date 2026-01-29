'use strict';

/**
 * @typedef {Object} CrawlModeContext
 * @property {Object} crawler - The parent crawler instance
 * @property {Object} config - The resolved crawler configuration
 * @property {Object} services - Injected services (db, cache, telemetry, etc.)
 * @property {Object} state - The crawler state object
 */

/**
 * @typedef {Object} ModeRunResult
 * @property {boolean} ok - Whether the mode completed successfully
 * @property {string} [reason] - Failure reason if ok is false
 * @property {number} [articlesFound] - Number of articles discovered
 * @property {number} [pagesProcessed] - Number of pages processed
 * @property {Object} [metrics] - Additional mode-specific metrics
 */

/**
 * Base class for crawl mode strategies.
 * Each mode (basic, gazetteer, intelligent) extends this class to provide
 * mode-specific behavior for crawling.
 * 
 * Mode strategies follow the Strategy Pattern, allowing the crawler to
 * delegate mode-specific decisions without conditional branching.
 * 
 * @abstract
 */
class CrawlModeStrategy {
  /**
   * Create a new mode strategy.
   * @param {CrawlModeContext} context - The mode context
   */
  constructor(context) {
    if (this.constructor === CrawlModeStrategy) {
      throw new Error('CrawlModeStrategy is abstract and cannot be instantiated directly');
    }
    this.crawler = context.crawler;
    this.config = context.config;
    this.services = context.services || {};
    this.state = context.state;
  }

  /**
   * Get the unique identifier for this mode.
   * @abstract
   * @returns {string} Mode identifier (e.g., 'basic', 'gazetteer', 'intelligent')
   */
  get modeId() {
    throw new Error('modeId getter must be implemented by subclass');
  }

  /**
   * Get a human-readable name for this mode.
   * @returns {string} Display name
   */
  get displayName() {
    return this.modeId.charAt(0).toUpperCase() + this.modeId.slice(1);
  }

  /**
   * Check if this mode requires special initialization.
   * @returns {boolean} True if mode needs async setup
   */
  requiresInit() {
    return false;
  }

  /**
   * Initialize the mode strategy.
   * Called before the crawl starts if requiresInit() returns true.
   * @async
   * @returns {Promise<void>}
   */
  async init() {
    // Default no-op; subclasses can override
  }

  /**
   * Get the sequence of startup operations for this mode.
   * Returns an array of operation names that the sequence runner will execute.
   * @returns {string[]} Array of operation names
   */
  getStartupSequence() {
    return ['init', 'sitemaps', 'seedStartUrl', 'markStartupComplete'];
  }

  /**
   * Get the sequence of crawl operations for this mode.
   * @returns {string[]} Array of operation names
   */
  getCrawlSequence() {
    return ['runSequentialLoop'];
  }

  /**
   * Determine if the planner stage should run for this mode.
   * @returns {boolean} True if planner should run
   */
  shouldRunPlanner() {
    return false;
  }

  /**
   * Determine if sitemaps should be loaded for this mode.
   * @returns {boolean} True if sitemaps should be loaded
   */
  shouldLoadSitemaps() {
    return Boolean(this.config.useSitemap);
  }

  /**
   * Configure services specific to this mode.
   * Called during mode initialization to set up mode-specific services.
   * @param {Object} serviceContainer - Container with available services
   */
  configureServices(serviceContainer) {
    // Default no-op; subclasses configure as needed
  }

  /**
   * Run the main crawl loop for this mode.
   * This is the core execution method that subclasses must implement.
   * @abstract
   * @async
   * @returns {Promise<ModeRunResult>}
   */
  async run() {
    throw new Error('run() must be implemented by subclass');
  }

  /**
   * Handle completion of the crawl.
   * Called after run() completes, even if it failed.
   * @async
   * @param {ModeRunResult} result - The result from run()
   * @returns {Promise<void>}
   */
  async onComplete(result) {
    // Default no-op; subclasses can override for cleanup
  }

  /**
   * Get mode-specific telemetry data.
   * @returns {Object} Telemetry payload for this mode
   */
  getTelemetryData() {
    return {
      mode: this.modeId,
      displayName: this.displayName
    };
  }

  /**
   * Create a mode strategy instance based on crawl type.
   * Factory method that returns the appropriate strategy.
   * @static
   * @param {string} crawlType - The crawl type from config
   * @param {CrawlModeContext} context - The mode context
   * @returns {CrawlModeStrategy} The appropriate strategy instance
   */
  static create(crawlType, context) {
    // Lazy-load to avoid circular dependencies
    const { isGazetteerMode, isIntelligentMode } = require('../../../shared/config');
    
    if (isGazetteerMode(crawlType)) {
      const GazetteerCrawlMode = require('./GazetteerCrawlMode');
      return new GazetteerCrawlMode(context);
    }
    
    if (isIntelligentMode(crawlType)) {
      const IntelligentCrawlMode = require('./IntelligentCrawlMode');
      return new IntelligentCrawlMode(context);
    }
    
    const BasicCrawlMode = require('./BasicCrawlMode');
    return new BasicCrawlMode(context);
  }
}

module.exports = CrawlModeStrategy;
