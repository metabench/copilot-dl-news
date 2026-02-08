const { slugify } = require('../../tools/slugify');
const { getDsplForDomain } = require('../../services/shared/dspl');
const { PlacePlaceHubGapAnalyzer } = require('../../services/PlacePlaceHubGapAnalyzer');

// Import utility functions
const { normalizeDomain, applyScheme, extractTitle } = require('../../shared/utils/domainUtils');
const { computeAgeMs, extractPredictionSignals, composeCandidateSignals, createFetchRow } = require('../../shared/utils/dataUtils');
const { summarizeDsplPatterns, assessDomainReadiness, selectPlaces, selectTopics, collectHubChanges } = require('../../shared/utils/analysisUtils');
const { createBatchSummary, aggregateSummaryInto, createFailedDomainSummary } = require('../../shared/utils/summaryUtils');
const { fetchUrl } = require('./utils/httpUtils');
const { upsertAbsentPlacePageMapping } = require('../../data/db/sqlite/v1/queries/placePageMappings');

const { CRAWL_EVENT_TYPES, SEVERITY_LEVELS, createTelemetryEvent } = require('../../core/crawler/telemetry');

const DAY_MS = 24 * 60 * 60 * 1000;
const PLACE_KIND_TO_PAGE_KIND = {
  country: 'country-hub',
  region: 'region-hub',
  city: 'city-hub'
};

function resolvePageKind(placeKind) {
  return PLACE_KIND_TO_PAGE_KIND[placeKind] || 'country-hub';
}

function resolvePlaceId(place) {
  const value = place?.placeId ?? place?.place_id ?? place?.id ?? null;
  return Number.isFinite(value) ? value : null;
}

/**
 * DomainProcessor - Handles single domain hub guessing orchestration
 *
 * This module contains the core logic for processing a single domain's hub discovery,
 * including place selection, URL prediction, fetching, validation, and persistence.
 */
class DomainProcessor {
  constructor() {
    this.DAY_MS = DAY_MS;
  }

  /**
   * Process hub guessing for a single domain
   *
   * @param {Object} options - Processing options
   * @param {Object} deps - Injected dependencies
   * @returns {Promise<Object>} Domain processing summary
   */
  async processDomain(options = {}, deps = {}) {
    // Dependency extraction
    const {
      db,
      newsDb,
      queries,
      analyzers,
      validator,
      stores,
      logger,
      fetchFn,
      now = () => new Date(),
      telemetryBridge,
      batchProcessor,
      distributedAdapter
    } = deps;

    // Options extraction
    const normalizedDomain = normalizeDomain(options.domain, options.scheme);
    if (!normalizedDomain) {
      throw new Error('Domain is required');
    }

    const kinds = Array.isArray(options.kinds) ? [...options.kinds] : ['country'];
    const enableTopicDiscovery = Boolean(options.enableTopicDiscovery);
    const enableCombinationDiscovery = Boolean(options.enableCombinationDiscovery);
    const enableHierarchicalDiscovery = Boolean(options.enableHierarchicalDiscovery);
    const topics = Array.isArray(options.topics) ? [...options.topics] : [];
    const apply = Boolean(options.apply);
    const patternLimit = Math.max(1, Number(options.patternsPerPlace) || 3);
    const maxAgeMs = Number.isFinite(options.maxAgeDays) ? options.maxAgeDays * this.DAY_MS : 7 * this.DAY_MS;
    const refresh404Ms = Number.isFinite(options.refresh404Days) ? options.refresh404Days * this.DAY_MS : 180 * this.DAY_MS;
    const retry4xxMs = Number.isFinite(options.retry4xxDays) ? options.retry4xxDays * this.DAY_MS : 7 * this.DAY_MS;
    const runId = options.runId || `run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const nowMs = now().getTime();
    const runStartedMs = Date.now();
    const runStartedAt = new Date(runStartedMs);

    // Initialize summary
    const summary = this._createInitialSummary(normalizedDomain.host, runStartedAt);

    const finalizeSummary = () => this._finalizeSummary(summary, runStartedMs);

    let attemptCounter = 0;

    const recordFetch = (fetchRow, meta = {}) => this._recordFetch(fetchRow, meta, newsDb, queries, stores, options.verbose, logger);
    const recordDecision = (decision) => this._recordDecision(decision, summary, logger);

    const telemetryJobId = runId;
    const telemetryCrawlType = options.telemetryCrawlType || 'place-hubs';

    const emitTelemetry = (type, data = {}, eventOptions = {}) => {
      if (!telemetryBridge || typeof telemetryBridge.emitEvent !== 'function') {
        return;
      }

      try {
        telemetryBridge.emitEvent(createTelemetryEvent(type, data, {
          jobId: telemetryJobId,
          crawlType: telemetryCrawlType,
          source: 'orchestration:place-hubs',
          ...eventOptions
        }));
      } catch (_) {
        // Telemetry must never break orchestration.
      }
    };

    try {
      emitTelemetry(CRAWL_EVENT_TYPES.PLACE_HUB_GUESS_STARTED, {
        domain: normalizedDomain.host,
        scheme: normalizedDomain.scheme,
        kinds,
        enableTopicDiscovery,
        enableCombinationDiscovery,
        enableHierarchicalDiscovery,
        apply,
        patternsPerPlace: patternLimit,
        runId
      }, {
        severity: SEVERITY_LEVELS.INFO,
        message: `Place hub guessing started: ${normalizedDomain.host}`
      });

      // Assess domain readiness
      const readinessResult = await this._assessDomainReadiness(
        normalizedDomain, kinds, queries, analyzers, options, now, recordDecision
      );

      Object.assign(summary, readinessResult.summaryUpdates);

      // Handle insufficient data
      if (readinessResult.readiness.status === 'insufficient-data') {
        await this._handleInsufficientData(readinessResult, queries, summary, finalizeSummary);

        emitTelemetry(CRAWL_EVENT_TYPES.PLACE_HUB_GUESS_COMPLETED, {
          domain: normalizedDomain.host,
          runId,
          status: 'insufficient-data',
          summary: {
            totalPlaces: summary.totalPlaces,
            totalTopics: summary.totalTopics,
            totalCombinations: summary.totalCombinations,
            totalUrls: summary.totalUrls,
            fetched: summary.fetched,
            cached: summary.cached,
            validationSucceeded: summary.validationSucceeded,
            validationFailed: summary.validationFailed,
            insertedHubs: summary.insertedHubs,
            updatedHubs: summary.updatedHubs,
            errors: summary.errors,
            rateLimited: summary.rateLimited
          }
        }, {
          severity: SEVERITY_LEVELS.WARN,
          message: `Place hub guessing stopped: insufficient data for ${normalizedDomain.host}`
        });

        return finalizeSummary();
      }

      if (readinessResult.readiness.status === 'data-limited') {
        recordDecision({
          stage: 'READINESS',
          status: null,
          outcome: 'data-limited',
          level: 'warn',
          message: readinessResult.readiness.reason
        });
      }

      // Process recommendations
      readinessResult.readiness.recommendations.forEach(recommendation => {
        recordDecision({
          stage: 'READINESS',
          status: null,
          outcome: 'recommendation',
          level: 'info',
          message: recommendation
        });
      });

      // Select places and topics
      const { places, unsupported: unsupportedKinds } = selectPlaces(
        {
          countryAnalyzer: analyzers.country,
          regionAnalyzer: analyzers.region,
          cityAnalyzer: analyzers.city
        },
        kinds,
        options.limit
      );

      summary.unsupportedKinds = unsupportedKinds;
      summary.totalPlaces = places.length;

      let selectedTopics = [];
      if (enableTopicDiscovery || enableCombinationDiscovery || topics.length > 0) {
        const topicSelection = selectTopics(
          {
            topicAnalyzer: analyzers.topic
          },
          topics,
          options.limit
        );

        selectedTopics = topicSelection.topics;
        summary.unsupportedTopics = topicSelection.unsupported;
      } else {
        summary.unsupportedTopics = [];
      }

      summary.totalTopics = selectedTopics.length;

      if (!places.length && !selectedTopics.length) {
        return finalizeSummary();
      }

      // Process all hub types
      const processingResult = await this._processAllHubTypes({
        places,
        topics: selectedTopics,
        normalizedDomain,
        analyzers,
        validator,
        queries,
        stores,
        summary,
        options: {
          enableTopicDiscovery,
          enableCombinationDiscovery,
          enableHierarchicalDiscovery,
          apply,
          patternLimit,
          maxAgeMs,
          refresh404Ms,
          retry4xxMs,
          runId,
          nowMs,
          verbose: options.verbose,
          normalizedDomain
        },
        deps: { db, newsDb, queries, analyzers, validator, stores, logger, fetchFn, now, emitTelemetry, batchProcessor, distributedAdapter },
        attemptCounter,
        recordFetch,
        recordDecision
      });

      attemptCounter = processingResult.attemptCounter;

      // Record final determination
      if (apply) {
        this._recordFinalDetermination(queries, normalizedDomain.host, processingResult, summary);
      }

      summary.determination = 'processed';
      summary.determinationReason = `Processed ${summary.totalPlaces} places${enableTopicDiscovery ? `, ${summary.totalTopics} topics` : ''}${enableCombinationDiscovery ? `, ${summary.totalCombinations} combinations` : ''}`;

      emitTelemetry(CRAWL_EVENT_TYPES.PLACE_HUB_GUESS_COMPLETED, {
        domain: normalizedDomain.host,
        runId,
        status: processingResult.rateLimitTriggered ? 'rate-limited' : 'completed',
        rateLimitTriggered: processingResult.rateLimitTriggered,
        summary: {
          totalPlaces: summary.totalPlaces,
          totalTopics: summary.totalTopics,
          totalCombinations: summary.totalCombinations,
          totalUrls: summary.totalUrls,
          fetched: summary.fetched,
          cached: summary.cached,
          validationSucceeded: summary.validationSucceeded,
          validationFailed: summary.validationFailed,
          insertedHubs: summary.insertedHubs,
          updatedHubs: summary.updatedHubs,
          errors: summary.errors,
          rateLimited: summary.rateLimited
        }
      }, {
        severity: processingResult.rateLimitTriggered ? SEVERITY_LEVELS.WARN : SEVERITY_LEVELS.INFO,
        message: `Place hub guessing completed for ${normalizedDomain.host}`
      });

    } catch (error) {
      summary.errors += 1;
      summary.determination = 'error';
      summary.determinationReason = error.message || String(error);

      emitTelemetry(CRAWL_EVENT_TYPES.PLACE_HUB_GUESS_FAILED, {
        domain: normalizedDomain.host,
        runId,
        error: {
          message: error?.message || String(error),
          stack: error?.stack || null
        }
      }, {
        severity: SEVERITY_LEVELS.ERROR,
        message: `Place hub guessing failed for ${normalizedDomain.host}`
      });

      recordDecision({
        stage: 'ERROR',
        status: null,
        outcome: 'failed',
        level: 'error',
        message: `Domain processing failed: ${error.message || error}`
      });

      if (options.verbose) {
        logger?.error?.(error.stack);
      }

      throw error;
    }

    return finalizeSummary();
  }

  _createInitialSummary(domain, startedAt) {
    return {
      domain,
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
      diffPreview: {
        inserted: [],
        updated: []
      },
      readinessProbe: null,
      readinessTimedOut: 0,
      validationSucceeded: 0,
      validationFailed: 0,
      validationFailureReasons: {},
      startedAt: startedAt.toISOString(),
      completedAt: null,
      durationMs: null
    };
  }

  _finalizeSummary(summary, runStartedMs) {
    if (!summary.completedAt) {
      summary.completedAt = new Date().toISOString();
    }
    if (!Number.isFinite(summary.durationMs)) {
      summary.durationMs = Math.max(0, Date.now() - runStartedMs);
    }
    return summary;
  }

  async _assessDomainReadiness(normalizedDomain, kinds, queries, analyzers, options, now, recordDecision) {
    const metrics = queries.getDomainCoverageMetrics(normalizedDomain.host, {
      timeoutMs: options.readinessTimeoutMs,
      now: () => now().getTime()
    });

    const latestDetermination = queries.getLatestDomainDetermination(normalizedDomain.host);
    const dsplEntry = getDsplForDomain(analyzers.country?.dspls, normalizedDomain.host);

    const readiness = assessDomainReadiness({
      domain: normalizedDomain.host,
      kinds,
      metrics,
      dsplEntry,
      latestDetermination,
      minPageCount: options.minPageCount
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
      if (options.readinessTimeoutSeconds > 0) {
        recordDecision({
          stage: 'READINESS',
          status: null,
          outcome: 'timeout',
          level: 'warn',
          message: `Readiness probes exceeded the ${options.readinessTimeoutSeconds}s timeout budget; metrics may be incomplete.`
        });
      }
    }

    return { readiness, summaryUpdates };
  }

  async _handleInsufficientData(readinessResult, queries, summary, finalizeSummary) {
    const { readiness } = readinessResult;

    if (!summary.latestDetermination || summary.latestDetermination.determination !== 'insufficient-data') {
      const recorded = queries.recordDomainDetermination({
        domain: summary.domain,
        determination: 'insufficient-data',
        reason: readiness.reason,
        details: {
          metrics: readiness.metrics,
          dspl: readiness.dspl,
          recommendations: readiness.recommendations,
          kindsRequested: readiness.kindsRequested
        }
      });

      if (recorded > 0) {
        summary.latestDetermination = queries.getLatestDomainDetermination(summary.domain) || summary.latestDetermination;
      }
    }

    summary.determination = 'insufficient-data';
    summary.determinationReason = readiness.reason;
    summary.recommendations = Array.from(new Set(summary.recommendations));
  }

  async _processAllHubTypes(params) {
    const {
      places,
      topics,
      normalizedDomain,
      analyzers,
      validator,
      queries,
      stores,
      summary,
      options,
      deps,
      attemptCounter,
      recordFetch,
      recordDecision
    } = params;

    let currentAttemptCounter = attemptCounter;
    let rateLimitTriggered = false;

    // Process places
    if (places.length > 0 && !rateLimitTriggered) {
      const placeResult = await this._processPlaces({
        places,
        normalizedDomain,
        analyzers,
        validator,
        queries,
        stores,
        summary,
        options,
        deps,
        attemptCounter: currentAttemptCounter,
        recordFetch,
        recordDecision
      });
      currentAttemptCounter = placeResult.attemptCounter;
      rateLimitTriggered = placeResult.rateLimitTriggered;
    }

    // Process topics
    if (topics.length > 0 && !rateLimitTriggered && options.enableTopicDiscovery) {
      const topicResult = await this._processTopics({
        topics,
        normalizedDomain,
        analyzers,
        validator,
        queries,
        stores,
        summary,
        options,
        deps,
        attemptCounter: currentAttemptCounter,
        recordFetch,
        recordDecision
      });
      currentAttemptCounter = topicResult.attemptCounter;
      rateLimitTriggered = topicResult.rateLimitTriggered;
    }

    // Process combinations
    if (places.length > 0 && topics.length > 0 && !rateLimitTriggered && options.enableCombinationDiscovery) {
      const combinationResult = await this._processCombinations({
        places,
        topics,
        normalizedDomain,
        analyzers,
        validator,
        queries,
        stores,
        summary,
        options,
        deps,
        attemptCounter: currentAttemptCounter,
        recordFetch,
        recordDecision
      });
      currentAttemptCounter = combinationResult.attemptCounter;
      rateLimitTriggered = rateLimitTriggered || Boolean(combinationResult.rateLimitTriggered);
    }

    return {
      attemptCounter: currentAttemptCounter,
      rateLimitTriggered,
      totalPlaces: summary.totalPlaces,
      totalTopics: summary.totalTopics,
      totalCombinations: summary.totalCombinations,
      totalUrls: summary.totalUrls,
      fetched: summary.fetched,
      cached: summary.cached,
      validationSucceeded: summary.validationSucceeded,
      validationFailed: summary.validationFailed,
      insertedHubs: summary.insertedHubs,
      updatedHubs: summary.updatedHubs
    };
  }

  async _processPlaces(params) {
    const {
      places,
      normalizedDomain,
      analyzers,
      validator,
      queries,
      stores,
      summary,
      options,
      deps,
      attemptCounter,
      recordFetch,
      recordDecision
    } = params;

    let currentAttemptCounter = attemptCounter;
    let rateLimitTriggered = false;
    const processedPlaceKeys = new Set();

    for (const place of places) {
      if (rateLimitTriggered) break;

      const slug = slugify(place.name);
      const placeKey = `${place.kind}:${slug}`;

      if (processedPlaceKeys.has(placeKey)) {
        summary.skippedDuplicatePlace += 1;
        continue;
      }
      processedPlaceKeys.add(placeKey);

      const placeResult = await this._processPlaceCandidates({
        place,
        placeKey,
        normalizedDomain,
        analyzers,
        validator,
        queries,
        stores,
        summary,
        options,
        deps,
        attemptCounter: currentAttemptCounter,
        recordFetch,
        recordDecision
      });

      currentAttemptCounter = placeResult.attemptCounter;
      rateLimitTriggered = placeResult.rateLimitTriggered;
    }

    return { attemptCounter: currentAttemptCounter, rateLimitTriggered };
  }

  async _processPlaceCandidates(params) {
    const {
      place,
      placeKey,
      normalizedDomain,
      analyzers,
      validator,
      queries,
      stores,
      summary,
      options,
      deps,
      attemptCounter,
      recordFetch,
      recordDecision
    } = params;

    let currentAttemptCounter = attemptCounter;
    let rateLimitTriggered = false;

    // Get predictions
    let predictions = [];
    if (options.enableHierarchicalDiscovery && place.kind === 'country') {
      const hierarchicalAnalyzer = new PlacePlaceHubGapAnalyzer({
        db: deps.db,
        queries,
        logger: deps.logger
      });
      predictions = hierarchicalAnalyzer.predictPlacePlaceHubUrls(normalizedDomain.host, place.name, place.code);
    } else if (place.kind === 'country') {
      predictions = analyzers.country.predictCountryHubUrls(normalizedDomain.host, place.name, place.code);
    } else if (place.kind === 'region') {
      predictions = analyzers.region.predictRegionHubUrls(normalizedDomain.host, place);
    } else if (place.kind === 'city') {
      predictions = analyzers.city.predictCityHubUrls(normalizedDomain.host, place);
    }

    const normalizedPredictions = this._normalizePredictions(predictions, normalizedDomain.scheme);

    // Check if batch processing is available and should be used
    if (deps.batchProcessor && deps.batchProcessor.isAvailable() && options.useBatchMode !== false) {
      return this._processPlaceCandidatesBatch({
        predictions: normalizedPredictions.slice(0, options.patternLimit),
        place,
        placeKey,
        normalizedDomain,
        validator,
        queries,
        stores,
        summary,
        options,
        deps,
        attemptCounter: currentAttemptCounter,
        recordFetch,
        recordDecision
      });
    }

    // Sequential processing fallback
    for (const { url: candidateUrl, source: predictionSource } of normalizedPredictions.slice(0, options.patternLimit)) {
      if (rateLimitTriggered) break;

      summary.totalUrls += 1;

      const candidateResult = await this._processCandidateUrl({
        candidateUrl,
        predictionSource,
        place,
        placeKey,
        normalizedDomain,
        validator,
        queries,
        stores,
        summary,
        options,
        deps,
        attemptCounter: currentAttemptCounter,
        recordFetch,
        recordDecision
      });

      currentAttemptCounter = candidateResult.attemptCounter;
      rateLimitTriggered = candidateResult.rateLimitTriggered;
    }

    return { attemptCounter: currentAttemptCounter, rateLimitTriggered };
  }

  async _processTopics(params) {
    const {
      topics,
      normalizedDomain,
      analyzers,
      validator,
      queries,
      stores,
      summary,
      options,
      deps,
      attemptCounter,
      recordFetch,
      recordDecision
    } = params;

    let currentAttemptCounter = attemptCounter;
    let rateLimitTriggered = false;
    const processedTopicKeys = new Set();

    for (const topic of topics) {
      if (rateLimitTriggered) break;

      const topicKey = `topic:${topic.slug}`;

      if (processedTopicKeys.has(topicKey)) {
        summary.skippedDuplicateTopic += 1;
        continue;
      }
      processedTopicKeys.add(topicKey);

      const topicResult = await this._processTopicCandidates({
        topic,
        topicKey,
        normalizedDomain,
        analyzers,
        validator,
        queries,
        stores,
        summary,
        options,
        deps,
        attemptCounter: currentAttemptCounter,
        recordFetch,
        recordDecision
      });

      currentAttemptCounter = topicResult.attemptCounter;
      rateLimitTriggered = topicResult.rateLimitTriggered;
    }

    return { attemptCounter: currentAttemptCounter, rateLimitTriggered };
  }

  async _processTopicCandidates(params) {
    const {
      topic,
      topicKey,
      normalizedDomain,
      analyzers,
      validator,
      queries,
      stores,
      summary,
      options,
      deps,
      attemptCounter,
      recordFetch,
      recordDecision
    } = params;

    let currentAttemptCounter = attemptCounter;
    let rateLimitTriggered = false;

    const predictions = analyzers.topic.predictTopicHubUrls(normalizedDomain.host, topic.slug, topic.label);
    const normalizedPredictions = this._normalizePredictions(predictions, normalizedDomain.scheme);

    for (const { url: candidateUrl, source: predictionSource } of normalizedPredictions.slice(0, options.patternLimit)) {
      if (rateLimitTriggered) break;

      summary.totalUrls += 1;

      const candidateResult = await this._processTopicCandidateUrl({
        candidateUrl,
        predictionSource,
        topic,
        topicKey,
        normalizedDomain,
        validator,
        queries,
        stores,
        summary,
        options,
        deps,
        attemptCounter: currentAttemptCounter,
        recordFetch,
        recordDecision
      });

      currentAttemptCounter = candidateResult.attemptCounter;
      rateLimitTriggered = candidateResult.rateLimitTriggered;
    }

    return { attemptCounter: currentAttemptCounter, rateLimitTriggered };
  }

  async _processCombinations(params) {
    const {
      places,
      topics,
      normalizedDomain,
      analyzers,
      validator,
      queries,
      stores,
      summary,
      options,
      deps,
      attemptCounter,
      recordFetch,
      recordDecision
    } = params;

    let currentAttemptCounter = attemptCounter;
    let rateLimitTriggered = false;
    const processedCombinationKeys = new Set();

    for (const place of places) {
      if (rateLimitTriggered) {
        break;
      }
      for (const topic of topics) {
        if (rateLimitTriggered) {
          break;
        }
        const combinationKey = `${place.kind}:${slugify(place.name)}:${topic.slug}`;

        if (processedCombinationKeys.has(combinationKey)) {
          summary.skippedDuplicateCombination += 1;
          continue;
        }
        processedCombinationKeys.add(combinationKey);

        summary.totalCombinations += 1;

        const combinationResult = await this._processCombinationCandidates({
          place,
          topic,
          combinationKey,
          normalizedDomain,
          analyzers,
          validator,
          queries,
          stores,
          summary,
          options,
          deps,
          attemptCounter: currentAttemptCounter,
          recordFetch,
          recordDecision
        });

        currentAttemptCounter = combinationResult.attemptCounter;
        rateLimitTriggered = Boolean(combinationResult.rateLimitTriggered);
      }
    }

    return { attemptCounter: currentAttemptCounter, rateLimitTriggered };
  }

  async _processCombinationCandidates(params) {
    const {
      place,
      topic,
      combinationKey,
      normalizedDomain,
      analyzers,
      validator,
      queries,
      stores,
      summary,
      options,
      deps,
      attemptCounter,
      recordFetch,
      recordDecision
    } = params;

    let currentAttemptCounter = attemptCounter;
    let rateLimitTriggered = false;

    const predictions = analyzers.placeTopic.predictCombinationUrls(normalizedDomain.host, place, topic);
    const normalizedPredictions = this._normalizePredictions(predictions, normalizedDomain.scheme);

    for (const { url: candidateUrl, source: predictionSource } of normalizedPredictions.slice(0, options.patternLimit)) {
      if (rateLimitTriggered) {
        break;
      }
      summary.totalUrls += 1;

      const candidateResult = await this._processCombinationCandidateUrl({
        candidateUrl,
        predictionSource,
        place,
        topic,
        combinationKey,
        normalizedDomain,
        validator,
        queries,
        stores,
        summary,
        options,
        deps,
        attemptCounter: currentAttemptCounter,
        recordFetch,
        recordDecision
      });

      currentAttemptCounter = candidateResult.attemptCounter;
      rateLimitTriggered = Boolean(candidateResult.rateLimitTriggered);
    }

    return { attemptCounter: currentAttemptCounter, rateLimitTriggered };
  }

  async _processCandidateUrl(params) {
    const {
      candidateUrl,
      predictionSource,
      place,
      placeKey,
      normalizedDomain,
      validator,
      queries,
      stores,
      summary,
      options,
      deps,
      attemptCounter,
      recordFetch,
      recordDecision
    } = params;

    const nextAttemptCounter = attemptCounter + 1;
    const attemptId = `${placeKey}:${nextAttemptCounter}`;
    const attemptStartedAt = new Date().toISOString();

    const placeId = resolvePlaceId(place);
    const placeCode = place.code || place.countryCode || null;
    const placeSignalsInfo = {
      id: placeId,
      kind: place.kind,
      name: place.name,
      code: placeCode,
      country_code: placeCode
    };

    const analyzerName = typeof predictionSource === 'object' && predictionSource
      ? (predictionSource.analyzer || predictionSource.source || place.kind)
      : place.kind;
    const strategyValue = typeof predictionSource === 'object' && predictionSource
      ? (predictionSource.strategy || 'place-patterns')
      : 'place-patterns';
    const scoreValue = typeof predictionSource === 'object' ? predictionSource.score : null;
    const confidenceValue = typeof predictionSource === 'object' ? predictionSource.confidence : null;
    const patternValue = typeof predictionSource === 'object' ? predictionSource.pattern : null;

    const candidateSignals = composeCandidateSignals({
      predictionSource,
      patternSource: 'place-patterns',
      place: placeSignalsInfo,
      attemptId
    });

    const pageKind = resolvePageKind(place.kind);
    const recordAbsentMapping = (httpStatus, source) => {
      if (!options.apply) return;
      if (!deps.db || !placeId) return;

      const evidence = {
        presence: 'absent',
        checked_url: candidateUrl,
        http_status: Number.isFinite(httpStatus) ? httpStatus : null,
        source,
        verified_at: attemptStartedAt
      };

      try {
        upsertAbsentPlacePageMapping(deps.db, {
          placeId,
          host: normalizedDomain.host,
          url: candidateUrl,
          pageKind,
          evidence,
          verifiedAt: attemptStartedAt,
          timestamp: attemptStartedAt
        });
      } catch (error) {
        if (options.verbose) {
          deps.logger?.warn?.(`[orchestration] Failed to record absent mapping for ${candidateUrl}: ${error?.message || error}`);
        }
      }
    };

    deps.emitTelemetry?.(CRAWL_EVENT_TYPES.PLACE_HUB_CANDIDATE, {
      domain: normalizedDomain.host,
      attemptId,
      attemptStartedAt,
      candidateUrl,
      kind: place.kind,
      place: {
        name: place.name,
        code: placeSignalsInfo.code
      },
      prediction: {
        analyzer: analyzerName,
        strategy: strategyValue,
        score: scoreValue,
        confidence: confidenceValue,
        pattern: patternValue
      }
    }, {
      severity: SEVERITY_LEVELS.DEBUG,
      message: `Candidate: ${candidateUrl}`
    });

    // Save candidate to store
    if (stores.candidates && typeof stores.candidates.saveCandidate === 'function') {
      try {
        stores.candidates.saveCandidate({
          domain: normalizedDomain.host,
          candidateUrl,
          normalizedUrl: candidateUrl,
          placeKind: place.kind,
          placeName: place.name,
          placeCode: placeSignalsInfo.code,
          placeId,
          analyzer: analyzerName,
          strategy: strategyValue,
          score: scoreValue,
          confidence: confidenceValue,
          pattern: patternValue,
          signals: candidateSignals,
          attemptId,
          attemptStartedAt,
          status: 'pending',
          validationStatus: null,
          source: 'guess-place-hubs',
          lastSeenAt: attemptStartedAt
        });
      } catch (storeError) {
        if (options.verbose) {
          deps.logger?.warn?.(`[orchestration] Failed to save candidate ${candidateUrl}: ${storeError?.message || storeError}`);
        }
      }
    }

    // Check cache
    const cacheResult = this._checkUrlCache(candidateUrl, queries, options, summary, stores, attemptStartedAt);
    if (cacheResult.cached) {
      return { attemptCounter: nextAttemptCounter, rateLimitTriggered: false };
    }

    const headOutcome = await this._performHeadProbe({
      candidateUrl,
      normalizedDomain,
      deps,
      attemptId,
      attemptStartedAt,
      summary,
      options,
      recordFetch,
      recordDecision,
      stores
    });

    if (headOutcome.rateLimitTriggered) {
      return { attemptCounter: nextAttemptCounter, rateLimitTriggered: true };
    }

    if (!headOutcome.shouldProceed) {
      if (headOutcome.notFound) {
        recordAbsentMapping(headOutcome.status, 'guess-place-hubs.head');
      }
      return { attemptCounter: nextAttemptCounter, rateLimitTriggered: false };
    }

    // Fetch URL
    try {
      const result = await fetchUrl(candidateUrl, deps.fetchFn, { logger: deps.logger, timeoutMs: 15000 });
      summary.fetched += 1;

      const fetchRow = createFetchRow(result, normalizedDomain.host);
      recordFetch(fetchRow, { stage: 'GET', attemptId, cacheHit: false });

      recordDecision({
        stage: 'FETCH',
        status: result.status,
        outcome: result.ok ? 'fetched' : `status-${result.status}`,
        level: result.ok ? 'info' : 'warn',
        message: `GET ${result.status} ${candidateUrl}`
      });

      stores.candidates?.markStatus?.({
        domain: normalizedDomain.host,
        candidateUrl,
        status: result.ok ? 'fetched-ok' : 'fetched-error',
        httpStatus: result.status,
        lastSeenAt: attemptStartedAt
      });

      if (result.status === 404 || result.status === 410) {
        summary.stored404 += 1;
        recordAbsentMapping(result.status, 'guess-place-hubs.fetch');
        return { attemptCounter: nextAttemptCounter, rateLimitTriggered: false };
      }

      if (result.status === 429) {
        summary.rateLimited += 1;
        recordDecision({
          stage: 'FETCH',
          status: 429,
          outcome: 'rate-limited',
          level: 'warn',
          message: `Rate limited on ${candidateUrl}; aborting further fetches.`
        });
        return { attemptCounter: nextAttemptCounter, rateLimitTriggered: true };
      }

      if (!result.ok) {
        summary.errors += 1;
        return { attemptCounter: nextAttemptCounter, rateLimitTriggered: false };
      }

      const pageTitle = extractTitle(result.body) || place.name;
      const linkMetrics = this._analyzeHtmlForLinks(result.body);

      let rawValidation = null;
      if (validator && typeof validator.validatePlaceHub === 'function') {
        try {
          rawValidation = validator.validatePlaceHub(pageTitle, candidateUrl);
        } catch (_) {
          rawValidation = null;
        }
      }

      const normalizedValidation = {
        ...(rawValidation || {}),
        isValid: rawValidation?.isValid || linkMetrics.articleLinksCount >= 10,
        confidence: rawValidation?.confidence ?? (linkMetrics.articleLinksCount >= 10 ? 0.8 : 0.1),
        navLinkCount: linkMetrics.navLinksCount,
        articleLinkCount: linkMetrics.articleLinksCount,
        pageTitle
      };

      const validationSignals = composeCandidateSignals({
        predictionSource,
        patternSource: 'place-patterns',
        place: placeSignalsInfo,
        attemptId,
        validationMetrics: normalizedValidation
      });

      stores.candidates?.updateValidation?.({
        domain: normalizedDomain.host,
        candidateUrl,
        validationStatus: normalizedValidation.isValid ? 'validated' : 'validation-failed',
        validationScore: normalizedValidation.confidence || null,
        validationDetails: normalizedValidation,
        signals: validationSignals,
        lastSeenAt: attemptStartedAt
      });

      deps.emitTelemetry?.(CRAWL_EVENT_TYPES.PLACE_HUB_DETERMINATION, {
        domain: normalizedDomain.host,
        attemptId,
        candidateUrl,
        kind: place.kind,
        place: {
          name: place.name,
          code: placeSignalsInfo.code
        },
        determination: {
          accepted: Boolean(normalizedValidation.isValid),
          confidence: normalizedValidation.confidence ?? null,
          reason: normalizedValidation.reason || null,
          navLinkCount: normalizedValidation.navLinkCount ?? null,
          articleLinkCount: normalizedValidation.articleLinkCount ?? null,
          pageTitle: normalizedValidation.pageTitle || null
        },
        apply: Boolean(options.apply)
      }, {
        severity: normalizedValidation.isValid ? SEVERITY_LEVELS.INFO : SEVERITY_LEVELS.WARN,
        message: normalizedValidation.isValid ? `Accepted: ${candidateUrl}` : `Rejected: ${candidateUrl}`
      });

      if (normalizedValidation.isValid) {
        summary.validationSucceeded += 1;

        if (options.apply) {
          this._persistValidatedHub({
            candidateUrl,
            place,
            result,
            validationResult: normalizedValidation,
            candidateSignals,
            normalizedDomain,
            queries,
            summary,
            pageTitle
          });
        }
      } else {
        summary.validationFailed += 1;
        const failureReason = normalizedValidation.reason || 'unknown';
        summary.validationFailureReasons[failureReason] =
          (summary.validationFailureReasons[failureReason] || 0) + 1;
      }

      // Record audit entry
      try {
        queries.recordAuditEntry({
          domain: normalizedDomain.host,
          url: candidateUrl,
          placeKind: place.kind,
          placeName: place.name,
          decision: normalizedValidation.isValid ? 'accepted' : 'rejected',
          validationMetricsJson: JSON.stringify(normalizedValidation),
          attemptId,
          runId: options.runId
        });
      } catch (auditError) {
        if (options.verbose) {
          deps.logger?.warn?.(`[orchestration] Failed to record audit entry for ${candidateUrl}: ${auditError?.message || auditError}`);
        }
      }

    } catch (fetchError) {
      summary.errors += 1;
      stores.candidates?.markStatus?.({
        domain: normalizedDomain.host,
        candidateUrl,
        status: 'fetch-error',
        errorMessage: fetchError.message || String(fetchError),
        lastSeenAt: attemptStartedAt
      });

      recordDecision({
        stage: 'FETCH',
        status: fetchError?.status || null,
        outcome: 'error',
        level: 'error',
        message: `Failed to fetch ${candidateUrl}: ${fetchError.message || fetchError}`
      });

      deps.emitTelemetry?.(CRAWL_EVENT_TYPES.PLACE_HUB_DETERMINATION, {
        domain: normalizedDomain.host,
        attemptId,
        candidateUrl,
        kind: place.kind,
        place: {
          name: place.name,
          code: placeSignalsInfo.code
        },
        determination: {
          accepted: false,
          error: fetchError?.message || String(fetchError)
        },
        apply: Boolean(options.apply)
      }, {
        severity: SEVERITY_LEVELS.ERROR,
        message: `Candidate error: ${candidateUrl}`
      });

      return {
        attemptCounter: nextAttemptCounter,
        rateLimitTriggered: Boolean(fetchError?.rateLimitTriggered)
      };
    }

    return { attemptCounter: nextAttemptCounter, rateLimitTriggered: false };
  }

  /**
   * Process place candidates in batch mode using distributed adapter
   * 
   * This method provides high-throughput processing by batching HEAD checks
   * and GET fetches via the distributed fetch adapter.
   */
  async _processPlaceCandidatesBatch(params) {
    const {
      predictions,
      place,
      placeKey,
      normalizedDomain,
      validator,
      queries,
      stores,
      summary,
      options,
      deps,
      attemptCounter,
      recordFetch,
      recordDecision
    } = params;

    const batchProcessor = deps.batchProcessor;
    if (!batchProcessor || !batchProcessor.isAvailable()) {
      deps.logger?.warn?.('[DomainProcessor] Batch processor not available, falling back to sequential');
      return { attemptCounter, rateLimitTriggered: false };
    }

    const startTime = Date.now();
    let currentAttemptCounter = attemptCounter;
    let rateLimitTriggered = false;

    const placeId = resolvePlaceId(place);
    const placeCode = place.code || place.countryCode || null;
    const pageKind = resolvePageKind(place.kind);
    const batchStartedAt = new Date().toISOString();

    // Prepare candidates with metadata
    const candidates = predictions.map(({ url, source }, index) => ({
      url,
      source,
      attemptId: `${placeKey}:${attemptCounter + index + 1}`,
      attemptStartedAt: batchStartedAt
    }));

    summary.totalUrls += candidates.length;

    deps.emitTelemetry?.(CRAWL_EVENT_TYPES.BATCH_OPERATION_START || 'BATCH_OPERATION_START', {
      domain: normalizedDomain.host,
      kind: place.kind,
      place: { name: place.name, code: placeCode },
      candidateCount: candidates.length,
      mode: 'batch'
    }, {
      severity: SEVERITY_LEVELS.INFO,
      message: `Batch processing ${candidates.length} candidates for ${place.name}`
    });

    try {
      // Use batch processor for HEAD + GET
      const batchResult = await batchProcessor.processCandidatesBatch(candidates, {
        domain: normalizedDomain.host,
        placeKind: place.kind,
        placeName: place.name
      });

      // Process results
      for (const result of batchResult.results) {
        currentAttemptCounter++;

        const { candidate, headResult, getResult, outcome, validation, shouldRecordAbsent, absentStatus } = result;

        // Record telemetry for each candidate
        deps.emitTelemetry?.(CRAWL_EVENT_TYPES.PLACE_HUB_CANDIDATE, {
          domain: normalizedDomain.host,
          attemptId: candidate.attemptId,
          candidateUrl: candidate.url,
          kind: place.kind,
          place: { name: place.name, code: placeCode },
          batchMode: true,
          outcome
        }, {
          severity: outcome === 'fetched' ? SEVERITY_LEVELS.INFO : SEVERITY_LEVELS.DEBUG,
          message: `Batch candidate ${outcome}: ${candidate.url}`
        });

        // Handle rate limiting
        if (outcome === 'rate-limited') {
          summary.rateLimited += 1;
          rateLimitTriggered = true;
          recordDecision({
            stage: 'BATCH',
            status: 429,
            outcome: 'rate-limited',
            level: 'warn',
            message: `Rate limited: ${candidate.url}`
          });
          break;
        }

        // Record absent mappings
        if (shouldRecordAbsent && options.apply && placeId) {
          const evidence = {
            presence: 'absent',
            checked_url: candidate.url,
            http_status: absentStatus || null,
            source: 'guess-place-hubs.batch',
            verified_at: batchStartedAt
          };

          try {
            upsertAbsentPlacePageMapping(deps.db, {
              placeId,
              host: normalizedDomain.host,
              url: candidate.url,
              pageKind,
              evidence,
              verifiedAt: batchStartedAt,
              timestamp: batchStartedAt
            });
            summary.stored404 += 1;
          } catch (error) {
            if (options.verbose) {
              deps.logger?.warn?.(`[DomainProcessor] Failed to record absent mapping: ${error?.message}`);
            }
          }

          recordDecision({
            stage: 'BATCH',
            status: absentStatus,
            outcome: 'not-found',
            level: 'info',
            message: `Not found: ${candidate.url}`
          });
          continue;
        }

        // Handle successful fetches with validation
        if (outcome === 'fetched' && getResult && validation) {
          summary.fetched += 1;

          const fetchRow = createFetchRow(getResult, normalizedDomain.host);
          recordFetch(fetchRow, { stage: 'BATCH-GET', attemptId: candidate.attemptId, cacheHit: false });

          // Update candidate store
          stores.candidates?.updateValidation?.({
            domain: normalizedDomain.host,
            candidateUrl: candidate.url,
            validationStatus: validation.isValid ? 'validated' : 'validation-failed',
            validationScore: validation.confidence || null,
            validationDetails: validation,
            lastSeenAt: batchStartedAt
          });

          if (validation.isValid) {
            summary.validationSucceeded += 1;

            recordDecision({
              stage: 'BATCH-VALIDATE',
              status: getResult.status,
              outcome: 'accepted',
              level: 'info',
              message: `Validated hub: ${candidate.url} (${validation.linkCount} links)`
            });

            // Persist validated hub
            if (options.apply) {
              this._persistValidatedHub({
                candidateUrl: candidate.url,
                place,
                result: getResult,
                validationResult: validation,
                candidateSignals: { source: candidate.source },
                normalizedDomain,
                queries,
                summary,
                pageTitle: validation.pageTitle
              });
            }
          } else {
            summary.validationFailed += 1;
            recordDecision({
              stage: 'BATCH-VALIDATE',
              status: getResult.status,
              outcome: 'rejected',
              level: 'info',
              message: `Validation failed: ${candidate.url} (${validation.linkCount} links)`
            });
          }
        } else if (outcome === 'fetch-error') {
          summary.errors += 1;
          recordDecision({
            stage: 'BATCH',
            status: getResult?.status,
            outcome: 'error',
            level: 'warn',
            message: `Fetch error: ${candidate.url}`
          });
        }
      }

      const elapsed = Date.now() - startTime;
      const throughput = elapsed > 0 ? (batchResult.summary.getFetched / (elapsed / 1000)).toFixed(1) : 0;

      deps.emitTelemetry?.(CRAWL_EVENT_TYPES.BATCH_OPERATION_COMPLETE || 'BATCH_OPERATION_COMPLETE', {
        domain: normalizedDomain.host,
        kind: place.kind,
        place: { name: place.name, code: placeCode },
        summary: batchResult.summary,
        elapsedMs: elapsed,
        throughputPerSec: parseFloat(throughput)
      }, {
        severity: SEVERITY_LEVELS.INFO,
        message: `Batch complete: ${batchResult.summary.getFetched} fetched in ${elapsed}ms (${throughput}/sec)`
      });

    } catch (batchError) {
      deps.logger?.error?.(`[DomainProcessor] Batch processing error: ${batchError?.message || batchError}`);
      recordDecision({
        stage: 'BATCH',
        status: null,
        outcome: 'batch-error',
        level: 'error',
        message: `Batch error: ${batchError?.message || batchError}`
      });
    }

    return { attemptCounter: currentAttemptCounter, rateLimitTriggered };
  }

  async _processTopicCandidateUrl(params) {
    const {
      candidateUrl,
      predictionSource,
      topic,
      topicKey,
      normalizedDomain,
      validator,
      queries,
      stores,
      summary,
      options,
      deps,
      attemptCounter,
      recordFetch,
      recordDecision
    } = params;

    const nextAttemptCounter = attemptCounter + 1;
    const attemptId = `${topicKey}:${nextAttemptCounter}`;
    const attemptStartedAt = new Date().toISOString();

    const topicSignalsInfo = {
      kind: 'topic',
      name: topic.label,
      slug: topic.slug
    };

    const analyzerName = typeof predictionSource === 'object' && predictionSource
      ? (predictionSource.analyzer || predictionSource.source || 'topic')
      : 'topic';
    const strategyValue = typeof predictionSource === 'object' && predictionSource
      ? (predictionSource.strategy || 'topic-patterns')
      : 'topic-patterns';
    const scoreValue = typeof predictionSource === 'object' ? predictionSource.score : null;
    const confidenceValue = typeof predictionSource === 'object' ? predictionSource.confidence : null;
    const patternValue = typeof predictionSource === 'object' ? predictionSource.pattern : null;

    const candidateSignals = composeCandidateSignals({
      predictionSource,
      patternSource: 'topic-patterns',
      topic: topicSignalsInfo,
      attemptId
    });

    // Save candidate to store
    if (stores.candidates && typeof stores.candidates.saveCandidate === 'function') {
      try {
        stores.candidates.saveCandidate({
          domain: normalizedDomain.host,
          candidateUrl,
          normalizedUrl: candidateUrl,
          topicSlug: topic.slug,
          topicLabel: topic.label,
          analyzer: analyzerName,
          strategy: strategyValue,
          score: scoreValue,
          confidence: confidenceValue,
          pattern: patternValue,
          signals: candidateSignals,
          attemptId,
          attemptStartedAt,
          status: 'pending',
          validationStatus: null,
          source: 'guess-topic-hubs',
          lastSeenAt: attemptStartedAt
        });
      } catch (storeError) {
        if (options.verbose) {
          deps.logger?.warn?.(`[orchestration] Failed to save candidate ${candidateUrl}: ${storeError?.message || storeError}`);
        }
      }
    }

    // Check cache
    const cacheResult = this._checkUrlCache(candidateUrl, queries, options, summary, stores, attemptStartedAt);
    if (cacheResult.cached) {
      return { attemptCounter: nextAttemptCounter, rateLimitTriggered: false };
    }

    const headOutcome = await this._performHeadProbe({
      candidateUrl,
      normalizedDomain,
      deps,
      attemptId,
      attemptStartedAt,
      summary,
      options,
      recordFetch,
      recordDecision,
      stores
    });

    if (headOutcome.rateLimitTriggered) {
      return { attemptCounter: nextAttemptCounter, rateLimitTriggered: true };
    }

    if (!headOutcome.shouldProceed) {
      return { attemptCounter: nextAttemptCounter, rateLimitTriggered: false };
    }

    // Fetch URL
    try {
      const result = await fetchUrl(candidateUrl, deps.fetchFn, { logger: deps.logger, timeoutMs: 15000 });
      summary.fetched += 1;

      const fetchRow = createFetchRow(result, normalizedDomain.host);
      recordFetch(fetchRow, { stage: 'GET', attemptId, cacheHit: false });

      stores.candidates?.markStatus?.({
        domain: normalizedDomain.host,
        candidateUrl,
        status: result.ok ? 'fetched-ok' : 'fetched-error',
        httpStatus: result.status,
        lastSeenAt: attemptStartedAt
      });

      if (result.status === 404) {
        summary.stored404 += 1;
        return { attemptCounter: nextAttemptCounter, rateLimitTriggered: false };
      }

      if (result.status === 429) {
        summary.rateLimited += 1;
        recordDecision({
          stage: 'FETCH',
          status: 429,
          outcome: 'rate-limited',
          level: 'warn',
          message: `Rate limited on ${candidateUrl}; aborting further fetches.`
        });
        return { attemptCounter: nextAttemptCounter, rateLimitTriggered: true };
      }

      if (!result.ok) {
        summary.errors += 1;
        return { attemptCounter: nextAttemptCounter, rateLimitTriggered: false };
      }

      const pageTitle = extractTitle(result.body) || topic.label;
      const linkMetrics = this._analyzeHtmlForLinks(result.body);

      let rawValidation = null;
      if (validator && typeof validator.validateTopicHub === 'function') {
        try {
          rawValidation = validator.validateTopicHub(pageTitle, candidateUrl);
        } catch (_) {
          rawValidation = null;
        }
      }

      const normalizedValidation = {
        ...(rawValidation || {}),
        isValid: rawValidation?.isValid || linkMetrics.articleLinksCount >= 10,
        confidence: rawValidation?.confidence ?? (linkMetrics.articleLinksCount >= 10 ? 0.75 : 0.1),
        navLinkCount: linkMetrics.navLinksCount,
        articleLinkCount: linkMetrics.articleLinksCount,
        pageTitle
      };

      const validationSignals = composeCandidateSignals({
        predictionSource,
        patternSource: 'topic-patterns',
        topic: topicSignalsInfo,
        attemptId,
        validationMetrics: normalizedValidation
      });

      stores.candidates?.updateValidation?.({
        domain: normalizedDomain.host,
        candidateUrl,
        validationStatus: normalizedValidation.isValid ? 'validated' : 'validation-failed',
        validationScore: normalizedValidation.confidence || null,
        validationDetails: normalizedValidation,
        signals: validationSignals,
        lastSeenAt: attemptStartedAt
      });

      if (normalizedValidation.isValid) {
        summary.validationSucceeded += 1;

        if (options.apply) {
          this._persistValidatedTopicHub({
            candidateUrl,
            topic,
            result,
            validationResult: normalizedValidation,
            candidateSignals,
            normalizedDomain,
            queries,
            summary,
            pageTitle
          });
        }
      } else {
        summary.validationFailed += 1;
        const failureReason = normalizedValidation.reason || 'unknown';
        summary.validationFailureReasons[failureReason] =
          (summary.validationFailureReasons[failureReason] || 0) + 1;
      }

      // Record audit entry
      try {
        queries.recordAuditEntry({
          domain: normalizedDomain.host,
          url: candidateUrl,
          placeKind: 'topic',
          placeName: topic.label,
          decision: normalizedValidation.isValid ? 'accepted' : 'rejected',
          validationMetricsJson: JSON.stringify(normalizedValidation),
          attemptId,
          runId: options.runId
        });
      } catch (auditError) {
        if (options.verbose) {
          deps.logger?.warn?.(`[orchestration] Failed to record audit entry for ${candidateUrl}: ${auditError?.message || auditError}`);
        }
      }

    } catch (fetchError) {
      summary.errors += 1;
      stores.candidates?.markStatus?.({
        domain: normalizedDomain.host,
        candidateUrl,
        status: 'fetch-error',
        errorMessage: fetchError.message || String(fetchError),
        lastSeenAt: attemptStartedAt
      });

      recordDecision({
        stage: 'FETCH',
        status: null,
        outcome: 'error',
        level: 'error',
        message: `Failed to fetch ${candidateUrl}: ${fetchError.message || fetchError}`
      });
    }

    return { attemptCounter: nextAttemptCounter, rateLimitTriggered: false };
  }

  async _processCombinationCandidateUrl(params) {
    const {
      candidateUrl,
      predictionSource,
      place,
      topic,
      combinationKey,
      normalizedDomain,
      validator,
      queries,
      stores,
      summary,
      options,
      deps,
      attemptCounter,
      recordFetch,
      recordDecision
    } = params;

    const nextAttemptCounter = attemptCounter + 1;
    const attemptId = `${combinationKey}:${nextAttemptCounter}`;
    const attemptStartedAt = new Date().toISOString();

    const combinationSignalsInfo = {
      place: {
        kind: place.kind,
        name: place.name,
        code: place.code || place.countryCode || null
      },
      topic: {
        kind: 'topic',
        name: topic.label,
        slug: topic.slug
      }
    };

    const analyzerName = typeof predictionSource === 'object' && predictionSource
      ? (predictionSource.analyzer || predictionSource.source || 'place-topic')
      : 'place-topic';
    const strategyValue = typeof predictionSource === 'object' && predictionSource
      ? (predictionSource.strategy || 'place-topic-patterns')
      : 'place-topic-patterns';
    const scoreValue = typeof predictionSource === 'object' ? predictionSource.score : null;
    const confidenceValue = typeof predictionSource === 'object' ? predictionSource.confidence : null;
    const patternValue = typeof predictionSource === 'object' ? predictionSource.pattern : null;

    const candidateSignals = composeCandidateSignals({
      predictionSource,
      patternSource: 'place-topic-patterns',
      place: combinationSignalsInfo.place,
      topic: combinationSignalsInfo.topic,
      attemptId
    });

    // Save candidate to store
    if (stores.candidates && typeof stores.candidates.saveCandidate === 'function') {
      try {
        stores.candidates.saveCandidate({
          domain: normalizedDomain.host,
          candidateUrl,
          normalizedUrl: candidateUrl,
          placeKind: place.kind,
          placeName: place.name,
          placeCode: combinationSignalsInfo.place.code,
          topicSlug: topic.slug,
          topicLabel: topic.label,
          analyzer: analyzerName,
          strategy: strategyValue,
          score: scoreValue,
          confidence: confidenceValue,
          pattern: patternValue,
          signals: candidateSignals,
          attemptId,
          attemptStartedAt,
          status: 'pending',
          validationStatus: null,
          source: 'guess-place-topic-combinations',
          lastSeenAt: attemptStartedAt
        });
      } catch (storeError) {
        if (options.verbose) {
          deps.logger?.warn?.(`[orchestration] Failed to save candidate ${candidateUrl}: ${storeError?.message || storeError}`);
        }
      }
    }

    // Check cache
    const cacheResult = this._checkUrlCache(candidateUrl, queries, options, summary, stores, attemptStartedAt);
    if (cacheResult.cached) {
      return { attemptCounter: nextAttemptCounter };
    }

    const headOutcome = await this._performHeadProbe({
      candidateUrl,
      normalizedDomain,
      deps,
      attemptId,
      attemptStartedAt,
      summary,
      options,
      recordFetch,
      recordDecision,
      stores
    });

    if (headOutcome.rateLimitTriggered) {
      return { attemptCounter: nextAttemptCounter, rateLimitTriggered: true };
    }

    if (!headOutcome.shouldProceed) {
      return { attemptCounter: nextAttemptCounter };
    }

    // Fetch URL
    try {
      const result = await fetchUrl(candidateUrl, deps.fetchFn, { logger: deps.logger, timeoutMs: 15000 });
      summary.fetched += 1;

      const fetchRow = createFetchRow(result, normalizedDomain.host);
      recordFetch(fetchRow, { stage: 'GET', attemptId, cacheHit: false });

      stores.candidates?.markStatus?.({
        domain: normalizedDomain.host,
        candidateUrl,
        status: result.ok ? 'fetched-ok' : 'fetched-error',
        httpStatus: result.status,
        lastSeenAt: attemptStartedAt
      });

      if (result.status === 404) {
        summary.stored404 += 1;
        return { attemptCounter: nextAttemptCounter };
      }

      if (result.status === 429) {
        summary.rateLimited += 1;
        recordDecision({
          stage: 'FETCH',
          status: 429,
          outcome: 'rate-limited',
          level: 'warn',
          message: `Rate limited on ${candidateUrl}; aborting further fetches.`
        });
        return { attemptCounter: nextAttemptCounter };
      }

      if (!result.ok) {
        summary.errors += 1;
        return { attemptCounter: nextAttemptCounter };
      }

      // Validate combination hub using detectPlaceHub
      const { detectPlaceHub } = require('../../tools/placeHubDetector');
      const gazetteerPlaceNames = queries.getGazetteerPlaceNames ? queries.getGazetteerPlaceNames() : null;
      const nonGeoTopicSlugs = queries.getNonGeoTopicSlugs ? queries.getNonGeoTopicSlugs() : null;

      const detectionResult = detectPlaceHub({
        url: candidateUrl,
        title: extractTitle(result.body),
        urlPlaceAnalysis: null,
        urlPlaces: [],
        analysisPlaces: [],
        section: topic.label,
        fetchClassification: null,
        latestClassification: null,
        navLinksCount: null,
        articleLinksCount: null,
        wordCount: null,
        articleWordCount: null,
        fetchWordCount: null,
        articleAnalysis: null,
        fetchAnalysis: null,
        gazetteerPlaceNames,
        minNavLinksThreshold: 10,
        nonGeoTopicSlugs,
        db: deps.db
      });

      const isValidCombination = detectionResult &&
        detectionResult.kind === 'place' &&
        detectionResult.topic &&
        detectionResult.placeSlug === slugify(place.name) &&
        detectionResult.topic.slug === topic.slug;

      const validationSignals = composeCandidateSignals({
        predictionSource,
        patternSource: 'place-topic-patterns',
        place: combinationSignalsInfo.place,
        topic: combinationSignalsInfo.topic,
        attemptId,
        validationMetrics: {
          isValid: isValidCombination,
          detectionResult,
          confidence: detectionResult?.evidence?.topic?.confidence || null
        }
      });

      stores.candidates?.updateValidation?.({
        domain: normalizedDomain.host,
        candidateUrl,
        validationStatus: isValidCombination ? 'validated' : 'validation-failed',
        validationScore: detectionResult?.evidence?.topic?.confidence || null,
        validationDetails: {
          isValid: isValidCombination,
          detectionResult,
          expectedPlace: place.name,
          expectedTopic: topic.slug
        },
        signals: validationSignals,
        lastSeenAt: attemptStartedAt
      });

      if (isValidCombination) {
        summary.validationSucceeded += 1;

        if (options.apply) {
          this._persistValidatedCombinationHub({
            candidateUrl,
            place,
            topic,
            result,
            detectionResult,
            candidateSignals,
            normalizedDomain,
            queries,
            summary
          });
        }
      } else {
        summary.validationFailed += 1;
        const failureReason = isValidCombination === false ? 'detection-failed' : 'unknown';
        summary.validationFailureReasons[failureReason] =
          (summary.validationFailureReasons[failureReason] || 0) + 1;
      }

      // Record audit entry
      try {
        queries.recordAuditEntry({
          domain: normalizedDomain.host,
          url: candidateUrl,
          placeKind: 'combination',
          placeName: `${place.name} + ${topic.label}`,
          decision: isValidCombination ? 'accepted' : 'rejected',
          validationMetricsJson: JSON.stringify({
            isValid: isValidCombination,
            detectionResult,
            expectedPlace: place.name,
            expectedTopic: topic.slug
          }),
          attemptId,
          runId: options.runId
        });
      } catch (auditError) {
        if (options.verbose) {
          deps.logger?.warn?.(`[orchestration] Failed to record audit entry for ${candidateUrl}: ${auditError?.message || auditError}`);
        }
      }

    } catch (fetchError) {
      summary.errors += 1;
      stores.candidates?.markStatus?.({
        domain: normalizedDomain.host,
        candidateUrl,
        status: 'fetch-error',
        errorMessage: fetchError.message || String(fetchError),
        lastSeenAt: attemptStartedAt
      });

      recordDecision({
        stage: 'FETCH',
        status: null,
        outcome: 'error',
        level: 'error',
        message: `Failed to fetch ${candidateUrl}: ${fetchError.message || fetchError}`
      });
    }

    return { attemptCounter: nextAttemptCounter };
  }

  _normalizePredictions(predictions, scheme) {
    const normalizedPredictions = [];
    const seenCandidates = new Set();

    for (const candidate of Array.isArray(predictions) ? predictions : []) {
      const baseUrl = typeof candidate === 'string' ? candidate : candidate?.url;
      if (typeof baseUrl !== 'string' || baseUrl.trim() === '') continue;

      const candidateUrl = applyScheme(baseUrl, scheme);
      if (typeof candidateUrl !== 'string' || candidateUrl.trim() === '') continue;

      const key = candidateUrl.toLowerCase();
      if (seenCandidates.has(key)) continue;
      seenCandidates.add(key);

      normalizedPredictions.push({
        url: candidateUrl,
        rawUrl: baseUrl,
        source: candidate
      });
    }

    return normalizedPredictions;
  }

  _checkUrlCache(candidateUrl, queries, options, summary, stores, attemptStartedAt) {
    const latestFetch = queries.getLatestFetch(candidateUrl);
    const ageMs = computeAgeMs(latestFetch, options.nowMs);

    if (latestFetch && latestFetch.http_status >= 200 && latestFetch.http_status < 300 && ageMs < options.maxAgeMs) {
      summary.cached += 1;
      stores.candidates?.markStatus?.({
        domain: options.normalizedDomain.host,
        candidateUrl,
        status: 'cached-ok',
        validationStatus: 'cache-hit',
        lastSeenAt: attemptStartedAt
      });
      return { cached: true };
    }

    if (latestFetch && latestFetch.http_status === 404 && ageMs < options.refresh404Ms) {
      summary.skipped += 1;
      stores.candidates?.markStatus?.({
        domain: options.normalizedDomain.host,
        candidateUrl,
        status: 'cached-404',
        validationStatus: 'known-404',
        lastSeenAt: attemptStartedAt
      });
      return { cached: true };
    }

    if (latestFetch && latestFetch.http_status >= 400 && latestFetch.http_status < 500 &&
      latestFetch.http_status !== 404 && ageMs < options.retry4xxMs) {
      summary.skippedRecent4xx += 1;
      stores.candidates?.markStatus?.({
        domain: options.normalizedDomain.host,
        candidateUrl,
        status: 'cached-4xx',
        validationStatus: 'recent-4xx',
        lastSeenAt: attemptStartedAt
      });
      return { cached: true };
    }

    return { cached: false };
  }

  _persistValidatedHub(params) {
    const { candidateUrl, place, result, validationResult, candidateSignals, normalizedDomain, queries, summary, pageTitle } = params;

    const existingHub = queries.getPlaceHub?.(normalizedDomain.host, candidateUrl);
    const snapshot = {
      url: candidateUrl,
      domain: normalizedDomain.host,
      placeSlug: slugify(place.name),
      placeKind: place.kind,
      title: pageTitle || extractTitle(result.body),
      navLinksCount: validationResult.navLinkCount || 0,
      articleLinksCount: validationResult.articleLinkCount || 0,
      evidence: JSON.stringify(candidateSignals)
    };

    if (!existingHub) {
      queries.insertPlaceHub?.(snapshot);
      summary.insertedHubs += 1;
      summary.diffPreview.inserted.push({
        url: candidateUrl,
        placeKind: place.kind,
        placeName: place.name,
        status: 'validated'
      });
    } else {
      const changes = collectHubChanges(existingHub, snapshot);
      if (changes.length > 0) {
        queries.updatePlaceHub?.(snapshot);
        summary.updatedHubs += 1;
        summary.diffPreview.updated.push({
          url: candidateUrl,
          placeKind: place.kind,
          placeName: place.name,
          changes
        });
      }
    }
  }

  _persistValidatedTopicHub(params) {
    const { candidateUrl, topic, result, validationResult, candidateSignals, normalizedDomain, queries, summary, pageTitle } = params;

    const existingHub = queries.getTopicHub?.(normalizedDomain.host, candidateUrl);
    const snapshot = {
      url: candidateUrl,
      domain: normalizedDomain.host,
      topicSlug: topic.slug,
      topicLabel: topic.label,
      title: pageTitle || extractTitle(result.body),
      navLinksCount: validationResult.navLinkCount || 0,
      articleLinksCount: validationResult.articleLinkCount || 0,
      evidence: JSON.stringify(candidateSignals)
    };

    if (!existingHub) {
      queries.insertTopicHub?.(snapshot);
      summary.insertedHubs += 1;
      summary.diffPreview.inserted.push({
        url: candidateUrl,
        topicSlug: topic.slug,
        topicLabel: topic.label,
        status: 'validated'
      });
    } else {
      const changes = collectHubChanges(existingHub, snapshot);
      if (changes.length > 0) {
        queries.updateTopicHub?.(snapshot);
        summary.updatedHubs += 1;
        summary.diffPreview.updated.push({
          url: candidateUrl,
          topicSlug: topic.slug,
          topicLabel: topic.label,
          changes
        });
      }
    }
  }

  _persistValidatedCombinationHub(params) {
    const { candidateUrl, place, topic, result, detectionResult, candidateSignals, normalizedDomain, queries, summary } = params;

    const existingHub = queries.getPlaceHub(normalizedDomain.host, candidateUrl);
    const snapshot = {
      url: candidateUrl,
      domain: normalizedDomain.host,
      placeSlug: detectionResult.placeSlug,
      placeKind: detectionResult.placeKind,
      placeLabel: detectionResult.placeLabel,
      placeSource: detectionResult.placeSource,
      placeId: detectionResult.placeId,
      placeCountry: detectionResult.placeCountry,
      topicSlug: detectionResult.topic.slug,
      topicLabel: detectionResult.topic.label,
      topicKind: detectionResult.topic.kind,
      topicSource: detectionResult.topic.source,
      topicConfidence: detectionResult.topic.confidence,
      title: detectionResult.title || extractTitle(result.body),
      navLinksCount: detectionResult.navLinksCount || 0,
      articleLinksCount: detectionResult.articleLinksCount || 0,
      evidence: JSON.stringify(candidateSignals)
    };

    if (!existingHub) {
      queries.insertPlaceHub(snapshot);
      summary.insertedHubs += 1;
      summary.diffPreview.inserted.push({
        url: candidateUrl,
        placeKind: place.kind,
        placeName: place.name,
        topicSlug: topic.slug,
        topicLabel: topic.label,
        status: 'validated'
      });
    } else {
      const changes = collectHubChanges(existingHub, snapshot);
      if (changes.length > 0) {
        queries.updatePlaceHub(snapshot);
        summary.updatedHubs += 1;
        summary.diffPreview.updated.push({
          url: candidateUrl,
          placeKind: place.kind,
          placeName: place.name,
          topicSlug: topic.slug,
          topicLabel: topic.label,
          changes
        });
      }
    }
  }

  async _performHeadProbe(params) {
    const {
      candidateUrl,
      normalizedDomain,
      deps,
      attemptId,
      attemptStartedAt,
      summary,
      recordFetch,
      recordDecision,
      stores
    } = params;

    let headResult = null;
    try {
      headResult = await fetchUrl(candidateUrl, deps.fetchFn, {
        logger: deps.logger,
        timeoutMs: 10000,
        method: 'HEAD'
      });

      recordDecision({
        stage: 'HEAD',
        status: headResult.status,
        outcome: headResult.status >= 200 && headResult.status < 300 ? 'probe-ok' : headResult.status,
        level: 'info',
        message: `HEAD ${headResult.status} ${candidateUrl}`
      });
    } catch (headError) {
      recordDecision({
        stage: 'HEAD',
        status: null,
        outcome: 'head-failed',
        level: 'warn',
        message: `HEAD failed for ${candidateUrl}: ${headError.message || headError}`
      });
      return { shouldProceed: true, rateLimitTriggered: false, status: null, notFound: false };
    }

    if (!headResult) {
      return { shouldProceed: true, rateLimitTriggered: false, status: null, notFound: false };
    }

    let headRecorded = false;
    const recordHeadFetch = () => {
      if (headRecorded) return;
      recordFetch(createFetchRow(headResult, normalizedDomain.host), {
        stage: 'HEAD',
        attemptId,
        cacheHit: false
      });
      headRecorded = true;
    };

    if (headResult.status === 429) {
      summary.rateLimited += 1;
      stores.candidates?.markStatus?.({
        domain: normalizedDomain.host,
        candidateUrl,
        status: 'rate-limited',
        validationStatus: 'http-429',
        lastSeenAt: attemptStartedAt
      });
      recordHeadFetch();
      recordDecision({
        stage: 'HEAD',
        status: 429,
        outcome: 'rate-limited',
        level: 'warn',
        message: `HEAD 429 rate limit for ${candidateUrl} (halting)`
      });
      return { shouldProceed: false, rateLimitTriggered: true, status: 429, notFound: false };
    }

    if (headResult.status === 404 || headResult.status === 410) {
      summary.stored404 += 1;
      stores.candidates?.markStatus?.({
        domain: normalizedDomain.host,
        candidateUrl,
        status: 'fetched-404',
        validationStatus: `head-${headResult.status}`,
        lastSeenAt: attemptStartedAt
      });
      recordHeadFetch();
      recordDecision({
        stage: 'HEAD',
        status: headResult.status,
        outcome: 'cached-miss',
        level: 'info',
        message: `HEAD ${headResult.status} ${candidateUrl} -> cached`
      });
      return { shouldProceed: false, rateLimitTriggered: false, status: headResult.status, notFound: true };
    }

    if (headResult.status === 405) {
      recordHeadFetch();
      recordDecision({
        stage: 'HEAD',
        status: 405,
        outcome: 'fallback-get',
        level: 'info',
        message: `HEAD 405 ${candidateUrl} -> retry with GET`
      });
      return { shouldProceed: true, rateLimitTriggered: false, status: 405, notFound: false };
    }

    if (headResult.status >= 400 && headResult.status < 500) {
      recordHeadFetch();
      recordDecision({
        stage: 'HEAD',
        status: headResult.status,
        outcome: 'retry-get',
        level: 'info',
        message: `HEAD ${headResult.status} ${candidateUrl} -> retry with GET`
      });
      return { shouldProceed: true, rateLimitTriggered: false, status: headResult.status, notFound: false };
    }

    recordHeadFetch();
    return { shouldProceed: true, rateLimitTriggered: false, status: headResult.status, notFound: false };
  }

  _recordFinalDetermination(queries, domain, processingResult, summary) {
    const determination = processingResult.rateLimitTriggered ? 'rate-limited' : 'processed';
    const reason = processingResult.rateLimitTriggered
      ? 'Processing aborted due to rate limiting'
      : `Processed ${summary.totalPlaces} places${summary.totalTopics ? `, ${summary.totalTopics} topics` : ''}${summary.totalCombinations ? `, ${summary.totalCombinations} combinations` : ''}, ${summary.insertedHubs} hubs inserted, ${summary.updatedHubs} updated`;

    queries.recordDomainDetermination({
      domain,
      determination,
      reason,
      details: {
        totalPlaces: summary.totalPlaces,
        totalTopics: summary.totalTopics || 0,
        totalCombinations: summary.totalCombinations || 0,
        totalUrls: summary.totalUrls,
        fetched: summary.fetched,
        cached: summary.cached,
        validationSucceeded: summary.validationSucceeded,
        validationFailed: summary.validationFailed,
        insertedHubs: summary.insertedHubs,
        updatedHubs: summary.updatedHubs
      }
    });
  }

  _recordFetch(fetchRow, meta, newsDb, queries, stores, verbose, logger) {
    if (!fetchRow) return null;
    const tags = {
      stage: meta.stage || 'GET',
      attemptId: meta.attemptId || null,
      cacheHit: Boolean(meta.cacheHit)
    };
    if (stores.fetchRecorder && typeof stores.fetchRecorder.record === 'function') {
      try {
        return stores.fetchRecorder.record(fetchRow, tags);
      } catch (error) {
        if (verbose) {
          logger?.warn?.(`[DomainProcessor] Failed to record fetch: ${error.message}`);
        }
      }
    }

    // Fallback path if fetchRecorder unavailable
    try {
      newsDb.insertFetch(fetchRow);
    } catch (_) {
      /* ignore normalized insert errors */
    }
    try {
      queries.insertLegacyFetch(fetchRow);
    } catch (legacyError) {
      if (verbose) {
        const message = legacyError?.message || String(legacyError);
        logger?.warn?.(`[orchestration] Failed to record legacy fetch for ${fetchRow.url}: ${message}`);
      }
    }
    return null;
  }

  _recordDecision(decision, summary, logger) {
    summary.decisions.push(decision);
    const level = decision.level || 'info';
    const loggerFn = logger?.[level];
    if (typeof loggerFn === 'function' && decision.message) {
      loggerFn(`[orchestration] ${decision.message}`);
    }
  }

  _analyzeHtmlForLinks(html) {
    if (!html) {
      return { navLinksCount: 0, articleLinksCount: 0 };
    }
    const linkMatches = String(html).match(/<a\b[^>]*>/gi) || [];
    return {
      navLinksCount: linkMatches.length,
      articleLinksCount: linkMatches.length
    };
  }
}

module.exports = { DomainProcessor };
