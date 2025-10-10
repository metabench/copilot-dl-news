'use strict';

const { getQueryStats } = require('../../db/queryTelemetry');

/**
 * QueryCostEstimatorPlugin: GOFAI plugin that analyzes query telemetry
 * to estimate costs of crawl plan steps and prioritize low-cost operations.
 * 
 * Strategy:
 * - Read historical query telemetry from database
 * - Build cost model: avg duration by query type/complexity
 * - Estimate cost of proposed plan steps (hub fetches, seed operations)
 * - Add cost estimates to blackboard
 * - Emit cost analysis in rationale for preview
 * 
 * Key Differentiator: Uses real historical performance data to make
 * intelligent planning decisions, unlike heuristic-only approaches.
 */
class QueryCostEstimatorPlugin {
  constructor({ priority = 70, budgetThresholdMs = 500 } = {}) {
    this.pluginId = 'query-cost-estimator';
    this.priority = priority;
    this.budgetThresholdMs = budgetThresholdMs; // Warn if estimated cost exceeds this
    this.costModel = null;
  }

  /**
   * Initialize plugin: Load query statistics from database.
   * @param {PlannerContext} ctx
   */
  async init(ctx) {
    ctx.emit('gofai-trace', {
      pluginId: this.pluginId,
      stage: 'init',
      message: 'QueryCostEstimatorPlugin initializing'
    });

    // Build cost model from telemetry
    this.costModel = this._buildCostModel(ctx);

    if (this.costModel.totalSamples === 0) {
      ctx.bb.rationale.push(
        'Query cost estimation skipped (no historical telemetry available)'
      );
    } else {
      ctx.bb.rationale.push(
        `Query cost model built from ${this.costModel.totalSamples} historical sample(s)`
      );
    }
  }

  /**
   * Execute one planning step (cooperative tick).
   * @param {PlannerContext} ctx
   * @returns {boolean} true if plugin is done
   */
  async tick(ctx) {
    if (!this.costModel || this.costModel.totalSamples === 0) {
      // No telemetry available - mark done immediately
      ctx.bb.costEstimates = {
        available: false,
        reason: 'No historical telemetry data'
      };
      return true;
    }

    // Estimate costs for proposed hubs
    const hubCosts = this._estimateHubCosts(ctx);
    const highCostHubs = hubCosts.filter(h => h.estimatedMs > this.budgetThresholdMs);

    // Store estimates on blackboard
    ctx.bb.costEstimates = {
      available: true,
      model: this.costModel,
      hubCosts,
      totalEstimatedMs: hubCosts.reduce((sum, h) => sum + h.estimatedMs, 0),
      highCostCount: highCostHubs.length
    };

    // Emit trace with cost breakdown
    ctx.emit('gofai-trace', {
      pluginId: this.pluginId,
      stage: 'tick',
      message: `Estimated cost for ${hubCosts.length} hub(s)`,
      data: {
        totalEstimatedMs: ctx.bb.costEstimates.totalEstimatedMs,
        avgCostPerHub: hubCosts.length > 0
          ? (ctx.bb.costEstimates.totalEstimatedMs / hubCosts.length).toFixed(2)
          : 0,
        highCostCount: highCostHubs.length
      }
    });

    // Add rationale with cost warnings
    if (highCostHubs.length > 0) {
      ctx.bb.rationale.push(
        `Warning: ${highCostHubs.length} hub(s) estimated to exceed ${this.budgetThresholdMs}ms cost threshold`
      );
    } else {
      ctx.bb.rationale.push(
        `All proposed hubs have acceptable estimated costs (< ${this.budgetThresholdMs}ms)`
      );
    }

    return true; // Done in one tick
  }

  /**
   * Cleanup resources (runs once after ticking completes).
   * @param {PlannerContext} ctx
   */
  async teardown(ctx) {
    ctx.emit('gofai-trace', {
      pluginId: this.pluginId,
      stage: 'teardown',
      message: 'QueryCostEstimatorPlugin teardown'
    });
  }

  /**
   * Build cost model from query telemetry.
   * @private
   * @param {PlannerContext} ctx
   * @returns {Object} Cost model with avg durations by query type
   */
  _buildCostModel(ctx) {
    if (!ctx.dbAdapter) {
      return { totalSamples: 0, queryTypes: {} };
    }

    try {
      const stats = getQueryStats(ctx.dbAdapter, { limit: 100 });
      const model = {
        totalSamples: stats.reduce((sum, s) => sum + s.sample_count, 0),
        queryTypes: {}
      };

      for (const stat of stats) {
        model.queryTypes[stat.query_type] = {
          avgDurationMs: stat.avg_duration_ms,
          minDurationMs: stat.min_duration_ms,
          maxDurationMs: stat.max_duration_ms,
          avgResultCount: stat.avg_result_count,
          sampleCount: stat.sample_count,
          complexity: stat.query_complexity
        };
      }

      return model;
    } catch (err) {
      ctx.logger.warn(`[QueryCostEstimator] Failed to build cost model: ${err.message}`);
      return { totalSamples: 0, queryTypes: {} };
    }
  }

  /**
   * Estimate costs for proposed hubs.
   * @private
   * @param {PlannerContext} ctx
   * @returns {Array<Object>} Array of { hubUrl, estimatedMs, confidence }
   */
  _estimateHubCosts(ctx) {
    const proposedHubs = ctx.bb.proposedHubs || [];
    const fetchArticleCost = this.costModel.queryTypes['fetch_articles'];
    
    // Default to 100ms if no telemetry (conservative estimate)
    const defaultCostMs = 100;
    const baseCostMs = fetchArticleCost
      ? fetchArticleCost.avgDurationMs
      : defaultCostMs;

    return proposedHubs.map(hub => {
      // Cost estimate: base fetch cost + complexity multiplier
      let multiplier = 1.0;
      if (hub.reason && hub.reason.includes('Common hub pattern')) {
        multiplier = 0.8; // Common patterns are usually simpler
      }

      const estimatedMs = baseCostMs * multiplier;
      const confidence = fetchArticleCost ? 0.8 : 0.3;

      return {
        hubUrl: hub.url,
        estimatedMs: Math.round(estimatedMs),
        confidence,
        source: hub.source || 'unknown'
      };
    });
  }
}

module.exports = { QueryCostEstimatorPlugin };
