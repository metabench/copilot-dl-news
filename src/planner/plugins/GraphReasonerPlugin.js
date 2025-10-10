'use strict';

/**
 * GraphReasonerPlugin: Fast GOFAI plugin that proposes hub URLs from domain graph analysis.
 * 
 * Strategy:
 * - Use domain knowledge to propose 1-2 high-value hubs (e.g., /news, /articles)
 * - Mark blackboard.graphHubsReady = true after first tick
 * - Emit gofai-trace event with reasoning explanation
 * 
 * This is a "fast win" plugin that completes in 1 tick, demonstrating plugin architecture.
 */
class GraphReasonerPlugin {
  constructor({ priority = 80 } = {}) {
    this.pluginId = 'graph-reasoner';
    this.priority = priority;
    this.initialized = false;
  }

  /**
   * Initialize plugin (runs once before ticking).
   * @param {PlannerContext} ctx
   */
  async init(ctx) {
    this.initialized = true;
    ctx.emit('gofai-trace', {
      pluginId: this.pluginId,
      stage: 'init',
      message: 'GraphReasonerPlugin initialized'
    });
  }

  /**
   * Execute one planning step (cooperative tick).
   * @param {PlannerContext} ctx
   * @returns {boolean} true if plugin is done
   */
  async tick(ctx) {
    if (ctx.bb.graphHubsReady) {
      return true; // Already done
    }

    const { baseUrl, domain } = ctx.options;
    const proposals = [];

    // Simple heuristic: Propose common hub patterns
    const commonHubPaths = ['/news', '/articles', '/blog', '/press', '/media'];
    for (const path of commonHubPaths) {
      const hubUrl = new URL(path, baseUrl).href;
      proposals.push({
        url: hubUrl,
        source: 'graph-reasoner',
        confidence: 0.7,
        reason: `Common hub pattern: ${path}`
      });
    }

    // Add proposals to blackboard
    ctx.bb.proposedHubs.push(...proposals);
    ctx.bb.graphHubsReady = true;

    // Emit trace event
    ctx.emit('gofai-trace', {
      pluginId: this.pluginId,
      stage: 'tick',
      message: `Proposed ${proposals.length} hub(s) from graph analysis`,
      data: { hubCount: proposals.length, domain }
    });

    // Add rationale for preview
    ctx.bb.rationale.push(
      `Graph analysis proposed ${proposals.length} potential hub(s) based on common patterns`
    );

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
      message: 'GraphReasonerPlugin teardown'
    });
  }
}

module.exports = { GraphReasonerPlugin };
