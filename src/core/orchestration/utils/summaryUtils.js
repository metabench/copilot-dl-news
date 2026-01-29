/**
 * Summary and Aggregation Utilities
 *
 * Utility functions for creating and aggregating batch summaries.
 * Extracted from placeHubGuessing.js to improve modularity.
 */

/**
 * Create batch summary for domain processing
 * @param {string} domainLabel - Domain label
 * @param {number} totalDomains - Total number of domains
 * @returns {Object} - Batch summary
 */
function createBatchSummary(domainLabel, totalDomains) {
  return {
    domain: domainLabel,
    processed: 0,
    total: totalDomains,
    successful: 0,
    failed: 0,
    skipped: 0,
    candidatesGenerated: 0,
    hubsValidated: 0,
    hubsCreated: 0,
    hubsUpdated: 0,
    errors: [],
    startTime: new Date().toISOString(),
    endTime: null,
    duration: null,
    batch: {
      totalDomains,
      processedDomains: 0,
      truncatedDecisionCount: 0
    },
    // Additional properties expected by tests
    totalUrls: 0,
    fetched: 0,
    cached: 0,
    validationSucceeded: 0,
    validationFailed: 0,
    diffPreview: {
      inserted: [],
      updated: []
    },
    decisions: [],
    domainSummaries: []
  };
}

/**
 * Aggregate domain summary into batch aggregate
 * @param {Object} aggregate - Aggregate summary
 * @param {Object} domainSummary - Domain summary
 * @param {Object} entry - Domain entry
 */
function aggregateSummaryInto(aggregate, domainSummary, entry) {
  aggregate.processed += 1;

  if (domainSummary.success) {
    aggregate.successful += 1;
  } else if (domainSummary.error) {
    aggregate.failed += 1;
    aggregate.errors.push({
      domain: entry.domain.host,
      error: domainSummary.error.message || String(domainSummary.error)
    });
  } else {
    aggregate.skipped += 1;
  }

  // Aggregate metrics
  if (domainSummary.metrics) {
    aggregate.candidatesGenerated += domainSummary.metrics.candidatesGenerated || 0;
    aggregate.hubsValidated += domainSummary.metrics.hubsValidated || 0;
    aggregate.hubsCreated += domainSummary.metrics.hubsCreated || 0;
    aggregate.hubsUpdated += domainSummary.metrics.hubsUpdated || 0;
  }

  // Aggregate domain summary properties
  aggregate.totalUrls += domainSummary.totalUrls || 0;
  aggregate.fetched += domainSummary.fetched || 0;
  aggregate.cached += domainSummary.cached || 0;
  aggregate.validationSucceeded += domainSummary.validationSucceeded || 0;
  aggregate.validationFailed += domainSummary.validationFailed || 0;

  // Aggregate diff preview
  if (domainSummary.diffPreview) {
    if (Array.isArray(domainSummary.diffPreview.inserted)) {
      aggregate.diffPreview.inserted.push(...domainSummary.diffPreview.inserted);
    }
    if (Array.isArray(domainSummary.diffPreview.updated)) {
      aggregate.diffPreview.updated.push(...domainSummary.diffPreview.updated);
    }
  }

  // Aggregate decisions
  if (Array.isArray(domainSummary.decisions)) {
    aggregate.decisions.push(...domainSummary.decisions);
  }
}

/**
 * Create failed domain summary
 * @param {Object} entry - Domain entry
 * @param {Error} error - Error that occurred
 * @returns {Object} - Failed domain summary
 */
function createFailedDomainSummary(entry, error) {
  return {
    domain: entry.domain.host,
    success: false,
    error: {
      message: error.message,
      code: error.code || 'UNKNOWN_ERROR',
      stack: error.stack
    },
    metrics: {
      candidatesGenerated: 0,
      hubsValidated: 0,
      hubsCreated: 0,
      hubsUpdated: 0
    },
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  createBatchSummary,
  aggregateSummaryInto,
  createFailedDomainSummary
};