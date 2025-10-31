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

const { slugify } = require('../tools/slugify');
const { getDsplForDomain } = require('../services/shared/dspl');
const { PlacePlaceHubGapAnalyzer } = require('../services/PlacePlaceHubGapAnalyzer');

// Import extracted utilities
const { normalizeDomain, applyScheme, extractTitle } = require('./utils/domainUtils');
const { computeAgeMs, extractPredictionSignals, composeCandidateSignals, createFetchRow } = require('./utils/dataUtils');
const { summarizeDsplPatterns, assessDomainReadiness, selectPlaces, selectTopics, collectHubChanges } = require('./utils/analysisUtils');
const { createBatchSummary, aggregateSummaryInto, createFailedDomainSummary } = require('./utils/summaryUtils');
const { fetchUrl } = require('./utils/httpUtils');

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DECISION_HISTORY = 500;

/**
 * Orchestration Error class
 */
class OrchestrationError extends Error {
  constructor(message, { code, details, originalError } = {}) {
    super(message);
    this.name = 'OrchestrationError';
    this.code = code || 'ORCHESTRATION_ERROR';
    this.details = details || null;
    this.originalError = originalError || null;
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
    now = () => new Date()
  } = deps;

  // Options extraction
  const normalizedDomain = normalizeDomain(options.domain, options.scheme);
  if (!normalizedDomain) {
    throw new OrchestrationError('Domain is required', {
      code: 'INVALID_INPUT',
      details: { domain: options.domain }
    });
  }

  const kinds = Array.isArray(options.kinds) ? [...options.kinds] : ['country'];
  const enableTopicDiscovery = Boolean(options.enableTopicDiscovery);
  const enableCombinationDiscovery = Boolean(options.enableCombinationDiscovery);
  const enableHierarchicalDiscovery = Boolean(options.enableHierarchicalDiscovery);
  const topics = Array.isArray(options.topics) ? [...options.topics] : [];
  const apply = Boolean(options.apply);
  const patternLimit = Math.max(1, Number(options.patternsPerPlace) || 3);
  const maxAgeMs = Number.isFinite(options.maxAgeDays) ? options.maxAgeDays * DAY_MS : 7 * DAY_MS;
  const refresh404Ms = Number.isFinite(options.refresh404Days) ? options.refresh404Days * DAY_MS : 180 * DAY_MS;
  const retry4xxMs = Number.isFinite(options.retry4xxDays) ? options.retry4xxDays * DAY_MS : 7 * DAY_MS;
  const runId = options.runId || `run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const nowMs = now().getTime();
  const runStartedMs = Date.now();
  const runStartedAt = new Date(runStartedMs);

  // Initialize summary
  const summary = {
    domain: normalizedDomain.host,
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
    startedAt: runStartedAt.toISOString(),
    completedAt: null,
    durationMs: null
  };

  const finalizeSummary = () => {
    if (!summary.completedAt) {
      summary.completedAt = new Date().toISOString();
    }
    if (!Number.isFinite(summary.durationMs)) {
      summary.durationMs = Math.max(0, Date.now() - runStartedMs);
    }
    return summary;
  };

  let attemptCounter = 0;

  const recordFetch = (fetchRow, meta = {}) => {
    if (!fetchRow) return null;
    const tags = {
      stage: meta.stage || 'GET',
      attemptId: meta.attemptId || null,
      cacheHit: Boolean(meta.cacheHit)
    };
    if (stores.fetchRecorder && typeof stores.fetchRecorder.record === 'function') {
      return stores.fetchRecorder.record(fetchRow, tags);
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
      if (options.verbose) {
        const message = legacyError?.message || String(legacyError);
        logger?.warn?.(`[orchestration] Failed to record legacy fetch for ${fetchRow.url}: ${message}`);
      }
    }
    return null;
  };

  const recordDecision = ({ level = 'info', message, ...rest }) => {
    summary.decisions.push({ level, message, ...rest });
    const loggerFn = logger?.[level];
    if (typeof loggerFn === 'function' && message) {
      loggerFn(`[orchestration] ${message}`);
    }
  };

  try {
    // Get readiness metrics
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
      latestDetermination
    });

    summary.readiness = readiness;
    summary.latestDetermination = latestDetermination || null;
    summary.recommendations = Array.isArray(readiness.recommendations)
      ? [...readiness.recommendations]
      : [];
    summary.readinessProbe = {
      timedOut: Boolean(metrics?.timedOut),
      elapsedMs: Number.isFinite(metrics?.elapsedMs) ? metrics.elapsedMs : null,
      completedMetrics: Array.isArray(metrics?.completedMetrics) ? [...metrics.completedMetrics] : [],
      skippedMetrics: Array.isArray(metrics?.skippedMetrics) ? [...metrics.skippedMetrics] : []
    };

    if (summary.readinessProbe.timedOut) {
      summary.readinessTimedOut = 1;
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

    // Handle insufficient data
    if (readiness.status === 'insufficient-data') {
      recordDecision({
        stage: 'READINESS',
        status: null,
        outcome: 'insufficient-data',
        level: 'warn',
        message: readiness.reason
      });
      
      for (const recommendation of readiness.recommendations) {
        recordDecision({
          stage: 'READINESS',
          status: null,
          outcome: 'recommendation',
          level: 'info',
          message: recommendation
        });
      }

      if (!latestDetermination || latestDetermination.determination !== 'insufficient-data') {
        const recorded = queries.recordDomainDetermination({
          domain: normalizedDomain.host,
          determination: 'insufficient-data',
          reason: readiness.reason,
          details: {
            metrics: readiness.metrics,
            dspl: readiness.dspl,
            recommendations: readiness.recommendations,
            kinds: readiness.kindsRequested
          }
        });
        
        if (recorded > 0) {
          summary.latestDetermination = queries.getLatestDomainDetermination(normalizedDomain.host) || latestDetermination;
        }
      }

      summary.determination = 'insufficient-data';
      summary.determinationReason = readiness.reason;
      summary.recommendations = Array.from(new Set(summary.recommendations));
      return finalizeSummary();
    }

    if (readiness.status === 'data-limited') {
      recordDecision({
        stage: 'READINESS',
        status: null,
        outcome: 'data-limited',
        level: 'warn',
        message: readiness.reason
      });
    }

    for (const recommendation of readiness.recommendations) {
      recordDecision({
        stage: 'READINESS',
        status: null,
        outcome: 'recommendation',
        level: readiness.status === 'data-limited' ? 'warn' : 'info',
        message: recommendation
      });
    }

    // Select places
    const { places, unsupported } = selectPlaces({
      countryAnalyzer: analyzers.country,
      regionAnalyzer: analyzers.region,
      cityAnalyzer: analyzers.city
    }, kinds, options.limit);

    summary.unsupportedKinds = unsupported;
    summary.totalPlaces = places.length;

    // Select topics if enabled
    let topics = [];
    if (enableTopicDiscovery) {
      const { topics: selectedTopics, unsupported: unsupportedTopics } = selectTopics({
        topicAnalyzer: analyzers.topic
      }, topics, options.limit);

      summary.unsupportedTopics = unsupportedTopics;
      summary.totalTopics = selectedTopics.length;
      topics = selectedTopics;
    }

    if (!places.length && !topics.length) {
      return finalizeSummary();
    }

    const processedPlaceKeys = new Set();
    let rateLimitTriggered = false;

    // Process each place
    for (const place of places) {
      if (rateLimitTriggered) {
        break;
      }

      const slug = slugify(place.name);
      const placeKey = `${place.kind}:${slug}`;
      
      if (processedPlaceKeys.has(placeKey)) {
        summary.skippedDuplicatePlace += 1;
        continue;
      }
      processedPlaceKeys.add(placeKey);

      const patternSource = `${place.kind}-patterns`;
      let predictions = [];

      // Get predictions from appropriate analyzer
      if (enableHierarchicalDiscovery && place.kind === 'country') {
        // Use hierarchical analyzer for place-place hub discovery
        const hierarchicalAnalyzer = new PlacePlaceHubGapAnalyzer({
          db,
          queries,
          logger
        });
        predictions = hierarchicalAnalyzer.predictPlacePlaceHubUrls(normalizedDomain.host, place.name, place.code);
      } else if (place.kind === 'country') {
        predictions = analyzers.country.predictCountryHubUrls(normalizedDomain.host, place.name, place.code);
      } else if (place.kind === 'region') {
        predictions = analyzers.region.predictRegionHubUrls(normalizedDomain.host, place);
      } else if (place.kind === 'city') {
        predictions = analyzers.city.predictCityHubUrls(normalizedDomain.host, place);
      }

      // Normalize and deduplicate predictions
      const normalizedPredictions = [];
      const seenCandidates = new Set();

      for (const candidate of Array.isArray(predictions) ? predictions : []) {
        const baseUrl = typeof candidate === 'string' ? candidate : candidate?.url;
        if (typeof baseUrl !== 'string' || baseUrl.trim() === '') continue;
        
        const candidateUrl = applyScheme(baseUrl, normalizedDomain.scheme);
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

      if (!normalizedPredictions.length) {
        continue;
      }

      // Process each candidate URL
      for (const { url: candidateUrl, source: predictionSource } of normalizedPredictions.slice(0, patternLimit)) {
        if (rateLimitTriggered) {
          break;
        }
        
        summary.totalUrls += 1;

        const attemptId = `${placeKey}:${++attemptCounter}`;
        const attemptStartedAt = new Date().toISOString();
        
        const placeSignalsInfo = {
          kind: place.kind,
          name: place.name,
          code: place.code || place.countryCode || null
        };
        
        const analyzerName = typeof predictionSource === 'object' && predictionSource
          ? (predictionSource.analyzer || predictionSource.source || place.kind)
          : place.kind;
        const strategyValue = typeof predictionSource === 'object' && predictionSource
          ? (predictionSource.strategy || patternSource)
          : patternSource;
        const scoreValue = typeof predictionSource === 'object' ? predictionSource.score : null;
        const confidenceValue = typeof predictionSource === 'object' ? predictionSource.confidence : null;
        const patternValue = typeof predictionSource === 'object' ? predictionSource.pattern : null;
        
        const candidateSignals = composeCandidateSignals({
          predictionSource,
          patternSource,
          place: placeSignalsInfo,
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
              placeCode: placeSignalsInfo.code,
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
              logger?.warn?.(`[orchestration] Failed to save candidate ${candidateUrl}: ${storeError?.message || storeError}`);
            }
          }
        }

        // Check cache
        const latestFetch = queries.getLatestFetch(candidateUrl);
        const ageMs = computeAgeMs(latestFetch, nowMs);

        if (latestFetch && latestFetch.http_status >= 200 && latestFetch.http_status < 300 && ageMs < maxAgeMs) {
          summary.cached += 1;
          stores.candidates?.markStatus?.({
            domain: normalizedDomain.host,
            candidateUrl,
            status: 'cached-ok',
            validationStatus: 'cache-hit',
            lastSeenAt: attemptStartedAt
          });
          continue;
        }

        if (latestFetch && latestFetch.http_status === 404 && ageMs < refresh404Ms) {
          summary.skipped += 1;
          stores.candidates?.markStatus?.({
            domain: normalizedDomain.host,
            candidateUrl,
            status: 'cached-404',
            validationStatus: 'known-404',
            lastSeenAt: attemptStartedAt
          });
          continue;
        }

        if (latestFetch && latestFetch.http_status >= 400 && latestFetch.http_status < 500 && 
            latestFetch.http_status !== 404 && ageMs < retry4xxMs) {
          summary.skippedRecent4xx += 1;
          stores.candidates?.markStatus?.({
            domain: normalizedDomain.host,
            candidateUrl,
            status: 'cached-4xx',
            validationStatus: 'recent-4xx',
            lastSeenAt: attemptStartedAt
          });
          continue;
        }

        // Fetch URL
        let result;
        try {
          result = await fetchUrl(candidateUrl, fetchFn, { logger, timeoutMs: 15000 });
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
            continue;
          }

          if (result.status === 429) {
            summary.rateLimited += 1;
            rateLimitTriggered = true;
            recordDecision({
              stage: 'FETCH',
              status: 429,
              outcome: 'rate-limited',
              level: 'warn',
              message: `Rate limited on ${candidateUrl}; aborting further fetches.`
            });
            break;
          }

          if (!result.ok) {
            summary.errors += 1;
            continue;
          }

          // Validate hub
          const validationResult = enableHierarchicalDiscovery && place.kind === 'country'
            ? validator.validatePlacePlaceHub(result.body, {
                expectedPlace: place,
                domain: normalizedDomain.host
              })
            : validator.validatePlaceHub(result.body, {
                expectedPlace: place,
                domain: normalizedDomain.host
              });

          const validationSignals = composeCandidateSignals({
            predictionSource,
            patternSource,
            place: placeSignalsInfo,
            attemptId,
            validationMetrics: validationResult
          });

          stores.candidates?.updateValidation?.({
            domain: normalizedDomain.host,
            candidateUrl,
            validationStatus: validationResult.isValid ? 'validated' : 'validation-failed',
            validationScore: validationResult.confidence || null,
            validationDetails: validationResult,
            signals: validationSignals,
            lastSeenAt: attemptStartedAt
          });

          if (validationResult.isValid) {
            summary.validationSucceeded += 1;

            if (apply) {
              // Check for existing hub
              const existingHub = queries.getPlaceHub(normalizedDomain.host, candidateUrl);
              const snapshot = {
                url: candidateUrl,
                domain: normalizedDomain.host,
                placeSlug: slug,
                placeKind: place.kind,
                title: extractTitle(result.body),
                navLinksCount: validationResult.navLinkCount || 0,
                articleLinksCount: validationResult.articleLinkCount || 0,
                evidence: JSON.stringify(candidateSignals)
              };

              if (!existingHub) {
                queries.insertPlaceHub(snapshot);
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
                  queries.updatePlaceHub(snapshot);
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
          } else {
            summary.validationFailed += 1;
            const failureReason = validationResult.reason || 'unknown';
            summary.validationFailureReasons[failureReason] =
              (summary.validationFailureReasons[failureReason] || 0) + 1;
          }

          // Record audit entry for validation result
          try {
            queries.recordAuditEntry({
              domain: normalizedDomain.host,
              url: candidateUrl,
              placeKind: place.kind,
              placeName: place.name,
              decision: validationResult.isValid ? 'accepted' : 'rejected',
              validationMetricsJson: JSON.stringify(validationResult),
              attemptId,
              runId
            });
          } catch (auditError) {
            if (options.verbose) {
              logger?.warn?.(`[orchestration] Failed to record audit entry for ${candidateUrl}: ${auditError?.message || auditError}`);
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
      }
    }

    // Process each topic if enabled
    if (enableTopicDiscovery && topics.length > 0) {
      const processedTopicKeys = new Set();

      for (const topic of topics) {
        if (rateLimitTriggered) {
          break;
        }

        const topicKey = `topic:${topic.slug}`;

        if (processedTopicKeys.has(topicKey)) {
          summary.skippedDuplicateTopic += 1;
          continue;
        }
        processedTopicKeys.add(topicKey);

        const patternSource = 'topic-patterns';
        const predictions = analyzers.topic.predictTopicHubUrls(normalizedDomain.host, topic.slug, topic.label);

        // Normalize and deduplicate predictions
        const normalizedPredictions = [];
        const seenCandidates = new Set();

        for (const candidate of Array.isArray(predictions) ? predictions : []) {
          const baseUrl = typeof candidate === 'string' ? candidate : candidate?.url;
          if (typeof baseUrl !== 'string' || baseUrl.trim() === '') continue;

          const candidateUrl = applyScheme(baseUrl, normalizedDomain.scheme);
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

        if (!normalizedPredictions.length) {
          continue;
        }

        // Process each candidate URL
        for (const { url: candidateUrl, source: predictionSource } of normalizedPredictions.slice(0, patternLimit)) {
          if (rateLimitTriggered) {
            break;
          }

          summary.totalUrls += 1;

          const attemptId = `${topicKey}:${++attemptCounter}`;
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
            ? (predictionSource.strategy || patternSource)
            : patternSource;
          const scoreValue = typeof predictionSource === 'object' ? predictionSource.score : null;
          const confidenceValue = typeof predictionSource === 'object' ? predictionSource.confidence : null;
          const patternValue = typeof predictionSource === 'object' ? predictionSource.pattern : null;

          const candidateSignals = composeCandidateSignals({
            predictionSource,
            patternSource,
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
                logger?.warn?.(`[orchestration] Failed to save candidate ${candidateUrl}: ${storeError?.message || storeError}`);
              }
            }
          }

          // Check cache
          const latestFetch = queries.getLatestFetch(candidateUrl);
          const ageMs = computeAgeMs(latestFetch, nowMs);

          if (latestFetch && latestFetch.http_status >= 200 && latestFetch.http_status < 300 && ageMs < maxAgeMs) {
            summary.cached += 1;
            stores.candidates?.markStatus?.({
              domain: normalizedDomain.host,
              candidateUrl,
              status: 'cached-ok',
              validationStatus: 'cache-hit',
              lastSeenAt: attemptStartedAt
            });
            continue;
          }

          if (latestFetch && latestFetch.http_status === 404 && ageMs < refresh404Ms) {
            summary.skipped += 1;
            stores.candidates?.markStatus?.({
              domain: normalizedDomain.host,
              candidateUrl,
              status: 'cached-404',
              validationStatus: 'known-404',
              lastSeenAt: attemptStartedAt
            });
            continue;
          }

          if (latestFetch && latestFetch.http_status >= 400 && latestFetch.http_status < 500 &&
              latestFetch.http_status !== 404 && ageMs < retry4xxMs) {
            summary.skippedRecent4xx += 1;
            stores.candidates?.markStatus?.({
              domain: normalizedDomain.host,
              candidateUrl,
              status: 'cached-4xx',
              validationStatus: 'recent-4xx',
              lastSeenAt: attemptStartedAt
            });
            continue;
          }

          // Fetch URL
          let result;
          try {
            result = await fetchUrl(candidateUrl, fetchFn, { logger, timeoutMs: 15000 });
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
              continue;
            }

            if (result.status === 429) {
              summary.rateLimited += 1;
              rateLimitTriggered = true;
              recordDecision({
                stage: 'FETCH',
                status: 429,
                outcome: 'rate-limited',
                level: 'warn',
                message: `Rate limited on ${candidateUrl}; aborting further fetches.`
              });
              break;
            }

            if (!result.ok) {
              summary.errors += 1;
              continue;
            }

            // Validate topic hub
            const validationResult = validator.validateTopicHub(result.body, {
              expectedTopic: topic,
              domain: normalizedDomain.host
            });

            const validationSignals = composeCandidateSignals({
              predictionSource,
              patternSource,
              topic: topicSignalsInfo,
              attemptId,
              validationMetrics: validationResult
            });

            stores.candidates?.updateValidation?.({
              domain: normalizedDomain.host,
              candidateUrl,
              validationStatus: validationResult.isValid ? 'validated' : 'validation-failed',
              validationScore: validationResult.confidence || null,
              validationDetails: validationResult,
              signals: validationSignals,
              lastSeenAt: attemptStartedAt
            });

            if (validationResult.isValid) {
              summary.validationSucceeded += 1;

              if (apply) {
                // Check for existing hub
                const existingHub = queries.getTopicHub(normalizedDomain.host, candidateUrl);
                const snapshot = {
                  url: candidateUrl,
                  domain: normalizedDomain.host,
                  topicSlug: topic.slug,
                  topicLabel: topic.label,
                  title: extractTitle(result.body),
                  navLinksCount: validationResult.navLinkCount || 0,
                  articleLinksCount: validationResult.articleLinkCount || 0,
                  evidence: JSON.stringify(candidateSignals)
                };

                if (!existingHub) {
                  queries.insertTopicHub(snapshot);
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
                    queries.updateTopicHub(snapshot);
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
            } else {
              summary.validationFailed += 1;
              const failureReason = validationResult.reason || 'unknown';
              summary.validationFailureReasons[failureReason] =
                (summary.validationFailureReasons[failureReason] || 0) + 1;
            }

            // Record audit entry for topic validation result
            try {
              queries.recordAuditEntry({
                domain: normalizedDomain.host,
                url: candidateUrl,
                placeKind: 'topic',
                placeName: topic.label,
                decision: validationResult.isValid ? 'accepted' : 'rejected',
                validationMetricsJson: JSON.stringify(validationResult),
                attemptId,
                runId
              });
            } catch (auditError) {
              if (options.verbose) {
                logger?.warn?.(`[orchestration] Failed to record audit entry for ${candidateUrl}: ${auditError?.message || auditError}`);
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
        }
      }
    }

    // Process place-topic combinations if enabled
    if (enableCombinationDiscovery && analyzers.placeTopic && places.length > 0 && topics.length > 0) {
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

          const patternSource = 'place-topic-patterns';
          const predictions = analyzers.placeTopic.predictCombinationUrls(normalizedDomain.host, place, topic);

          // Normalize and deduplicate predictions
          const normalizedPredictions = [];
          const seenCandidates = new Set();

          for (const candidate of Array.isArray(predictions) ? predictions : []) {
            const baseUrl = typeof candidate === 'string' ? candidate : candidate?.url;
            if (typeof baseUrl !== 'string' || baseUrl.trim() === '') continue;

            const candidateUrl = applyScheme(baseUrl, normalizedDomain.scheme);
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

          if (!normalizedPredictions.length) {
            continue;
          }

          // Process each candidate URL
          for (const { url: candidateUrl, source: predictionSource } of normalizedPredictions.slice(0, patternLimit)) {
            if (rateLimitTriggered) {
              break;
            }

            summary.totalUrls += 1;

            const attemptId = `${combinationKey}:${++attemptCounter}`;
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
              ? (predictionSource.strategy || patternSource)
              : patternSource;
            const scoreValue = typeof predictionSource === 'object' ? predictionSource.score : null;
            const confidenceValue = typeof predictionSource === 'object' ? predictionSource.confidence : null;
            const patternValue = typeof predictionSource === 'object' ? predictionSource.pattern : null;

            const candidateSignals = composeCandidateSignals({
              predictionSource,
              patternSource,
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
                  logger?.warn?.(`[orchestration] Failed to save candidate ${candidateUrl}: ${storeError?.message || storeError}`);
                }
              }
            }

            // Check cache
            const latestFetch = queries.getLatestFetch(candidateUrl);
            const ageMs = computeAgeMs(latestFetch, nowMs);

            if (latestFetch && latestFetch.http_status >= 200 && latestFetch.http_status < 300 && ageMs < maxAgeMs) {
              summary.cached += 1;
              stores.candidates?.markStatus?.({
                domain: normalizedDomain.host,
                candidateUrl,
                status: 'cached-ok',
                validationStatus: 'cache-hit',
                lastSeenAt: attemptStartedAt
              });
              continue;
            }

            if (latestFetch && latestFetch.http_status === 404 && ageMs < refresh404Ms) {
              summary.skipped += 1;
              stores.candidates?.markStatus?.({
                domain: normalizedDomain.host,
                candidateUrl,
                status: 'cached-404',
                validationStatus: 'known-404',
                lastSeenAt: attemptStartedAt
              });
              continue;
            }

            if (latestFetch && latestFetch.http_status >= 400 && latestFetch.http_status < 500 &&
                latestFetch.http_status !== 404 && ageMs < retry4xxMs) {
              summary.skippedRecent4xx += 1;
              stores.candidates?.markStatus?.({
                domain: normalizedDomain.host,
                candidateUrl,
                status: 'cached-4xx',
                validationStatus: 'recent-4xx',
                lastSeenAt: attemptStartedAt
              });
              continue;
            }

            // Fetch URL
            let result;
            try {
              result = await fetchUrl(candidateUrl, fetchFn, { logger, timeoutMs: 15000 });
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
                continue;
              }

              if (result.status === 429) {
                summary.rateLimited += 1;
                rateLimitTriggered = true;
                recordDecision({
                  stage: 'FETCH',
                  status: 429,
                  outcome: 'rate-limited',
                  level: 'warn',
                  message: `Rate limited on ${candidateUrl}; aborting further fetches.`
                });
                break;
              }

              if (!result.ok) {
                summary.errors += 1;
                continue;
              }

              // Validate combination hub using detectPlaceHub
              const { detectPlaceHub } = require('../tools/placeHubDetector');
              const gazetteerPlaceNames = queries.getGazetteerPlaceNames ? queries.getGazetteerPlaceNames() : null;
              const nonGeoTopicSlugs = queries.getNonGeoTopicSlugs ? queries.getNonGeoTopicSlugs() : null;

              const detectionResult = detectPlaceHub({
                url: candidateUrl,
                title: extractTitle(result.body),
                urlPlaceAnalysis: null, // Could be enhanced to include analysis
                urlPlaces: [],
                analysisPlaces: [],
                section: topic.label, // Use topic as section for detection
                fetchClassification: null,
                latestClassification: null,
                navLinksCount: null, // Could be extracted from body
                articleLinksCount: null,
                wordCount: null,
                articleWordCount: null,
                fetchWordCount: null,
                articleAnalysis: null,
                fetchAnalysis: null,
                gazetteerPlaceNames,
                minNavLinksThreshold: 10,
                nonGeoTopicSlugs,
                db
              });

              const isValidCombination = detectionResult &&
                detectionResult.kind === 'place' &&
                detectionResult.topic &&
                detectionResult.placeSlug === slugify(place.name) &&
                detectionResult.topic.slug === topic.slug;

              const validationSignals = composeCandidateSignals({
                predictionSource,
                patternSource,
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

                if (apply) {
                  // Check for existing hub
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
                    evidence: JSON.stringify(validationSignals)
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
              } else {
                summary.validationFailed += 1;
                const failureReason = isValidCombination === false ? 'detection-failed' : 'unknown';
                summary.validationFailureReasons[failureReason] =
                  (summary.validationFailureReasons[failureReason] || 0) + 1;
              }

              // Record audit entry for combination validation result
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
                  runId
                });
              } catch (auditError) {
                if (options.verbose) {
                  logger?.warn?.(`[orchestration] Failed to record audit entry for ${candidateUrl}: ${auditError?.message || auditError}`);
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
          }
        }
      }
    }

    // Record final determination
    if (apply) {
      const determination = rateLimitTriggered ? 'rate-limited' : 'processed';
      const reason = rateLimitTriggered
        ? 'Processing aborted due to rate limiting'
        : `Processed ${summary.totalPlaces} places${enableTopicDiscovery ? `, ${summary.totalTopics} topics` : ''}${enableCombinationDiscovery ? `, ${summary.totalCombinations} combinations` : ''}, ${summary.insertedHubs} hubs inserted, ${summary.updatedHubs} updated`;
      
      queries.recordDomainDetermination({
        domain: normalizedDomain.host,
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

    summary.determination = 'processed';
    summary.determinationReason = `Processed ${summary.totalPlaces} places${enableTopicDiscovery ? `, ${summary.totalTopics} topics` : ''}${enableCombinationDiscovery ? `, ${summary.totalCombinations} combinations` : ''}`;
    
  } catch (error) {
    summary.errors += 1;
    summary.determination = 'error';
    summary.determinationReason = error.message || String(error);
    
    recordDecision({
      stage: 'ERROR',
      status: null,
      outcome: 'failed',
      level: 'error',
      message: `Domain processing failed: ${error.message || error}`
    });
    
    throw new OrchestrationError(`Failed to process domain ${normalizedDomain.host}`, {
      code: 'PROCESSING_ERROR',
      details: { domain: normalizedDomain.host, summary },
      originalError: error
    });
  }

  return finalizeSummary();
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
  const batchEntries = Array.isArray(options.domainBatch) && options.domainBatch.length
    ? options.domainBatch.map((entry) => ({ ...entry }))
    : [];

  const runStartedAt = new Date().toISOString();
  const runStartedMs = Date.now();

  // Fallback to single domain if no batch
  if (!batchEntries.length && options.domain) {
    const normalized = normalizeDomain(options.domain, options.scheme);
    batchEntries.push({
      raw: options.domain,
      domain: normalized?.host || options.domain,
      scheme: normalized?.scheme || (options.scheme || 'https'),
      base: normalized?.base || `${options.scheme || 'https'}://${options.domain}`,
      kinds: Array.isArray(options.kinds) ? [...options.kinds] : [],
      kindsOverride: null,
      limit: options.limit ?? null,
      limitOverride: null,
      sources: ['legacy']
    });
  }

  if (!batchEntries.length) {
    throw new OrchestrationError('Domain or host is required', {
      code: 'INVALID_INPUT',
      details: { provided: options }
    });
  }

  const multiDomain = batchEntries.length > 1;
  const domainLabel = multiDomain ? 'multiple domains' : batchEntries[0].domain;
  const aggregate = createBatchSummary(domainLabel, batchEntries.length);
  const perDomainSummaries = [];
  const logger = deps && typeof deps === 'object' ? deps.logger : null;

  // Process each domain
  for (let index = 0; index < batchEntries.length; index += 1) {
    const entry = batchEntries[index];
    
    const perDomainOptions = {
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
      readinessTimeoutMs: options.readinessTimeoutMs
    };

    if (logger && typeof logger.info === 'function') {
      logger.info(`[orchestration] Batch processing domain ${entry.domain}`);
    }

    let summary;
    let domainError = null;
    try {
      summary = await guessPlaceHubsForDomain(perDomainOptions, deps);
    } catch (error) {
      domainError = error;
      if (logger && typeof logger.error === 'function') {
        logger.error(`[orchestration] Batch domain ${entry.domain} failed: ${error?.message || error}`);
      }
      summary = createFailedDomainSummary(entry, error);
    }

    perDomainSummaries.push({ entry, summary, index, error: domainError });
    aggregateSummaryInto(aggregate, summary, entry);
    aggregate.batch.processedDomains += 1;
  }

  // Trim decision history if needed
  if (aggregate.decisions.length > MAX_DECISION_HISTORY) {
    const truncated = aggregate.decisions.length - MAX_DECISION_HISTORY;
    aggregate.decisions = aggregate.decisions.slice(-MAX_DECISION_HISTORY);
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

  return {
    aggregate,
    perDomain: perDomainSummaries
  };
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
