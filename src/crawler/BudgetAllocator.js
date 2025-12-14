const { getDb } = require('../db');

/**
 * Budget Allocator - Intelligent resource allocation
 * 
 * Dynamically allocates crawl resources based on predicted value:
 * - Hub richness estimation (article yield prediction)
 * - ROI-based depth allocation
 * - Exhaustion detection
 * - Optimal depth-per-hub-type learning
 */

class BudgetAllocator {
  constructor({ db, logger = console } = {}) {
    this.db = db;
    if (!this.db) this.db = getDb();
    if (this.db && typeof this.db.getHandle === 'function') this.db = this.db.getHandle();

    this.logger = logger;

    // Budget tracking
    this.budgetAllocations = new Map(); // domain -> allocation
    this.hubStats = new Map(); // hubUrl -> statistics

    // Learned optimal depths
    this.optimalDepths = {
      'section-hub': 3,
      'country-hub': 5,
      'region-hub': 4,
      'city-hub': 3,
      'topic-hub': 4
    };

    // Resource costs (relative units)
    this.costs = {
      request: 1.0,
      parse: 0.5,
      analyze: 0.3
    };
  }

  /**
   * Allocate budget for a domain crawl
   */
  async allocateBudget(domain, totalBudget, context = {}) {
    const allocation = {
      domain,
      totalBudget,
      allocated: 0,
      remaining: totalBudget,
      hubAllocations: [],
      strategy: context.strategy || 'balanced',
      timestamp: new Date().toISOString()
    };

    // Get hub tree for analysis
    const hubTree = await this._loadHubTree(domain);
    
    // Estimate value for each hub
    const hubEstimates = await this._estimateHubValues(domain, hubTree, context);

    // Sort by ROI (value / cost)
    hubEstimates.sort((a, b) => b.roi - a.roi);

    // Allocate budget by ROI
    for (const estimate of hubEstimates) {
      if (allocation.remaining < estimate.cost) {
        break; // Out of budget
      }

      const depth = this._determineOptimalDepth(estimate);
      const adjustedCost = estimate.cost * this._getDepthMultiplier(depth);

      allocation.hubAllocations.push({
        url: estimate.url,
        hubType: estimate.hubType,
        estimatedValue: estimate.estimatedValue,
        cost: adjustedCost,
        depth,
        roi: estimate.roi,
        confidence: estimate.confidence
      });

      allocation.allocated += adjustedCost;
      allocation.remaining -= adjustedCost;
    }

    this.budgetAllocations.set(domain, allocation);

    this.logger.log?.('[Budget]', `Allocated ${allocation.allocated.toFixed(0)}/${totalBudget} units across ${allocation.hubAllocations.length} hubs`);

    return allocation;
  }

  /**
   * Estimate value of a hub (predicted article count)
   */
  async estimateHubValue(domain, hubUrl, hubType, context = {}) {
    const key = `${domain}:${hubUrl}`;
    
    // Check cache
    if (this.hubStats.has(key)) {
      const cached = this.hubStats.get(key);
      if (Date.now() - cached.timestamp < 3600000) { // 1 hour cache
        return cached.estimatedValue;
      }
    }

    let estimatedValue = 0;
    const factors = [];

    // Factor 1: Hub type baseline
    const typeBaseline = this._getTypeBaseline(hubType);
    estimatedValue += typeBaseline;
    factors.push({ name: 'type_baseline', value: typeBaseline });

    // Factor 2: Historical performance
    const historical = await this._getHistoricalPerformance(domain, hubUrl);
    if (historical) {
      estimatedValue += historical.avgArticles * 0.7; // Weight historical data
      factors.push({ name: 'historical', value: historical.avgArticles });
    }

    // Factor 3: Place attributes (population, importance)
    const placeAttrs = await this._getPlaceAttributes(hubUrl, context);
    if (placeAttrs) {
      const popScore = placeAttrs.population ? Math.log10(placeAttrs.population + 1) * 2 : 0;
      estimatedValue += popScore;
      factors.push({ name: 'population', value: popScore });

      if (placeAttrs.isCapital) {
        estimatedValue *= 1.5; // Capitals get bonus
        factors.push({ name: 'capital_bonus', value: 1.5 });
      }
    }

    // Factor 4: Sibling hub performance
    const siblingPerf = await this._getSiblingPerformance(domain, hubUrl, hubType);
    if (siblingPerf) {
      estimatedValue += siblingPerf * 0.3;
      factors.push({ name: 'sibling', value: siblingPerf });
    }

    // Factor 5: Parent hub richness (if child hub)
    const parentRichness = await this._getParentRichness(domain, hubUrl);
    if (parentRichness) {
      estimatedValue += parentRichness * 0.4;
      factors.push({ name: 'parent', value: parentRichness });
    }

    // Confidence based on data availability
    const confidence = this._calculateEstimateConfidence(factors);

    const estimate = {
      url: hubUrl,
      hubType,
      estimatedValue: Math.max(1, Math.round(estimatedValue)),
      confidence,
      factors,
      timestamp: Date.now()
    };

    this.hubStats.set(key, estimate);

    return estimate.estimatedValue;
  }

  /**
   * Update estimates based on actual crawl results
   */
  async updateHubPerformance(domain, hubUrl, hubType, actualArticles, depth) {
    const key = `${domain}:${hubUrl}`;
    
    // Update statistics
    const perf = {
      url: hubUrl,
      hubType,
      actualArticles,
      depth,
      timestamp: new Date().toISOString(),
      efficiency: actualArticles / depth // Articles per depth unit
    };

    if (!this.db) {
      this.hubStats.set(key, { ...perf, timestamp: Date.now() });
      return;
    }

    try {
      // Store in database for learning
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO hub_performance (
          domain, hub_url, hub_type, articles_found, depth_explored,
          efficiency, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `);

      stmt.run(domain, hubUrl, hubType, actualArticles, depth, perf.efficiency);

      // Update optimal depth learning
      await this._learnOptimalDepth(hubType, depth, perf.efficiency);

      this.logger.log?.('[Budget]', `Updated ${hubUrl}: ${actualArticles} articles at depth ${depth} (efficiency: ${perf.efficiency.toFixed(2)})`);
    } catch (error) {
      this.logger.error?.('Failed to update hub performance', error);
    }
  }

  /**
   * Check if hub is exhausted (no new articles being found)
   */
  isHubExhausted(domain, hubUrl, recentArticles = []) {
    if (recentArticles.length === 0) {
      return true;
    }

    // Check diminishing returns
    const lastN = recentArticles.slice(-10);
    const previousN = recentArticles.slice(-20, -10);

    if (previousN.length === 0) {
      return false; // Not enough history
    }

    const recentRate = lastN.length / 10;
    const previousRate = previousN.length / 10;

    // Exhausted if recent rate drops below 20% of previous rate
    return recentRate < previousRate * 0.2;
  }

  /**
   * Get recommended depth for a hub
   */
  getRecommendedDepth(hubType, estimatedValue, context = {}) {
    // Base depth from learned optimal
    let depth = this.optimalDepths[hubType] || 3;

    // Adjust based on estimated value
    if (estimatedValue > 100) {
      depth += 2; // Rich hub, go deeper
    } else if (estimatedValue > 50) {
      depth += 1;
    } else if (estimatedValue < 10) {
      depth -= 1; // Sparse hub, shallow crawl
    }

    // Adjust based on strategy
    if (context.strategy === 'fast') {
      depth = Math.max(2, depth - 1);
    } else if (context.strategy === 'thorough') {
      depth += 1;
    }

    // Enforce limits
    return Math.max(2, Math.min(depth, 8));
  }

  /**
   * Get ROI (return on investment) for a hub
   */
  calculateROI(estimatedValue, depth, hubType) {
    const cost = this._estimateCrawlCost(depth, hubType);
    return cost > 0 ? estimatedValue / cost : 0;
  }

  /**
   * Get budget utilization stats
   */
  getBudgetStats(domain) {
    const allocation = this.budgetAllocations.get(domain);
    if (!allocation) {
      return null;
    }

    const stats = {
      domain,
      totalBudget: allocation.totalBudget,
      allocated: allocation.allocated,
      remaining: allocation.remaining,
      utilization: allocation.allocated / allocation.totalBudget,
      hubCount: allocation.hubAllocations.length,
      avgAllocationPerHub: allocation.allocated / allocation.hubAllocations.length,
      topHubs: allocation.hubAllocations.slice(0, 5).map(h => ({
        url: h.url,
        value: h.estimatedValue,
        roi: h.roi
      }))
    };

    return stats;
  }

  // Private helpers

  async _loadHubTree(domain) {
    if (!this.db) return { levels: [], byType: {} };

    try {
      const stmt = this.db.prepare(`
        SELECT knowledge_value FROM cross_crawl_knowledge
        WHERE source_domain = ? AND knowledge_type = 'hub-tree'
        ORDER BY updated_at DESC LIMIT 1
      `);
      const row = stmt.get(domain);
      return row ? JSON.parse(row.knowledge_value) : { levels: [], byType: {} };
    } catch (error) {
      return { levels: [], byType: {} };
    }
  }

  async _estimateHubValues(domain, hubTree, context) {
    const estimates = [];

    for (const level of hubTree.levels || []) {
      for (const hub of level) {
        const estimatedValue = await this.estimateHubValue(domain, hub.url, hub.type, context);
        const depth = this.getRecommendedDepth(hub.type, estimatedValue, context);
        const cost = this._estimateCrawlCost(depth, hub.type);
        const roi = this.calculateROI(estimatedValue, depth, hub.type);

        estimates.push({
          url: hub.url,
          hubType: hub.type,
          estimatedValue,
          cost,
          roi,
          confidence: hub.confidence || 0.7
        });
      }
    }

    return estimates;
  }

  _getTypeBaseline(hubType) {
    const baselines = {
      'section-hub': 20,
      'country-hub': 50,
      'region-hub': 30,
      'city-hub': 15,
      'topic-hub': 25
    };
    return baselines[hubType] || 10;
  }

  async _getHistoricalPerformance(domain, hubUrl) {
    if (!this.db) return null;

    try {
      const stmt = this.db.prepare(`
        SELECT AVG(articles_found) as avg_articles, AVG(efficiency) as avg_efficiency
        FROM hub_performance
        WHERE domain = ? AND hub_url = ?
      `);
      const row = stmt.get(domain, hubUrl);
      return row?.avg_articles ? { avgArticles: row.avg_articles, avgEfficiency: row.avg_efficiency } : null;
    } catch (error) {
      return null;
    }
  }

  async _getPlaceAttributes(hubUrl, context) {
    // Extract place from URL
    const urlParts = new URL(hubUrl).pathname.split('/').filter(Boolean);
    const placeName = urlParts[urlParts.length - 1];

    // Look up in gazetteer if available
    if (!this.db) return null;

    try {
      const stmt = this.db.prepare(`
        SELECT population, is_capital FROM gazetteer
        WHERE LOWER(name) = LOWER(?) OR LOWER(slug) = LOWER(?)
        LIMIT 1
      `);
      const row = stmt.get(placeName, placeName);
      return row ? { population: row.population, isCapital: row.is_capital === 1 } : null;
    } catch (error) {
      return null;
    }
  }

  async _getSiblingPerformance(domain, hubUrl, hubType) {
    if (!this.db) return null;

    try {
      const stmt = this.db.prepare(`
        SELECT AVG(articles_found) as avg_articles
        FROM hub_performance
        WHERE domain = ? AND hub_type = ? AND hub_url != ?
      `);
      const row = stmt.get(domain, hubType, hubUrl);
      return row?.avg_articles || null;
    } catch (error) {
      return null;
    }
  }

  async _getParentRichness(domain, hubUrl) {
    // Extract parent URL
    const url = new URL(hubUrl);
    const pathParts = url.pathname.split('/').filter(Boolean);
    if (pathParts.length < 2) return null;

    const parentPath = pathParts.slice(0, -1).join('/');
    const parentUrl = `${url.protocol}//${url.host}/${parentPath}`;

    return await this._getHistoricalPerformance(domain, parentUrl);
  }

  _calculateEstimateConfidence(factors) {
    // More factors = higher confidence
    const factorCount = factors.length;
    const baseConf = Math.min(0.9, 0.3 + factorCount * 0.15);

    // Check for strong factors
    const hasHistorical = factors.some(f => f.name === 'historical');
    const hasPopulation = factors.some(f => f.name === 'population');

    if (hasHistorical) return Math.min(0.95, baseConf + 0.2);
    if (hasPopulation) return Math.min(0.85, baseConf + 0.1);

    return baseConf;
  }

  _determineOptimalDepth(estimate) {
    return this.getRecommendedDepth(estimate.hubType, estimate.estimatedValue, {});
  }

  _getDepthMultiplier(depth) {
    // Cost increases linearly with depth
    return depth / 3; // Normalized to depth=3
  }

  _estimateCrawlCost(depth, hubType) {
    const baseRequestsPerDepth = 5; // Average requests per depth level
    const totalRequests = depth * baseRequestsPerDepth;

    const cost = 
      totalRequests * this.costs.request +
      totalRequests * this.costs.parse +
      totalRequests * 0.5 * this.costs.analyze; // Not all pages analyzed

    return cost;
  }

  async _learnOptimalDepth(hubType, depth, efficiency) {
    // Simple moving average learning
    const current = this.optimalDepths[hubType] || 3;
    
    // If efficiency is high, bias toward this depth
    if (efficiency > 2.0) {
      this.optimalDepths[hubType] = Math.round((current * 0.8) + (depth * 0.2));
    } else if (efficiency < 0.5) {
      // Poor efficiency, reduce optimal depth
      this.optimalDepths[hubType] = Math.max(2, Math.round(current * 0.9));
    }
  }

  close() {
    this.budgetAllocations.clear();
    this.hubStats.clear();
  }
}

module.exports = { BudgetAllocator };
