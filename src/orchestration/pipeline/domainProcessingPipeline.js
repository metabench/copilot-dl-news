/**
 * Domain Processing Pipeline
 * 
 * Pipeline-based orchestration for single domain hub discovery.
 * Wraps DomainProcessor methods as discrete pipeline steps.
 * 
 * @module src/orchestration/pipeline/domainProcessingPipeline
 */

const { createStep, runPipeline } = require('../../crawler/pipeline');

/**
 * @typedef {Object} DomainProcessingDeps
 * @property {Object} db - Main database connection
 * @property {Object} newsDb - News database adapter
 * @property {Object} queries - Query functions
 * @property {Object} analyzers - Country/region/city/topic analyzers
 * @property {Object} validator - URL validator
 * @property {Object} stores - Storage adapters
 * @property {Object} [logger] - Logger instance
 * @property {Function} [fetchFn] - Fetch function
 * @property {Function} [now] - Current time function
 */

/**
 * @typedef {Object} DomainProcessingContext
 * @property {string} domain - Domain to process
 * @property {string[]} kinds - Place kinds to process (country, region, city)
 * @property {Object} options - Processing options
 * @property {Object} summary - Accumulated summary
 */

// ============================================================================
// Step Builders
// ============================================================================

/**
 * Create step that normalizes domain input
 * @param {DomainProcessingDeps} deps
 * @returns {import('../../crawler/pipeline').Step}
 */
function createNormalizeDomainStep(deps) {
  const { normalizeDomain, applyScheme } = require('../utils/domainUtils');
  
  return createStep('normalizeDomain', async (ctx) => {
    const normalized = normalizeDomain(ctx.domain, ctx.options?.scheme);
    
    if (!normalized) {
      return { ok: false, reason: 'invalid-domain', err: new Error('Domain is required') };
    }
    
    return {
      ok: true,
      value: {
        ...ctx,
        normalizedDomain: normalized,
        host: normalized.host
      }
    };
  }, { optional: false });
}

/**
 * Create step that initializes the processing summary
 * @param {DomainProcessingDeps} deps
 * @returns {import('../../crawler/pipeline').Step}
 */
function createInitSummaryStep(deps) {
  return createStep('initSummary', async (ctx) => {
    const now = deps.now || (() => new Date());
    const startedAt = now();
    
    const summary = {
      domain: ctx.host,
      totalPlaces: 0,
      totalTopics: 0,
      totalCombinations: 0,
      totalUrls: 0,
      fetched: 0,
      cached: 0,
      skipped: 0,
      skippedDuplicatePlace: 0,
      skippedDuplicateTopic: 0,
      skippedDuplicateCombination: 0,
      skippedRecent4xx: 0,
      stored404: 0,
      insertedHubs: 0,
      updatedHubs: 0,
      errors: 0,
      rateLimited: 0,
      unsupportedKinds: [],
      unsupportedTopics: [],
      decisions: [],
      readiness: null,
      latestDetermination: null,
      determination: null,
      determinationReason: null,
      recommendations: [],
      diffPreview: { inserted: [], updated: [] },
      readinessProbe: null,
      readinessTimedOut: 0,
      validationSucceeded: 0,
      validationFailed: 0,
      validationFailureReasons: {},
      startedAt: startedAt.toISOString(),
      completedAt: null,
      durationMs: null,
      runStartedMs: Date.now()
    };
    
    return { ok: true, value: { ...ctx, summary } };
  }, { optional: false });
}

/**
 * Create step that assesses domain readiness
 * @param {DomainProcessingDeps} deps
 * @returns {import('../../crawler/pipeline').Step}
 */
function createAssessReadinessStep(deps) {
  const { getDsplForDomain } = require('../../services/shared/dspl');
  const { assessDomainReadiness } = require('../utils/analysisUtils');
  
  return createStep('assessReadiness', async (ctx) => {
    const { queries, analyzers, logger } = deps;
    const now = deps.now || (() => new Date());
    
    const metrics = queries.getDomainCoverageMetrics(ctx.host, {
      timeoutMs: ctx.options?.readinessTimeoutMs,
      now: () => now().getTime()
    });
    
    const latestDetermination = queries.getLatestDomainDetermination(ctx.host);
    const dsplEntry = getDsplForDomain(analyzers?.country?.dspls, ctx.host);
    
    const readiness = assessDomainReadiness({
      domain: ctx.host,
      kinds: ctx.kinds,
      metrics,
      dsplEntry,
      latestDetermination
    });
    
    const summaryUpdates = {
      readiness,
      latestDetermination: latestDetermination || null,
      recommendations: Array.isArray(readiness.recommendations)
        ? [...readiness.recommendations]
        : [],
      readinessProbe: {
        timedOut: Boolean(metrics?.timedOut),
        elapsedMs: Number.isFinite(metrics?.elapsedMs) ? metrics.elapsedMs : null,
        completedMetrics: Array.isArray(metrics?.completedMetrics) ? [...metrics.completedMetrics] : [],
        skippedMetrics: Array.isArray(metrics?.skippedMetrics) ? [...metrics.skippedMetrics] : []
      }
    };
    
    if (summaryUpdates.readinessProbe.timedOut) {
      summaryUpdates.readinessTimedOut = 1;
    }
    
    // Update summary with readiness info
    const updatedSummary = { ...ctx.summary, ...summaryUpdates };
    
    // Check for insufficient data
    if (readiness.status === 'insufficient-data') {
      return {
        ok: false,
        reason: 'insufficient-data',
        value: { ...ctx, summary: updatedSummary, readiness }
      };
    }
    
    return {
      ok: true,
      value: { ...ctx, summary: updatedSummary, readiness }
    };
  }, { optional: false });
}

/**
 * Create step that selects places based on kind analyzers
 * @param {DomainProcessingDeps} deps
 * @returns {import('../../crawler/pipeline').Step}
 */
function createSelectPlacesStep(deps) {
  const { selectPlaces } = require('../utils/analysisUtils');
  
  return createStep('selectPlaces', async (ctx) => {
    const { analyzers } = deps;
    
    const { places, unsupported: unsupportedKinds } = selectPlaces(
      {
        countryAnalyzer: analyzers?.country,
        regionAnalyzer: analyzers?.region,
        cityAnalyzer: analyzers?.city
      },
      ctx.kinds,
      ctx.options?.limit
    );
    
    const updatedSummary = {
      ...ctx.summary,
      unsupportedKinds,
      totalPlaces: places.length
    };
    
    return {
      ok: true,
      value: { ...ctx, places, summary: updatedSummary }
    };
  }, { optional: false });
}

/**
 * Create step that selects topics if topic discovery is enabled
 * @param {DomainProcessingDeps} deps
 * @returns {import('../../crawler/pipeline').Step}
 */
function createSelectTopicsStep(deps) {
  const { selectTopics } = require('../utils/analysisUtils');
  
  return createStep('selectTopics', async (ctx) => {
    const { analyzers } = deps;
    const { enableTopicDiscovery, enableCombinationDiscovery, topics: requestedTopics } = ctx.options || {};
    
    // Skip if topic discovery not enabled
    if (!enableTopicDiscovery && !enableCombinationDiscovery && (!requestedTopics || requestedTopics.length === 0)) {
      return {
        ok: true,
        value: {
          ...ctx,
          topics: [],
          summary: { ...ctx.summary, unsupportedTopics: [], totalTopics: 0 }
        }
      };
    }
    
    const topicSelection = selectTopics(
      { topicAnalyzer: analyzers?.topic },
      requestedTopics || [],
      ctx.options?.limit
    );
    
    const updatedSummary = {
      ...ctx.summary,
      unsupportedTopics: topicSelection.unsupported,
      totalTopics: topicSelection.topics.length
    };
    
    return {
      ok: true,
      value: { ...ctx, topics: topicSelection.topics, summary: updatedSummary }
    };
  }, { optional: false });
}

/**
 * Create step that checks if there's anything to process
 * @param {DomainProcessingDeps} deps
 * @returns {import('../../crawler/pipeline').Step}
 */
function createCheckProcessableStep(deps) {
  return createStep('checkProcessable', async (ctx) => {
    const hasPlaces = ctx.places && ctx.places.length > 0;
    const hasTopics = ctx.topics && ctx.topics.length > 0;
    
    if (!hasPlaces && !hasTopics) {
      // Nothing to process - this is not an error, just early completion
      return {
        ok: true,
        value: {
          ...ctx,
          earlyExit: true,
          summary: {
            ...ctx.summary,
            determination: 'no-processable-items',
            determinationReason: 'No places or topics to process'
          }
        }
      };
    }
    
    return { ok: true, value: ctx };
  }, { optional: false });
}

/**
 * Create step that processes all hub types (places, topics, combinations)
 * This is the main processing step that delegates to DomainProcessor
 * @param {DomainProcessingDeps} deps
 * @param {Object} domainProcessor - DomainProcessor instance
 * @returns {import('../../crawler/pipeline').Step}
 */
function createProcessHubTypesStep(deps, domainProcessor) {
  return createStep('processHubTypes', async (ctx) => {
    // Skip if early exit
    if (ctx.earlyExit) {
      return { ok: true, value: ctx };
    }
    
    const { logger } = deps;
    let attemptCounter = 0;
    
    const recordDecision = (decision) => {
      ctx.summary.decisions.push(decision);
      const level = decision.level || 'info';
      const loggerFn = logger?.[level];
      if (typeof loggerFn === 'function' && decision.message) {
        loggerFn(`[pipeline] ${decision.message}`);
      }
    };
    
    const recordFetch = (fetchRow, meta = {}) => {
      if (domainProcessor && typeof domainProcessor._recordFetch === 'function') {
        return domainProcessor._recordFetch(fetchRow, meta, deps.newsDb, deps.queries, deps.stores, ctx.options?.verbose, logger);
      }
      return null;
    };
    
    try {
      const processingResult = await domainProcessor._processAllHubTypes({
        places: ctx.places,
        topics: ctx.topics,
        normalizedDomain: ctx.normalizedDomain,
        analyzers: deps.analyzers,
        validator: deps.validator,
        queries: deps.queries,
        stores: deps.stores,
        summary: ctx.summary,
        options: {
          enableTopicDiscovery: ctx.options?.enableTopicDiscovery,
          enableCombinationDiscovery: ctx.options?.enableCombinationDiscovery,
          enableHierarchicalDiscovery: ctx.options?.enableHierarchicalDiscovery,
          apply: ctx.options?.apply,
          patternLimit: Math.max(1, Number(ctx.options?.patternsPerPlace) || 3),
          maxAgeMs: ctx.options?.maxAgeMs,
          refresh404Ms: ctx.options?.refresh404Ms,
          retry4xxMs: ctx.options?.retry4xxMs,
          runId: ctx.options?.runId,
          nowMs: Date.now(),
          verbose: ctx.options?.verbose
        },
        deps,
        attemptCounter,
        recordFetch,
        recordDecision
      });
      
      const updatedSummary = {
        ...ctx.summary,
        determination: processingResult.rateLimitTriggered ? 'rate-limited' : 'processed',
        determinationReason: processingResult.rateLimitTriggered
          ? 'Processing aborted due to rate limiting'
          : `Processed ${ctx.summary.totalPlaces} places${ctx.summary.totalTopics ? `, ${ctx.summary.totalTopics} topics` : ''}${ctx.summary.totalCombinations ? `, ${ctx.summary.totalCombinations} combinations` : ''}`
      };
      
      return {
        ok: true,
        value: {
          ...ctx,
          processingResult,
          summary: updatedSummary
        }
      };
    } catch (err) {
      return {
        ok: false,
        reason: 'processing-error',
        err,
        value: {
          ...ctx,
          summary: {
            ...ctx.summary,
            errors: ctx.summary.errors + 1,
            determination: 'error',
            determinationReason: err.message || String(err)
          }
        }
      };
    }
  }, { optional: false });
}

/**
 * Create step that finalizes the summary
 * @param {DomainProcessingDeps} deps
 * @returns {import('../../crawler/pipeline').Step}
 */
function createFinalizeSummaryStep(deps) {
  return createStep('finalizeSummary', async (ctx) => {
    const summary = ctx.summary;
    
    if (!summary.completedAt) {
      summary.completedAt = new Date().toISOString();
    }
    
    if (!Number.isFinite(summary.durationMs)) {
      summary.durationMs = Math.max(0, Date.now() - summary.runStartedMs);
    }
    
    // Clean up internal tracking field
    delete summary.runStartedMs;
    
    return { ok: true, value: { ...ctx, summary } };
  }, { optional: false });
}

// ============================================================================
// Pipeline Builder
// ============================================================================

/**
 * Build the domain processing pipeline steps
 * @param {DomainProcessingDeps} deps
 * @param {Object} domainProcessor - DomainProcessor instance for delegation
 * @returns {import('../../crawler/pipeline').Step[]}
 */
function buildDomainProcessingSteps(deps, domainProcessor) {
  return [
    createNormalizeDomainStep(deps),
    createInitSummaryStep(deps),
    createAssessReadinessStep(deps),
    createSelectPlacesStep(deps),
    createSelectTopicsStep(deps),
    createCheckProcessableStep(deps),
    createProcessHubTypesStep(deps, domainProcessor),
    createFinalizeSummaryStep(deps)
  ];
}

/**
 * Process a domain using the pipeline pattern.
 * This is a pipeline-based alternative to DomainProcessor.processDomain()
 * 
 * @param {Object} params - Processing parameters
 * @param {string} params.domain - Domain to process
 * @param {string[]} [params.kinds=['country']] - Place kinds to process
 * @param {Object} [params.options={}] - Processing options
 * @param {DomainProcessingDeps} deps - Dependencies
 * @param {Object} domainProcessor - DomainProcessor instance for heavy lifting
 * @param {Object} [pipelineOptions] - Pipeline options
 * @returns {Promise<Object>} Processing summary
 */
async function processDomainPipeline({ domain, kinds = ['country'], options = {} }, deps, domainProcessor, pipelineOptions = {}) {
  const steps = buildDomainProcessingSteps(deps, domainProcessor);
  
  const initialCtx = {
    domain,
    kinds: Array.isArray(kinds) ? [...kinds] : ['country'],
    options: {
      ...options,
      runId: options.runId || `run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }
  };
  
  const result = await runPipeline(steps, initialCtx, deps, {
    timeoutMs: pipelineOptions.timeoutMs,
    stopOnError: true
  });
  
  // Extract the final summary from context
  const summary = result.ctx?.summary || {};
  
  // If pipeline failed, ensure summary reflects that
  if (!result.ok) {
    if (!summary.determination) {
      summary.determination = result.abortedAt || 'pipeline-error';
      summary.determinationReason = result.err?.message || 'Pipeline failed';
    }
    if (!summary.completedAt) {
      summary.completedAt = new Date().toISOString();
    }
  }
  
  return summary;
}

module.exports = {
  // Step builders
  createNormalizeDomainStep,
  createInitSummaryStep,
  createAssessReadinessStep,
  createSelectPlacesStep,
  createSelectTopicsStep,
  createCheckProcessableStep,
  createProcessHubTypesStep,
  createFinalizeSummaryStep,
  
  // Pipeline builders
  buildDomainProcessingSteps,
  processDomainPipeline
};
