'use strict';

/**
 * DiscoveryStrategySelector - Adaptive URL discovery strategy selection
 * 
 * Dynamically selects and balances between discovery strategies based on
 * real-time effectiveness measurements:
 * 
 * Strategies:
 * - sitemap: Parse sitemap.xml/news-sitemap.xml for URLs
 * - aps: Advanced Planning System hub guessing (country hubs, topic hubs)
 * - linkFollow: Follow links from fetched pages
 * - homepage: Seed from homepage links only
 * 
 * Metrics tracked per strategy per domain:
 * - successRate: % of URLs that return 200
 * - articleYield: % of pages that are actual articles
 * - discoveryRate: new unique URLs found per fetch
 * - throughput: articles per minute
 * 
 * Uses Thompson Sampling to balance exploration vs exploitation:
 * - Try underexplored strategies to learn their effectiveness
 * - Favor strategies with proven high success rates
 * - Automatically recover from strategy failures
 * 
 * @example
 *   const selector = new DiscoveryStrategySelector({ db });
 *   const strategy = await selector.selectStrategy('bbc.com', { phase: 'initial' });
 *   // Later, after fetching:
 *   await selector.recordOutcome('bbc.com', 'sitemap', { success: true, isArticle: true });
 */

const STRATEGIES = {
  SITEMAP: 'sitemap',
  APS: 'aps',
  LINK_FOLLOW: 'linkFollow',
  HOMEPAGE: 'homepage'
};

const STRATEGY_PRIORITIES = {
  // Default priority order for initial selection
  initial: [STRATEGIES.SITEMAP, STRATEGIES.HOMEPAGE, STRATEGIES.LINK_FOLLOW, STRATEGIES.APS],
  // When sitemap is sparse
  sparse: [STRATEGIES.LINK_FOLLOW, STRATEGIES.APS, STRATEGIES.SITEMAP, STRATEGIES.HOMEPAGE],
  // When experiencing high error rates
  defensive: [STRATEGIES.SITEMAP, STRATEGIES.HOMEPAGE],
  // When exploring unknown site
  exploratory: [STRATEGIES.SITEMAP, STRATEGIES.APS, STRATEGIES.LINK_FOLLOW, STRATEGIES.HOMEPAGE]
};

class DiscoveryStrategySelector {
  /**
   * @param {Object} options
   * @param {Object} options.db - Database handle
   * @param {Object} [options.logger=console] - Logger instance
   * @param {number} [options.explorationRate=0.15] - Base exploration rate (0-1)
   * @param {number} [options.minSamples=10] - Minimum samples before trusting metrics
   * @param {number} [options.errorThreshold=0.4] - Error rate that triggers strategy switch
   * @param {number} [options.articleYieldThreshold=0.2] - Min article yield to consider strategy good
   */
  constructor({
    db = null,
    logger = console,
    explorationRate = 0.15,
    minSamples = 10,
    errorThreshold = 0.4,
    articleYieldThreshold = 0.2
  } = {}) {
    this.db = db;
    this.logger = logger;
    this.explorationRate = explorationRate;
    this.minSamples = minSamples;
    this.errorThreshold = errorThreshold;
    this.articleYieldThreshold = articleYieldThreshold;

    // In-memory stats per domain per strategy
    // Structure: Map<domain, Map<strategy, StrategyStats>>
    this.stats = new Map();
    
    // Recent decisions for debugging
    this.recentDecisions = [];
    this.maxRecentDecisions = 100;

    // Strategy-specific capabilities cache
    // Structure: Map<domain, { hasSitemap, sitemapCount, sitemapUrls, lastChecked }>
    this.capabilities = new Map();
  }

  /**
   * Select the best discovery strategy for a domain
   * 
   * @param {string} domain - The domain to select strategy for
   * @param {Object} context - Selection context
   * @param {string} [context.phase='crawling'] - Crawl phase (initial, crawling, finishing)
   * @param {number} [context.queueDepth=0] - Current queue depth
   * @param {number} [context.errorRate=0] - Recent error rate
   * @param {number} [context.timeRemaining=null] - Time budget remaining (seconds)
   * @param {string[]} [context.availableStrategies] - Limit to these strategies
   * @param {boolean} [context.forceExplore=false] - Force exploration mode
   * @returns {Promise<StrategySelection>}
   */
  async selectStrategy(domain, context = {}) {
    const {
      phase = 'crawling',
      queueDepth = 0,
      errorRate = 0,
      timeRemaining = null,
      availableStrategies = null,
      forceExplore = false
    } = context;

    // Get domain stats
    const domainStats = this._getDomainStats(domain);
    
    // Get capabilities (sitemap availability etc)
    const caps = this.capabilities.get(domain) || {};

    // Determine candidate strategies
    let candidates = availableStrategies || this._getCandidates(phase, caps, errorRate);
    
    // Filter to strategies with enough data or unexplored ones
    const evaluatedCandidates = candidates.map(strategy => ({
      strategy,
      stats: domainStats.get(strategy) || this._createEmptyStats(),
      score: this._computeScore(domainStats.get(strategy), { phase, queueDepth, errorRate })
    }));

    // Select using Thompson Sampling or exploit best known
    let selected;
    let reason;

    if (forceExplore || Math.random() < this.explorationRate) {
      // Exploration: try underexplored strategy
      selected = this._selectUnderexplored(evaluatedCandidates);
      reason = 'exploration';
    } else {
      // Exploitation: use best performing strategy
      selected = this._selectBest(evaluatedCandidates);
      reason = 'exploitation';
    }

    // Record decision
    const decision = {
      domain,
      strategy: selected.strategy,
      reason,
      score: selected.score,
      phase,
      timestamp: new Date().toISOString(),
      alternatives: evaluatedCandidates.map(c => ({ strategy: c.strategy, score: c.score }))
    };
    
    this._recordDecision(decision);

    return {
      strategy: selected.strategy,
      confidence: this._computeConfidence(selected.stats),
      reason,
      metrics: selected.stats,
      recommendation: this._getRecommendation(selected, evaluatedCandidates)
    };
  }

  /**
   * Record outcome of a fetch to update strategy effectiveness
   * 
   * @param {string} domain - Domain that was fetched
   * @param {string} strategy - Strategy that produced the URL
   * @param {Object} outcome - Fetch outcome
   * @param {boolean} outcome.success - HTTP 200?
   * @param {boolean} [outcome.isArticle=false] - Is the page an article?
   * @param {number} [outcome.newUrlsDiscovered=0] - New URLs found on page
   * @param {number} [outcome.fetchTimeMs=0] - Time to fetch
   * @param {number} [outcome.httpStatus=0] - HTTP status code
   */
  async recordOutcome(domain, strategy, outcome) {
    const {
      success,
      isArticle = false,
      newUrlsDiscovered = 0,
      fetchTimeMs = 0,
      httpStatus = 0
    } = outcome;

    const domainStats = this._getDomainStats(domain);
    let stats = domainStats.get(strategy);
    
    if (!stats) {
      stats = this._createEmptyStats();
      domainStats.set(strategy, stats);
    }

    // Update counts
    stats.attempts++;
    if (success) stats.successes++;
    if (isArticle) stats.articles++;
    stats.urlsDiscovered += newUrlsDiscovered;
    stats.totalFetchTimeMs += fetchTimeMs;

    // Track error types
    if (!success && httpStatus) {
      const errorKey = `http${httpStatus}`;
      stats.errorBreakdown[errorKey] = (stats.errorBreakdown[errorKey] || 0) + 1;
    }

    // Update computed metrics
    stats.successRate = stats.attempts > 0 ? stats.successes / stats.attempts : 0;
    stats.articleYield = stats.successes > 0 ? stats.articles / stats.successes : 0;
    stats.discoveryRate = stats.attempts > 0 ? stats.urlsDiscovered / stats.attempts : 0;
    stats.avgFetchTime = stats.attempts > 0 ? stats.totalFetchTimeMs / stats.attempts : 0;

    // Update Thompson Sampling parameters (Beta distribution)
    if (isArticle) {
      stats.alpha += 1; // Success
    } else if (success) {
      stats.alpha += 0.5; // Partial success (page fetched but not article)
    } else {
      stats.beta += 1; // Failure
    }

    stats.lastUpdated = new Date().toISOString();

    // Check for strategy degradation
    this._checkForDegradation(domain, strategy, stats);
  }

  /**
   * Register sitemap availability for a domain
   * 
   * @param {string} domain
   * @param {Object} sitemapInfo
   * @param {boolean} sitemapInfo.hasSitemap
   * @param {number} [sitemapInfo.urlCount=0]
   * @param {string[]} [sitemapInfo.sitemapUrls=[]]
   */
  registerSitemapCapability(domain, sitemapInfo) {
    this.capabilities.set(domain, {
      ...this.capabilities.get(domain),
      hasSitemap: sitemapInfo.hasSitemap,
      sitemapCount: sitemapInfo.urlCount || 0,
      sitemapUrls: sitemapInfo.sitemapUrls || [],
      lastChecked: new Date().toISOString()
    });
  }

  /**
   * Get current stats for a domain
   * @param {string} domain
   * @returns {Object} Stats by strategy
   */
  getStats(domain) {
    const domainStats = this._getDomainStats(domain);
    const result = {};
    
    for (const [strategy, stats] of domainStats) {
      result[strategy] = { ...stats };
    }
    
    return result;
  }

  /**
   * Get strategy recommendation for a domain based on historical data
   * @param {string} domain
   * @returns {Object} Recommendation with reasoning
   */
  getRecommendation(domain) {
    const domainStats = this._getDomainStats(domain);
    const caps = this.capabilities.get(domain) || {};

    // Find best performing strategy
    let bestStrategy = null;
    let bestScore = -1;

    for (const [strategy, stats] of domainStats) {
      if (stats.attempts >= this.minSamples) {
        const score = this._computeScore(stats, {});
        if (score > bestScore) {
          bestScore = score;
          bestStrategy = strategy;
        }
      }
    }

    // Generate recommendation
    const reasoning = [];

    if (caps.hasSitemap && caps.sitemapCount > 1000) {
      reasoning.push(`Domain has ${caps.sitemapCount} URLs in sitemap`);
    }

    if (bestStrategy) {
      const stats = domainStats.get(bestStrategy);
      reasoning.push(`${bestStrategy} has ${(stats.successRate * 100).toFixed(0)}% success rate`);
      reasoning.push(`${bestStrategy} yields ${(stats.articleYield * 100).toFixed(0)}% articles`);
    }

    // Check for problem strategies
    for (const [strategy, stats] of domainStats) {
      if (stats.attempts >= this.minSamples && stats.successRate < 0.5) {
        reasoning.push(`⚠️ ${strategy} has low success rate (${(stats.successRate * 100).toFixed(0)}%)`);
      }
    }

    return {
      recommendedStrategy: bestStrategy || STRATEGIES.SITEMAP,
      confidence: bestStrategy ? this._computeConfidence(domainStats.get(bestStrategy)) : 'low',
      reasoning,
      capabilities: caps
    };
  }

  /**
   * Get blend ratios for running multiple strategies in parallel
   * 
   * @param {string} domain
   * @returns {Object} Strategy ratios (sum to 1.0)
   */
  getBlendRatios(domain) {
    const domainStats = this._getDomainStats(domain);
    const caps = this.capabilities.get(domain) || {};

    // Calculate scores for each strategy
    const scores = {};
    let totalScore = 0;

    for (const strategy of Object.values(STRATEGIES)) {
      const stats = domainStats.get(strategy) || this._createEmptyStats();
      const score = this._computeScore(stats, {});
      
      // Apply capability multipliers
      if (strategy === STRATEGIES.SITEMAP && !caps.hasSitemap) {
        scores[strategy] = 0; // No sitemap available
      } else {
        scores[strategy] = Math.max(0.01, score); // Minimum 1% for exploration
      }
      
      totalScore += scores[strategy];
    }

    // Normalize to ratios
    const ratios = {};
    for (const [strategy, score] of Object.entries(scores)) {
      ratios[strategy] = totalScore > 0 ? score / totalScore : 0.25; // Equal if no data
    }

    return ratios;
  }

  /**
   * Reset stats for a domain (useful for testing or after major site changes)
   * @param {string} domain
   */
  resetDomain(domain) {
    this.stats.delete(domain);
    this.capabilities.delete(domain);
  }

  // ─────────────────────────────────────────────────────────────
  // Private methods
  // ─────────────────────────────────────────────────────────────

  _getDomainStats(domain) {
    if (!this.stats.has(domain)) {
      this.stats.set(domain, new Map());
    }
    return this.stats.get(domain);
  }

  _createEmptyStats() {
    return {
      attempts: 0,
      successes: 0,
      articles: 0,
      urlsDiscovered: 0,
      totalFetchTimeMs: 0,
      successRate: 0,
      articleYield: 0,
      discoveryRate: 0,
      avgFetchTime: 0,
      errorBreakdown: {},
      // Thompson Sampling parameters
      alpha: 1, // Prior successes (start with 1 for uninformative prior)
      beta: 1,  // Prior failures
      lastUpdated: null
    };
  }

  _getCandidates(phase, caps, errorRate) {
    // Choose priority list based on context
    if (errorRate > this.errorThreshold) {
      return STRATEGY_PRIORITIES.defensive;
    }
    if (phase === 'initial') {
      return caps.hasSitemap ? STRATEGY_PRIORITIES.initial : STRATEGY_PRIORITIES.exploratory;
    }
    if (caps.hasSitemap && caps.sitemapCount < 100) {
      return STRATEGY_PRIORITIES.sparse;
    }
    return STRATEGY_PRIORITIES.initial;
  }

  _computeScore(stats, context) {
    if (!stats || stats.attempts === 0) {
      return 0.5; // Neutral score for unexplored strategies
    }

    // Weighted combination of metrics
    const weights = {
      successRate: 0.3,
      articleYield: 0.4,
      discoveryRate: 0.2,
      speed: 0.1
    };

    // Normalize speed (faster is better, cap at 5 seconds)
    const speedScore = stats.avgFetchTime > 0 
      ? Math.max(0, 1 - (stats.avgFetchTime / 5000)) 
      : 0.5;

    const score = (
      weights.successRate * stats.successRate +
      weights.articleYield * stats.articleYield +
      weights.discoveryRate * Math.min(1, stats.discoveryRate / 5) + // Normalize to max 5 URLs/page
      weights.speed * speedScore
    );

    // Confidence adjustment: reduce score for low sample sizes
    const confidenceFactor = Math.min(1, stats.attempts / this.minSamples);
    
    return score * (0.5 + 0.5 * confidenceFactor);
  }

  _selectBest(candidates) {
    return candidates.reduce((best, current) => 
      current.score > best.score ? current : best
    );
  }

  _selectUnderexplored(candidates) {
    // Thompson Sampling: sample from Beta distribution for each candidate
    const samples = candidates.map(c => ({
      ...c,
      sample: this._sampleBeta(c.stats.alpha, c.stats.beta)
    }));

    // Select candidate with highest sample
    return samples.reduce((best, current) => 
      current.sample > best.sample ? current : best
    );
  }

  _sampleBeta(alpha, beta) {
    // Simple Beta distribution sampling using gamma approximation
    const gammaAlpha = this._sampleGamma(alpha);
    const gammaBeta = this._sampleGamma(beta);
    return gammaAlpha / (gammaAlpha + gammaBeta);
  }

  _sampleGamma(shape) {
    // Marsaglia and Tsang's method for gamma distribution
    if (shape < 1) {
      return this._sampleGamma(1 + shape) * Math.pow(Math.random(), 1 / shape);
    }
    
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    
    while (true) {
      let x, v;
      do {
        x = this._randomNormal();
        v = 1 + c * x;
      } while (v <= 0);
      
      v = v * v * v;
      const u = Math.random();
      
      if (u < 1 - 0.0331 * (x * x) * (x * x)) {
        return d * v;
      }
      
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
        return d * v;
      }
    }
  }

  _randomNormal() {
    // Box-Muller transform
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  _computeConfidence(stats) {
    if (!stats || stats.attempts < this.minSamples / 2) return 'low';
    if (stats.attempts < this.minSamples) return 'medium';
    
    // High confidence if consistent results
    const variance = (stats.alpha * stats.beta) / 
      ((stats.alpha + stats.beta) ** 2 * (stats.alpha + stats.beta + 1));
    
    return variance < 0.05 ? 'high' : 'medium';
  }

  _getRecommendation(selected, alternatives) {
    const recommendations = [];
    
    // Check if selected strategy is significantly better
    const otherGood = alternatives.filter(a => 
      a.strategy !== selected.strategy && a.score > 0.5
    );
    
    if (otherGood.length > 0) {
      recommendations.push(`Also consider: ${otherGood.map(a => a.strategy).join(', ')}`);
    }

    // Check for strategy-specific advice
    if (selected.strategy === STRATEGIES.SITEMAP && selected.stats.attempts > 0) {
      if (selected.stats.discoveryRate < 1) {
        recommendations.push('Sitemap may be sparse - consider blending with link following');
      }
    }

    if (selected.strategy === STRATEGIES.APS && selected.stats.successRate < 0.5) {
      recommendations.push('APS hub guessing has low success - try sitemap or homepage seeds');
    }

    return recommendations.join('; ') || null;
  }

  _recordDecision(decision) {
    this.recentDecisions.push(decision);
    if (this.recentDecisions.length > this.maxRecentDecisions) {
      this.recentDecisions.shift();
    }
  }

  _checkForDegradation(domain, strategy, stats) {
    // Emit warning if strategy is performing poorly
    if (stats.attempts >= this.minSamples) {
      if (stats.successRate < 0.5) {
        this.logger.warn(
          `[DiscoveryStrategySelector] ${strategy} degraded for ${domain}: ` +
          `${(stats.successRate * 100).toFixed(0)}% success rate`
        );
      }
      if (stats.articleYield < this.articleYieldThreshold && stats.successes > 10) {
        this.logger.warn(
          `[DiscoveryStrategySelector] ${strategy} low yield for ${domain}: ` +
          `${(stats.articleYield * 100).toFixed(0)}% article yield`
        );
      }
    }
  }
}

module.exports = {
  DiscoveryStrategySelector,
  STRATEGIES,
  STRATEGY_PRIORITIES
};
