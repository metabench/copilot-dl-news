'use strict';

/**
 * Place Hub Guessing Orchestration
 *
 * Pure orchestration logic for place hub discovery and validation.
 * Contains NO CLI formatting, NO argument parsing, NO HTTP concerns.
 * Returns structured data objects that can be consumed by any interface.
 *
 * All dependencies injected at call time - no hard-coded paths or imports.
 */

const { DomainProcessor } = require('./DomainProcessor');
const { BatchCoordinator } = require('./BatchCoordinator');
const { ValidationOrchestrator } = require('./ValidationOrchestrator');
const { PersistenceManager } = require('./PersistenceManager');

// Legacy exports for backward compatibility
const { normalizeDomain, assessDomainReadiness, selectPlaces, selectTopics, createBatchSummary, aggregateSummaryInto } = require('./utils/analysisUtils');
const { getDsplForDomain } = require('../services/shared/dspl');

// Error class for orchestration failures
class OrchestrationError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'OrchestrationError';
    this.code = options.code || 'ORCHESTRATION_ERROR';
    this.details = options.details || {};
    this.originalError = options.originalError;
  }
}







/**
 * Guess place hubs for a single domain
 * 
 * @param {Object} options - Guessing options
 * @param {string} options.domain - Domain to process
 * @param {string} [options.scheme='https'] - URL scheme
 * @param {string[]} [options.kinds=['country']] - Place kinds
 * @param {boolean} [options.enableTopicDiscovery=false] - Enable topic hub discovery
 * @param {boolean} [options.enableCombinationDiscovery=false] - Enable place-topic combination discovery
 * @param {string[]} [options.topics=[]] - Specific topic slugs to process
 * @param {number} [options.limit] - Place/topic limit
 * @param {boolean} [options.apply=false] - Persist to database
 * @param {number} [options.patternsPerPlace=3] - Patterns per place/topic
 * @param {number} [options.maxAgeDays=7] - Cache max age
 * @param {number} [options.refresh404Days=180] - 404 refresh interval
 * @param {number} [options.retry4xxDays=7] - 4xx retry interval
 * @param {number} [options.readinessTimeoutMs] - Readiness timeout
 * @param {boolean} [options.verbose=false] - Verbose logging
 * @param {string} [options.runId] - Run ID for audit trail
 * @param {Object} deps - Injected dependencies
 * @param {Object} deps.db - Database connection
 * @param {Object} deps.queries - Query adapter
 * @param {Object} deps.analyzers - Hub analyzers (including topic and placeTopic)
 * @param {Object} deps.validator - Hub validator
 * @param {Object} deps.stores - Data stores
 * @param {Object} deps.logger - Logger instance
 * @param {Function} deps.fetchFn - Fetch function
 * @param {Function} deps.now - Time function
 * @returns {Promise<Object>} Domain summary
 */
async function guessPlaceHubsForDomain(options = {}, deps = {}) {
  const domainProcessor = new DomainProcessor();
  return domainProcessor.processDomain(options, deps);
}

/**
 * Batch hub guessing for multiple domains
 * 
 * @param {Object} options - Batch options
 * @param {Array<Object>} options.domainBatch - Domain batch entries
 * @param {string} [options.domain] - Single domain (fallback)
 * @param {Object} deps - Injected dependencies
 * @returns {Promise<Object>} Batch results
 */
async function guessPlaceHubsBatch(options = {}, deps = {}) {
  const { DomainProcessor } = require('./DomainProcessor');
  const domainProcessor = new DomainProcessor();
  
  const batchDeps = {
    ...deps,
    domainProcessor
  };
  
  const batchCoordinator = new BatchCoordinator();
  return batchCoordinator.processBatch(options, batchDeps);
}

/**
 * Check domain readiness for hub guessing
 * 
 * @param {string} domain - Domain to check
 * @param {Object} options - Readiness options
 * @param {number} [options.timeoutSeconds=10] - Probe timeout
 * @param {Object} deps - Injected dependencies
 * @returns {Promise<Object>} Readiness status
 */
async function checkDomainReadiness(domain, options = {}, deps = {}) {
  const { queries, analyzers, now = () => new Date() } = deps;
  
  const normalized = normalizeDomain(domain);
  if (!normalized) {
    throw new OrchestrationError('Invalid domain', {
      code: 'INVALID_INPUT',
      details: { domain }
    });
  }

  const timeoutSeconds = Number.isFinite(options.timeoutSeconds) ? options.timeoutSeconds : 10;
  const timeoutMs = timeoutSeconds > 0 ? timeoutSeconds * 1000 : null;

  const metrics = queries.getDomainCoverageMetrics(normalized.host, {
    timeoutMs,
    now: () => now().getTime()
  });

  const latestDetermination = queries.getLatestDomainDetermination(normalized.host);
  const dsplEntry = getDsplForDomain(analyzers.country?.dspls, normalized.host);

  const readiness = assessDomainReadiness({
    domain: normalized.host,
    kinds: options.kinds || ['country'],
    metrics,
    dsplEntry,
    latestDetermination
  });

  // Transform readiness result to match expected API
  return {
    domain: normalized.host, // Use the normalized host directly
    status: readiness.ready ? 'ready' : (readiness.reasons.length > 0 ? 'data-limited' : 'insufficient-data'),
    reasons: readiness.reasons,
    recommendations: readiness.recommendations,
    metrics: readiness.metrics,
    dspl: readiness.dspl
  };
}

module.exports = {
  guessPlaceHubsBatch,
  guessPlaceHubsForDomain,
  checkDomainReadiness,
  OrchestrationError,
  
  // Export helper functions for testing
  normalizeDomain,
  assessDomainReadiness,
  selectPlaces,
  selectTopics,
  createBatchSummary,
  aggregateSummaryInto
};
