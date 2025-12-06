'use strict';

const CrawlModeStrategy = require('./CrawlModeStrategy');

/**
 * Intelligent crawl mode strategy.
 * 
 * This mode uses intelligent planning to optimize crawl efficiency:
 * - Analyzes site structure before crawling
 * - Prioritizes high-value pages (article hubs, recent content)
 * - Adapts crawl strategy based on observed patterns
 * - Uses predictive hub discovery
 * 
 * Intelligent mode features:
 * - Pre-crawl planning phase (via IntelligentPlanRunner)
 * - Adaptive seed selection
 * - Priority-weighted queue ordering
 * - Pattern learning from previous crawls
 * 
 * @extends CrawlModeStrategy
 */
class IntelligentCrawlMode extends CrawlModeStrategy {
  /**
   * @override
   * @returns {string}
   */
  get modeId() {
    return 'intelligent';
  }

  /**
   * @override
   * @returns {string}
   */
  get displayName() {
    return 'Intelligent Crawl';
  }

  /**
   * Intelligent mode requires initialization for planner setup.
   * @override
   * @returns {boolean}
   */
  requiresInit() {
    return true;
  }

  /**
   * Initialize the intelligent mode.
   * Ensures the planner is ready and configured.
   * @override
   * @async
   * @returns {Promise<void>}
   */
  async init() {
    // Mark planner as enabled
    this.crawler.plannerEnabled = true;
    
    // Ensure intelligent plan runner is available
    if (typeof this.crawler._ensureIntelligentPlanRunner === 'function') {
      this.crawler._ensureIntelligentPlanRunner();
    }
    
    // Configure planner verbosity
    if (this.config.plannerVerbosity !== undefined) {
      this.plannerVerbosity = this.config.plannerVerbosity;
    }
    
    // Set up target hosts for focused intelligent crawls
    if (this.config.intTargetHosts) {
      this.targetHosts = new Set(this.config.intTargetHosts);
    }
    
    this.maxSeeds = this.config.intMaxSeeds || 50;
  }

  /**
   * Get the startup sequence for intelligent mode.
   * Includes the planner stage.
   * @override
   * @returns {string[]}
   */
  getStartupSequence() {
    // Intelligent mode: init, run planner, then sitemaps and seed
    return ['init', 'planner', 'sitemaps', 'seedStartUrl', 'markStartupComplete'];
  }

  /**
   * Get the crawl sequence for intelligent mode.
   * Uses concurrent workers for efficiency.
   * @override
   * @returns {string[]}
   */
  getCrawlSequence() {
    // Intelligent mode always uses concurrent workers for efficiency
    return ['runConcurrentWorkers'];
  }

  /**
   * Intelligent mode runs the planner.
   * @override
   * @returns {boolean}
   */
  shouldRunPlanner() {
    return true;
  }

  /**
   * Intelligent mode loads sitemaps as part of planning.
   * @override
   * @returns {boolean}
   */
  shouldLoadSitemaps() {
    return Boolean(this.config.useSitemap);
  }

  /**
   * Configure intelligent-mode-specific services.
   * @override
   * @param {Object} serviceContainer - Container with available services
   */
  configureServices(serviceContainer) {
    // Mark planner as enabled
    this.crawler.plannerEnabled = true;
    
    // Enable adaptive features for intelligent mode
    if (this.crawler.enhancedFeatures) {
      this.crawler.enhancedFeatures.adaptiveSeedPlanner = true;
    }
  }

  /**
   * Run the intelligent crawl.
   * 
   * Intelligent mode:
   * 1. Runs the planner to analyze site structure
   * 2. Seeds the queue with high-priority URLs
   * 3. Processes pages with intelligent priority ordering
   * 4. Adapts strategy based on observed patterns
   * 
   * @override
   * @async
   * @returns {Promise<import('./CrawlModeStrategy').ModeRunResult>}
   */
  async run() {
    const startTime = Date.now();
    
    try {
      // Run the concurrent workers (intelligent mode always uses concurrency)
      await this.crawler._runConcurrentWorkers();
      
      const stats = this.crawler.stats || {};
      const planSummary = this.crawler._intelligentPlanSummary || {};
      
      return {
        ok: true,
        articlesFound: stats.articles || 0,
        pagesProcessed: stats.visited || 0,
        metrics: {
          durationMs: Date.now() - startTime,
          plannerSeeds: planSummary.seedsGenerated || 0,
          plannerHubsIdentified: planSummary.hubsIdentified || 0,
          adaptiveAdjustments: planSummary.adjustments || 0,
          queueExhausted: (stats.queued || 0) === 0,
          errors: stats.errors || 0
        }
      };
    } catch (error) {
      return {
        ok: false,
        reason: error.message || 'Unknown error in intelligent crawl',
        metrics: {
          durationMs: Date.now() - startTime,
          errorType: error.name || 'Error'
        }
      };
    }
  }

  /**
   * Handle intelligent mode completion.
   * Saves planning insights for future crawls.
   * @override
   * @async
   * @param {import('./CrawlModeStrategy').ModeRunResult} result
   * @returns {Promise<void>}
   */
  async onComplete(result) {
    if (result.ok && result.metrics) {
      // Emit telemetry for intelligent mode completion
      this.crawler.telemetry?.milestoneOnce?.('intelligent:complete', {
        kind: 'intelligent-complete',
        message: `Intelligent crawl complete: ${result.pagesProcessed || 0} pages`,
        details: result.metrics
      });
    }
    
    // Save plan summary for future reference
    if (this.crawler.intelligentPlanRunner?.savePlanSummary) {
      try {
        await this.crawler.intelligentPlanRunner.savePlanSummary();
      } catch (error) {
        // Non-fatal: log but don't fail completion
        this.crawler.telemetry?.problem?.({
          kind: 'plan-save-failed',
          message: error.message || 'Failed to save plan summary'
        });
      }
    }
  }

  /**
   * Get telemetry data for intelligent mode.
   * @override
   * @returns {Object}
   */
  getTelemetryData() {
    const planSummary = this.crawler._intelligentPlanSummary || {};
    
    return {
      mode: this.modeId,
      displayName: this.displayName,
      plannerEnabled: true,
      plannerVerbosity: this.plannerVerbosity || 0,
      maxSeeds: this.maxSeeds,
      targetHosts: this.targetHosts ? Array.from(this.targetHosts) : null,
      plannerSeeds: planSummary.seedsGenerated || 0,
      plannerHubs: planSummary.hubsIdentified || 0
    };
  }
}

module.exports = IntelligentCrawlMode;
