'use strict';

const { PlannerHost } = require('./PlannerHost');
const { GraphReasonerPlugin } = require('./plugins/GraphReasonerPlugin');
const { QueryCostEstimatorPlugin } = require('./plugins/QueryCostEstimatorPlugin');
const { GazetteerAwareReasonerPlugin } = require('./plugins/GazetteerAwareReasonerPlugin');

/**
 * Create a PlannerHost with standard plugin configuration.
 * 
 * This factory wires up the GOFAI planning suite with:
 * - GraphReasonerPlugin: Fast hub proposals from domain analysis
 * - QueryCostEstimatorPlugin: Cost-based prioritization from telemetry
 * - GazetteerAwareReasonerPlugin: Country hub predictions from gazetteer data
 * 
 * Future plugins to integrate:
 * - RuleEnginePlugin: Forward-chaining rule DSL
 * - HTNPlugin: Hierarchical task network decomposition
 * - CSPPolitenessPlugin: Constraint satisfaction for scheduling
 * - ExplanationPlugin: Generate human-readable rationale
 * 
 * @param {Object} params
 * @param {Object} params.options - Normalized crawl options (domain, baseUrl, startUrl, etc.)
 * @param {Function} [params.emit] - Telemetry emitter function
 * @param {Function} [params.fetchPage] - Page fetcher function
 * @param {Object} [params.dbAdapter] - Database adapter (for telemetry queries)
 * @param {Object} [params.logger] - Logger instance
 * @param {number} [params.budgetMs=3500] - Time budget in milliseconds
 * @param {boolean} [params.preview=false] - True for dry-run preview mode
 * @param {Array<Object>} [params.additionalPlugins=[]] - Extra plugins to include
 * @param {Object} [params.countryHubGapService] - Country hub gap service for pattern learning
 * @param {boolean} [params.useGazetteerAwareness=true] - Enable gazetteer-based country hub proposals
 * @returns {PlannerHost}
 */
function createPlannerHost({
  options,
  emit = null,
  fetchPage = null,
  dbAdapter = null,
  logger = console,
  budgetMs = 3500,
  preview = false,
  additionalPlugins = [],
  countryHubGapService = null,
  useGazetteerAwareness = true
} = {}) {
  // Standard plugin configuration
  const standardPlugins = [
    new GraphReasonerPlugin({ priority: 80 }),
    new QueryCostEstimatorPlugin({ priority: 70, budgetThresholdMs: 500 })
  ];

  // Add GazetteerAwareReasonerPlugin if gazetteer awareness enabled
  if (useGazetteerAwareness && dbAdapter) {
    standardPlugins.push(
      new GazetteerAwareReasonerPlugin({ 
        priority: 75,
        maxCountryProposals: 30,
        countryHubGapService 
      })
    );
  }

  // Combine standard + additional plugins
  const allPlugins = [...standardPlugins, ...additionalPlugins];

  return new PlannerHost({
    plugins: allPlugins,
    options,
    emit,
    fetchPage,
    dbAdapter,
    logger,
    budgetMs,
    preview
  });
}

module.exports = { createPlannerHost };
