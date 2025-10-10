'use strict';

/**
 * @typedef {Object} PlannerPlugin
 * @property {string} pluginId - Unique identifier for this plugin
 * @property {number} priority - Higher priority plugins tick first (default: 50)
 * @property {Function} init - Initialize plugin with context: (ctx) => void
 * @property {Function} tick - Execute one planning step: (ctx) => boolean (true if done)
 * @property {Function} teardown - Cleanup resources: (ctx) => void
 */

/**
 * @typedef {Object} PlannerBlackboard
 * @property {boolean} bootstrapComplete - Bootstrap stage finished
 * @property {boolean} patternInferenceComplete - Pattern inference finished
 * @property {boolean} graphHubsReady - Graph-based hub proposals ready
 * @property {boolean} hubSeedingComplete - Hub seeding finished
 * @property {boolean} navigationDiscoveryComplete - Navigation discovery finished
 * @property {boolean} targetedAnalysisComplete - Targeted analysis finished
 * @property {Array<Object>} proposedHubs - Hub proposals from various plugins
 * @property {Array<Object>} seedQueue - Seed URLs queued for crawl
 * @property {Array<Object>} navigationUrls - Navigation URLs discovered
 * @property {Array<Object>} schedulingConstraints - Politeness/CSP constraints
 * @property {Array<string>} rationale - Explanation fragments for preview
 * @property {Object} costEstimates - Query cost estimates by plugin
 * @property {Object} rulesEngine - Working memory for rules
 * @property {Object} htnState - HTN task decomposition state
 * @property {Object} custom - Arbitrary data for plugins
 */

/**
 * @typedef {Object} PlannerContext
 * @property {PlannerBlackboard} bb - Shared working memory (blackboard)
 * @property {Object} options - Normalized crawl options (domain, baseUrl, startUrl, etc.)
 * @property {Function} emit - Emit telemetry event: (type, data) => void
 * @property {Function} fetchPage - Fetch and cache page content: (url) => Promise<Object>
 * @property {Object} dbAdapter - Database adapter for telemetry queries (read-only in preview)
 * @property {Object} logger - Logger instance
 * @property {number} startTime - Planning start timestamp (ms)
 * @property {number} budgetMs - Time budget in milliseconds
 * @property {boolean} preview - True if this is a dry-run preview (no DB writes)
 */

/**
 * @typedef {Object} PlannerResult
 * @property {PlannerBlackboard} blackboard - Final blackboard state
 * @property {Array<Object>} telemetryEvents - Captured telemetry events
 * @property {number} elapsedMs - Planning duration in milliseconds
 * @property {boolean} budgetExceeded - True if time budget was exceeded
 * @property {string} statusReason - Human-readable status summary
 */

/**
 * Create an empty blackboard with default structure.
 * @returns {PlannerBlackboard}
 */
function createBlackboard() {
  return {
    bootstrapComplete: false,
    patternInferenceComplete: false,
    graphHubsReady: false,
    hubSeedingComplete: false,
    navigationDiscoveryComplete: false,
    targetedAnalysisComplete: false,
    proposedHubs: [],
    seedQueue: [],
    navigationUrls: [],
    schedulingConstraints: [],
    rationale: [],
    costEstimates: {},
    rulesEngine: { facts: [], firedRules: [] },
    htnState: { taskHierarchy: [], expandedTasks: [] },
    custom: {}
  };
}

/**
 * Create a planning context for plugins.
 * @param {Object} params
 * @param {Object} params.options - Normalized crawl options
 * @param {Function} params.emit - Telemetry emitter
 * @param {Function} params.fetchPage - Page fetcher
 * @param {Object} params.dbAdapter - Database adapter
 * @param {Object} params.logger - Logger
 * @param {number} params.budgetMs - Time budget in milliseconds
 * @param {boolean} params.preview - True for dry-run preview
 * @returns {PlannerContext}
 */
function createContext({
  options,
  emit,
  fetchPage,
  dbAdapter,
  logger,
  budgetMs,
  preview
}) {
  return {
    bb: createBlackboard(),
    options: options || {},
    emit: typeof emit === 'function' ? emit : () => {},
    fetchPage: typeof fetchPage === 'function' ? fetchPage : async () => ({}),
    dbAdapter: dbAdapter || null,
    logger: logger || console,
    startTime: Date.now(),
    budgetMs: Number.isFinite(budgetMs) && budgetMs > 0 ? budgetMs : 3500,
    preview: !!preview
  };
}

/**
 * Check if time budget is exhausted.
 * @param {PlannerContext} ctx
 * @returns {boolean}
 */
function isBudgetExhausted(ctx) {
  return (Date.now() - ctx.startTime) >= ctx.budgetMs;
}

/**
 * Get remaining time in milliseconds.
 * @param {PlannerContext} ctx
 * @returns {number}
 */
function getRemainingMs(ctx) {
  return Math.max(0, ctx.budgetMs - (Date.now() - ctx.startTime));
}

module.exports = {
  createBlackboard,
  createContext,
  isBudgetExhausted,
  getRemainingMs
};
