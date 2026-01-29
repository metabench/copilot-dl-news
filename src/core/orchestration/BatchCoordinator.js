const { normalizeDomain } = require('../../shared/utils/domainUtils');
const { createBatchSummary, aggregateSummaryInto, createFailedDomainSummary } = require('../../shared/utils/summaryUtils');

/**
 * BatchCoordinator - Coordinates batch processing of multiple domains
 *
 * This module handles the orchestration of processing multiple domains in batch,
 * managing domain entries, error handling, and result aggregation.
 */
class BatchCoordinator {
  constructor() {
    this.MAX_DECISION_HISTORY = 500;
  }

  /**
   * Process a batch of domains for hub guessing
   *
   * @param {Object} options - Batch processing options
   * @param {Array<Object>} options.domainBatch - Domain batch entries
   * @param {string} [options.domain] - Single domain (fallback)
   * @param {Object} deps - Injected dependencies
   * @param {Function} deps.domainProcessor - Domain processor function
   * @param {Object} deps.logger - Logger instance
   * @returns {Promise<Object>} Batch results with aggregate and per-domain summaries
   */
  async processBatch(options = {}, deps = {}) {
    const { domainProcessor, logger } = deps;

    // Prepare batch entries
    const batchEntries = this._prepareBatchEntries(options);

    if (!batchEntries.length) {
      throw new Error('Domain or host is required');
    }

    const runStartedAt = new Date().toISOString();
    const runStartedMs = Date.now();

    const multiDomain = batchEntries.length > 1;
    const domainLabel = multiDomain ? 'multiple domains' : batchEntries[0].domain;
    const aggregate = createBatchSummary(domainLabel, batchEntries.length);
    const perDomainSummaries = [];

    // Process each domain
    for (let index = 0; index < batchEntries.length; index += 1) {
      if (options.abortSignal && options.abortSignal.aborted) {
        if (logger && typeof logger.warn === 'function') {
          logger.warn('[orchestration] Batch processing aborted by signal');
        }
        aggregate.batch.aborted = true;
        break;
      }

      const entry = batchEntries[index];

      const domainResult = await this._processDomainEntry(entry, index, options, deps);
      perDomainSummaries.push(domainResult);

      aggregateSummaryInto(aggregate, domainResult.summary, entry);
      aggregate.batch.processedDomains += 1;
    }

    // Finalize batch results
    this._finalizeBatchResults(aggregate, perDomainSummaries, options, runStartedAt, runStartedMs);

    return {
      aggregate,
      perDomain: perDomainSummaries
    };
  }

  /**
   * Prepare batch entries from options
   *
   * @param {Object} options - Processing options
   * @returns {Array<Object>} Prepared batch entries
   */
  _prepareBatchEntries(options) {
    // Use provided batch entries if available
    if (Array.isArray(options.domainBatch) && options.domainBatch.length) {
      return options.domainBatch.map((entry) => ({ ...entry }));
    }

    // Fallback to single domain
    if (options.domain) {
      const normalized = normalizeDomain(options.domain, options.scheme);
      return [{
        raw: options.domain,
        domain: normalized?.host || options.domain,
        scheme: normalized?.scheme || (options.scheme || 'https'),
        base: normalized?.base || `${options.scheme || 'https'}://${options.domain}`,
        kinds: Array.isArray(options.kinds) ? [...options.kinds] : [],
        kindsOverride: null,
        limit: options.limit ?? null,
        limitOverride: null,
        sources: ['legacy']
      }];
    }

    return [];
  }

  /**
   * Process a single domain entry
   *
   * @param {Object} entry - Domain entry
   * @param {number} index - Entry index in batch
   * @param {Object} options - Processing options
   * @param {Object} deps - Injected dependencies
   * @returns {Promise<Object>} Domain processing result
   */
  async _processDomainEntry(entry, index, options, deps) {
    const { domainProcessor, logger } = deps;

    const perDomainOptions = this._createDomainOptions(entry, options);

    if (logger && typeof logger.info === 'function') {
      logger.info(`[orchestration] Batch processing domain ${entry.domain}`);
    }

    let summary;
    let domainError = null;

    try {
      summary = await domainProcessor.processDomain(perDomainOptions, deps);
    } catch (error) {
      domainError = error;
      if (logger && typeof logger.error === 'function') {
        logger.error(`[orchestration] Batch domain ${entry.domain} failed: ${error?.message || error}`);
      }
      summary = createFailedDomainSummary(entry, error);
    }

    return { entry, summary, index, error: domainError };
  }

  /**
   * Create domain-specific options from entry and global options
   *
   * @param {Object} entry - Domain entry
   * @param {Object} options - Global options
   * @returns {Object} Domain-specific options
   */
  _createDomainOptions(entry, options) {
    return {
      domain: entry.domain,
      scheme: entry.scheme || options.scheme || 'https',
      apply: options.apply,
      dryRun: options.dryRun,
      kinds: Array.isArray(entry.kinds) ? [...entry.kinds] : Array.isArray(options.kinds) ? [...options.kinds] : [],
      limit: entry.limit != null ? entry.limit : options.limit,
      patternsPerPlace: options.patternsPerPlace,
      maxAgeDays: options.maxAgeDays,
      refresh404Days: options.refresh404Days,
      retry4xxDays: options.retry4xxDays,
      dbPath: options.dbPath,
      verbose: options.verbose,
      json: options.json,
      readinessTimeoutSeconds: options.readinessTimeoutSeconds,
      readinessTimeoutMs: options.readinessTimeoutMs,
      enableTopicDiscovery: options.enableTopicDiscovery,
      enableCombinationDiscovery: options.enableCombinationDiscovery,
      enableHierarchicalDiscovery: options.enableHierarchicalDiscovery || options.hierarchical,
      activePattern: options.activePattern,
      parentPlace: options.parentPlace,
      hierarchical: options.hierarchical,
      topics: options.topics,
      runId: options.runId
    };
  }

  /**
   * Finalize batch results with summary data
   *
   * @param {Object} aggregate - Aggregate summary
   * @param {Array<Object>} perDomainSummaries - Per-domain results
   * @param {Object} options - Original options
   * @param {string} runStartedAt - Run start timestamp
   * @param {number} runStartedMs - Run start milliseconds
   */
  _finalizeBatchResults(aggregate, perDomainSummaries, options, runStartedAt, runStartedMs) {
    // Trim decision history if needed
    if (aggregate.decisions.length > this.MAX_DECISION_HISTORY) {
      const truncated = aggregate.decisions.length - this.MAX_DECISION_HISTORY;
      aggregate.decisions = aggregate.decisions.slice(-this.MAX_DECISION_HISTORY);
      aggregate.batch.truncatedDecisionCount = truncated;
    } else {
      aggregate.batch.truncatedDecisionCount = 0;
    }

    aggregate.domainsProcessed = perDomainSummaries.length;
    aggregate.domainSummaries = perDomainSummaries.map(({ entry, summary, index, error }) => ({
      index,
      domain: summary.domain,
      scheme: entry.scheme || options.scheme || 'https',
      base: entry.base || `${entry.scheme || options.scheme || 'https'}://${entry.domain}`,
      kinds: Array.isArray(entry.kinds) ? [...entry.kinds] : Array.isArray(options.kinds) ? [...options.kinds] : [],
      limit: entry.limit != null ? entry.limit : options.limit,
      sources: Array.isArray(entry.sources) ? [...entry.sources] : [],
      error: error ? { message: error?.message || String(error) } : null,
      determination: summary.determination || null,
      determinationReason: summary.determinationReason || null,
      readiness: summary.readiness || null,
      latestDetermination: summary.latestDetermination || null,
      recommendations: Array.isArray(summary.recommendations) ? [...summary.recommendations] : [],
      readinessProbe: summary.readinessProbe || null,
      diffPreview: summary.diffPreview
        ? {
            inserted: Array.isArray(summary.diffPreview.inserted)
              ? summary.diffPreview.inserted.map((item) => ({ ...item }))
              : [],
            updated: Array.isArray(summary.diffPreview.updated)
              ? summary.diffPreview.updated.map((item) => ({
                  ...item,
                  changes: Array.isArray(item.changes) ? item.changes.map((change) => ({ ...change })) : []
                }))
              : []
          }
        : { inserted: [], updated: [] },
      summary
    }));

    aggregate.domainInputs = options.domainInputs || null;
    aggregate.readinessTimeoutSeconds = options.readinessTimeoutSeconds ?? null;
    aggregate.startedAt = runStartedAt;
    aggregate.completedAt = new Date().toISOString();
    aggregate.durationMs = Math.max(0, Date.now() - runStartedMs);
  }
}

module.exports = { BatchCoordinator };