'use strict';

const { DiscoveryStrategySelector, STRATEGIES } = require('./DiscoveryStrategySelector');

/**
 * AdaptiveDiscoveryService - Runtime strategy switching for crawls
 * 
 * Integrates DiscoveryStrategySelector with the crawler to:
 * 1. Choose initial strategy based on site capabilities
 * 2. Monitor effectiveness metrics in real-time
 * 3. Switch strategies when current one underperforms
 * 4. Blend multiple strategies for optimal coverage
 * 
 * This service acts as a bridge between the low-level selector
 * and the crawler's URL discovery pipeline.
 * 
 * @example
 *   const service = new AdaptiveDiscoveryService({ db });
 *   await service.initialize('bbc.com', { hasSitemap: true, sitemapUrls: 5000 });
 *   
 *   // During crawl loop:
 *   const strategy = service.getCurrentStrategy();
 *   // ... fetch URLs using strategy ...
 *   service.recordFetch(url, { success: true, isArticle: true });
 *   
 *   // Check if we should switch
 *   if (service.shouldSwitchStrategy()) {
 *     const newStrategy = await service.switchStrategy();
 *   }
 */

class AdaptiveDiscoveryService {
  /**
   * @param {Object} options
   * @param {Object} options.db - Database handle
   * @param {Object} [options.logger=console]
   * @param {number} [options.switchCheckInterval=20] - Check switch every N fetches
   * @param {number} [options.minFetchesBeforeSwitch=30] - Min fetches before allowing switch
   * @param {number} [options.errorRateThreshold=0.4] - Error rate that triggers immediate switch
   * @param {number} [options.yieldDropThreshold=0.3] - Yield drop % that triggers switch
   */
  constructor({
    db = null,
    logger = console,
    switchCheckInterval = 20,
    minFetchesBeforeSwitch = 30,
    errorRateThreshold = 0.4,
    yieldDropThreshold = 0.3
  } = {}) {
    this.selector = new DiscoveryStrategySelector({ db, logger });
    this.logger = logger;
    
    this.switchCheckInterval = switchCheckInterval;
    this.minFetchesBeforeSwitch = minFetchesBeforeSwitch;
    this.errorRateThreshold = errorRateThreshold;
    this.yieldDropThreshold = yieldDropThreshold;

    // Current state
    this.domain = null;
    this.currentStrategy = null;
    this.strategyStartedAt = null;
    this.fetchesSinceSwitch = 0;
    this.fetchesSinceCheck = 0;
    
    // Metrics window for recent performance
    this.recentWindow = [];
    this.windowSize = 50;
    
    // Strategy history for this crawl
    this.strategyHistory = [];

    // Blend mode: run multiple strategies simultaneously
    this.blendMode = false;
    this.blendRatios = null;
  }

  /**
   * Initialize the service for a domain
   * 
   * @param {string} domain
   * @param {Object} capabilities - Site capabilities
   * @param {boolean} capabilities.hasSitemap
   * @param {number} [capabilities.sitemapUrls=0]
   * @param {string[]} [capabilities.sitemapLocations=[]]
   * @returns {Promise<string>} Selected initial strategy
   */
  async initialize(domain, capabilities = {}) {
    this.domain = domain;
    this.fetchesSinceSwitch = 0;
    this.fetchesSinceCheck = 0;
    this.recentWindow = [];
    this.strategyHistory = [];
    
    // Register capabilities
    this.selector.registerSitemapCapability(domain, {
      hasSitemap: capabilities.hasSitemap || false,
      urlCount: capabilities.sitemapUrls || 0,
      sitemapUrls: capabilities.sitemapLocations || []
    });

    // Select initial strategy
    const selection = await this.selector.selectStrategy(domain, { phase: 'initial' });
    
    this.currentStrategy = selection.strategy;
    this.strategyStartedAt = Date.now();
    
    this.strategyHistory.push({
      strategy: selection.strategy,
      startedAt: this.strategyStartedAt,
      reason: selection.reason
    });

    this.logger.info(
      `[AdaptiveDiscovery] Initialized for ${domain}: ` +
      `strategy=${selection.strategy}, confidence=${selection.confidence}`
    );

    return selection.strategy;
  }

  /**
   * Get the current active strategy
   * @returns {string} Current strategy name
   */
  getCurrentStrategy() {
    return this.currentStrategy;
  }

  /**
   * Get blend ratios if running in blend mode
   * @returns {Object|null} Ratios by strategy, or null if not blending
   */
  getBlendRatios() {
    return this.blendMode ? this.blendRatios : null;
  }

  /**
   * Enable blend mode: run multiple strategies with weighted allocation
   * @param {boolean} [enabled=true]
   */
  enableBlendMode(enabled = true) {
    this.blendMode = enabled;
    if (enabled && this.domain) {
      this.blendRatios = this.selector.getBlendRatios(this.domain);
      this.logger.info(
        `[AdaptiveDiscovery] Blend mode enabled: ${JSON.stringify(this.blendRatios)}`
      );
    }
  }

  /**
   * Record a fetch outcome
   * 
   * @param {string} url - URL that was fetched
   * @param {Object} outcome
   * @param {boolean} outcome.success - HTTP 200?
   * @param {boolean} [outcome.isArticle=false]
   * @param {number} [outcome.newUrls=0] - New URLs discovered
   * @param {number} [outcome.httpStatus=0]
   * @param {number} [outcome.fetchTimeMs=0]
   * @param {string} [outcome.strategy] - Override strategy (for blend mode)
   */
  async recordFetch(url, outcome) {
    const strategy = outcome.strategy || this.currentStrategy;
    
    // Record to selector
    await this.selector.recordOutcome(this.domain, strategy, {
      success: outcome.success,
      isArticle: outcome.isArticle || false,
      newUrlsDiscovered: outcome.newUrls || 0,
      httpStatus: outcome.httpStatus || 0,
      fetchTimeMs: outcome.fetchTimeMs || 0
    });

    // Track in recent window
    this.recentWindow.push({
      success: outcome.success,
      isArticle: outcome.isArticle || false,
      timestamp: Date.now()
    });
    
    if (this.recentWindow.length > this.windowSize) {
      this.recentWindow.shift();
    }

    this.fetchesSinceSwitch++;
    this.fetchesSinceCheck++;

    // Update blend ratios periodically
    if (this.blendMode && this.fetchesSinceCheck >= this.switchCheckInterval) {
      this.blendRatios = this.selector.getBlendRatios(this.domain);
      this.fetchesSinceCheck = 0;
    }
  }

  /**
   * Check if we should switch strategies
   * @returns {boolean}
   */
  shouldSwitchStrategy() {
    // Don't switch too early
    if (this.fetchesSinceSwitch < this.minFetchesBeforeSwitch) {
      return false;
    }

    // Only check periodically
    if (this.fetchesSinceCheck < this.switchCheckInterval) {
      return false;
    }

    const metrics = this._getRecentMetrics();
    
    // Immediate switch triggers
    if (metrics.errorRate > this.errorRateThreshold) {
      this.logger.warn(
        `[AdaptiveDiscovery] High error rate: ${(metrics.errorRate * 100).toFixed(0)}%`
      );
      return true;
    }

    // Check for significant yield drop
    const stats = this.selector.getStats(this.domain);
    const currentStats = stats[this.currentStrategy];
    
    if (currentStats && currentStats.attempts > this.minFetchesBeforeSwitch) {
      // Compare recent window to overall
      if (metrics.articleYield < currentStats.articleYield * (1 - this.yieldDropThreshold)) {
        this.logger.warn(
          `[AdaptiveDiscovery] Yield dropped: ` +
          `${(metrics.articleYield * 100).toFixed(0)}% vs ` +
          `${(currentStats.articleYield * 100).toFixed(0)}% overall`
        );
        return true;
      }
    }

    // Check if another strategy might be better
    const selection = this.selector.selectStrategy(this.domain, { phase: 'crawling' });
    if (selection.strategy !== this.currentStrategy && selection.confidence !== 'low') {
      // Only switch if new strategy is significantly better
      const newStats = stats[selection.strategy];
      if (newStats && newStats.articleYield > metrics.articleYield * 1.3) {
        return true;
      }
    }

    return false;
  }

  /**
   * Switch to a new strategy
   * @param {string} [forceStrategy] - Force switch to specific strategy
   * @returns {Promise<string>} New strategy
   */
  async switchStrategy(forceStrategy = null) {
    const oldStrategy = this.currentStrategy;
    
    // End current strategy record
    if (this.strategyHistory.length > 0) {
      const current = this.strategyHistory[this.strategyHistory.length - 1];
      current.endedAt = Date.now();
      current.fetches = this.fetchesSinceSwitch;
      current.metrics = this._getRecentMetrics();
    }

    // Select new strategy
    let newStrategy;
    if (forceStrategy) {
      newStrategy = forceStrategy;
    } else {
      // Exclude current strategy to force a switch
      const available = Object.values(STRATEGIES).filter(s => s !== oldStrategy);
      const selection = await this.selector.selectStrategy(this.domain, {
        phase: 'crawling',
        availableStrategies: available,
        forceExplore: true
      });
      newStrategy = selection.strategy;
    }

    this.currentStrategy = newStrategy;
    this.strategyStartedAt = Date.now();
    this.fetchesSinceSwitch = 0;
    this.fetchesSinceCheck = 0;

    this.strategyHistory.push({
      strategy: newStrategy,
      startedAt: this.strategyStartedAt,
      reason: forceStrategy ? 'forced' : 'adaptive-switch',
      previousStrategy: oldStrategy
    });

    this.logger.info(
      `[AdaptiveDiscovery] Switched strategy: ${oldStrategy} → ${newStrategy}`
    );

    return newStrategy;
  }

  /**
   * Get summary of the crawl's strategy usage
   * @returns {Object} Summary with history and metrics
   */
  getSummary() {
    const stats = this.selector.getStats(this.domain);
    
    // Calculate per-strategy totals
    const strategyTotals = {};
    for (const record of this.strategyHistory) {
      if (!strategyTotals[record.strategy]) {
        strategyTotals[record.strategy] = { duration: 0, fetches: 0 };
      }
      const duration = (record.endedAt || Date.now()) - record.startedAt;
      strategyTotals[record.strategy].duration += duration;
      strategyTotals[record.strategy].fetches += record.fetches || 0;
    }

    return {
      domain: this.domain,
      currentStrategy: this.currentStrategy,
      switchCount: this.strategyHistory.length - 1,
      history: this.strategyHistory,
      strategyTotals,
      stats,
      recentMetrics: this._getRecentMetrics(),
      recommendation: this.selector.getRecommendation(this.domain)
    };
  }

  /**
   * Get metrics from the recent window
   * @private
   */
  _getRecentMetrics() {
    if (this.recentWindow.length === 0) {
      return { errorRate: 0, articleYield: 0, successRate: 0 };
    }

    const successes = this.recentWindow.filter(r => r.success).length;
    const articles = this.recentWindow.filter(r => r.isArticle).length;
    const total = this.recentWindow.length;

    return {
      errorRate: 1 - (successes / total),
      articleYield: successes > 0 ? articles / successes : 0,
      successRate: successes / total,
      windowSize: total
    };
  }
}

module.exports = { AdaptiveDiscoveryService };
