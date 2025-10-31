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
 * Normalize domain input to {host, scheme, base}
 */
function normalizeDomain(input, scheme = 'https') {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  
  if (trimmed.includes('://')) {
    const parsed = new URL(trimmed);
    return {
      host: parsed.hostname.toLowerCase(),
      scheme: parsed.protocol.replace(':', ''),
      base: `${parsed.protocol}//${parsed.host}`
    };
  }
  
  const cleanScheme = scheme === 'http' ? 'http' : 'https';
  return {
    host: trimmed.toLowerCase(),
    scheme: cleanScheme,
    base: `${cleanScheme}://${trimmed.toLowerCase()}`
  };
}

/**
 * Apply scheme to URL
 */
function applyScheme(url, targetScheme) {
  if (!url) return url;
  if (!targetScheme || targetScheme === 'https') return url;
  return url.replace(/^https:\/\//i, `${targetScheme}://`);
}

/**
 * Compute age in milliseconds from fetch record
 */
function computeAgeMs(row, nowUtcMs) {
  if (!row) return Number.POSITIVE_INFINITY;
  const ts = row.fetched_at || row.request_started_at;
  if (!ts) return Number.POSITIVE_INFINITY;
  const time = new Date(ts).getTime();
  if (!Number.isFinite(time)) return Number.POSITIVE_INFINITY;
  return nowUtcMs - time;
}

/**
 * Extract title from HTML
 */
function extractTitle(html) {
  if (!html) return null;
  const match = String(html).match(/<title[^>]*>([^<]*)<\/title>/i);
  if (!match) return null;
  return match[1].trim().replace(/\s+/g, ' ').slice(0, 300);
}

/**
 * Extract prediction signals from prediction source object
 */
function extractPredictionSignals(predictionSource) {
  if (!predictionSource) return null;
  if (typeof predictionSource !== 'object') {
    return { value: String(predictionSource) };
  }
  
  const allowedKeys = ['pattern', 'score', 'confidence', 'strategy', 'exampleUrl', 'weight'];
  const extracted = {};
  for (const key of allowedKeys) {
    if (predictionSource[key] != null) {
      extracted[key] = predictionSource[key];
    }
  }
  
  if (Object.keys(extracted).length === 0) {
    return { raw: predictionSource };
  }
  
  return extracted;
}

/**
 * Compose candidate signals for storage
 */
function composeCandidateSignals({ predictionSource, patternSource, place, attemptId, validationMetrics = null }) {
  const signals = {
    patternSource: patternSource || null,
    attempt: attemptId ? { id: attemptId } : null
  };
  
  if (place) {
    signals.place = {
      kind: place.kind || null,
      name: place.name || null,
      code: place.code || place.countryCode || null
    };
  }
  
  const predictionSignals = extractPredictionSignals(predictionSource);
  if (predictionSignals) {
    signals.prediction = predictionSignals;
  }
  
  if (validationMetrics) {
    signals.validation = validationMetrics;
  }
  
  return signals;
}

/**
 * Fetch URL with timeout and metrics
 */
async function fetchUrl(url, fetchFn, { logger, timeoutMs = 15000, method = 'GET' } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    try { controller.abort(); } catch (_) {}
  }, timeoutMs);
  
  const started = Date.now();
  const requestStartedIso = new Date(started).toISOString();
  const requestMethod = typeof method === 'string' && method.trim()
    ? method.trim().toUpperCase()
    : 'GET';

  try {
    const response = await fetchFn(url, {
      signal: controller.signal,
      method: requestMethod,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GuessPlaceHubs/1.0)',
        'Accept': 'text/html,application/xhtml+xml'
      },
      redirect: 'follow'
    });
    
    const finished = Date.now();
    clearTimeout(timeout);
    
    const finalUrl = response.url || url;
    let body = '';
    let bytesDownloaded = 0;
    
    if (requestMethod !== 'HEAD') {
      try {
        body = await response.text();
        bytesDownloaded = Buffer.byteLength(body, 'utf8');
      } catch (err) {
        logger?.warn?.(`[orchestration] Failed to read body for ${finalUrl}: ${err.message || err}`);
      }
    }
    
    const headers = response.headers || { get: () => null };
    const contentType = headers.get ? headers.get('content-type') : null;
    const contentLengthHeader = headers.get ? headers.get('content-length') : null;
    const contentLength = contentLengthHeader != null ? Number(contentLengthHeader) : null;

    return {
      ok: response.ok,
      status: response.status,
      finalUrl,
      body,
      metrics: {
        request_started_at: requestStartedIso,
        fetched_at: new Date(finished).toISOString(),
        bytes_downloaded: bytesDownloaded,
        content_type: contentType || null,
        content_length: Number.isFinite(contentLength) ? contentLength : null,
        total_ms: finished - started,
        download_ms: finished - started
      },
      requestMethod
    };
  } catch (error) {
    clearTimeout(timeout);
    throw Object.assign(new Error(error.message || String(error)), {
      kind: error.name === 'AbortError' ? 'timeout' : 'network',
      cause: error
    });
  }
}

/**
 * Create fetch row for database storage
 */
function createFetchRow(result, fallbackHost) {
  const metrics = result.metrics || {};
  const host = (() => {
    try {
      return new URL(result.finalUrl).hostname.toLowerCase();
    } catch (_) {
      return fallbackHost;
    }
  })();

  const httpStatus = result.status || null;
  const httpSuccess = result.ok;
  const title = httpSuccess && result.body ? extractTitle(result.body) : null;
  const requestMethod = result.requestMethod || 'GET';

  return {
    url: result.finalUrl,
    domain: host,
    http_status: httpStatus,
    http_success: httpSuccess ? 1 : 0,
    title,
    request_method: requestMethod,
    request_started_at: metrics.request_started_at || new Date().toISOString(),
    fetched_at: metrics.fetched_at || new Date().toISOString(),
    bytes_downloaded: metrics.bytes_downloaded || 0,
    content_type: metrics.content_type || null,
    content_length: metrics.content_length || null,
    total_ms: metrics.total_ms || 0,
    download_ms: metrics.download_ms || 0,
    redirect_count: 0,
    cache_hit: 0
  };
}

/**
 * Summarize DSPL patterns for requested kinds
 */
function summarizeDsplPatterns(dsplEntry, requestedKinds) {
  const result = {
    hasDspl: Boolean(dsplEntry),
    verifiedPatternCount: 0,
    requestedKinds: Array.isArray(requestedKinds) ? [...requestedKinds] : [],
    availablePatterns: {}
  };

  if (!dsplEntry) {
    return result;
  }

  const DSPL_KIND_PROPERTY_MAP = {
    country: 'countryHubPatterns',
    region: 'regionHubPatterns',
    city: 'cityHubPatterns'
  };

  for (const kind of result.requestedKinds) {
    const propertyName = DSPL_KIND_PROPERTY_MAP[kind];
    if (!propertyName) continue;

    const patterns = dsplEntry[propertyName];
    if (Array.isArray(patterns) && patterns.length > 0) {
      result.availablePatterns[kind] = patterns.length;
      result.verifiedPatternCount += patterns.length;
    }
  }

  return result;
}

/**
 * Assess domain readiness for hub guessing
 */
function assessDomainReadiness({ domain, kinds, metrics = {}, dsplEntry = null, latestDetermination = null } = {}) {
  const dsplSummary = summarizeDsplPatterns(dsplEntry, kinds);

  const toNumber = (value) => (Number.isFinite(value) ? value : Number(value) || 0);
  const fetchCount = toNumber(metrics.fetchCount);
  const verifiedHubMappingCount = toNumber(metrics.verifiedHubMappingCount);
  const storedHubCount = toNumber(metrics.storedHubCount);
  const candidateCount = toNumber(metrics.candidateCount);
  const metricsTimedOut = Boolean(metrics.timedOut);
  const metricsElapsedMs = Number.isFinite(metrics.elapsedMs) ? metrics.elapsedMs : null;
  const completedMetrics = Array.isArray(metrics.completedMetrics) ? metrics.completedMetrics : [];
  const skippedMetrics = Array.isArray(metrics.skippedMetrics) ? metrics.skippedMetrics : [];

  const hasHistoricalCoverage = verifiedHubMappingCount > 0 || storedHubCount > 0;
  const hasFetchHistory = fetchCount > 0;
  const hasCandidates = candidateCount > 0;
  const hasVerifiedPatterns = dsplSummary.verifiedPatternCount > 0;

  const readiness = {
    domain,
    status: 'ready',
    reason: 'Domain has sufficient signals to attempt hub guessing.',
    metrics: {
      fetchCount,
      verifiedHubMappingCount,
      storedHubCount,
      candidateCount,
      timedOut: metricsTimedOut,
      elapsedMs: metricsElapsedMs,
      completedMetrics,
      skippedMetrics
    },
    dspl: dsplSummary,
    hasHistoricalCoverage,
    hasFetchHistory,
    hasCandidates,
    hasVerifiedPatterns,
    recommendations: [],
    latestDetermination: latestDetermination || null,
    kindsRequested: dsplSummary.requestedKinds
  };

  if (!hasVerifiedPatterns && !hasHistoricalCoverage && !hasFetchHistory && !hasCandidates) {
    readiness.status = 'insufficient-data';
    readiness.reason = 'No DSPL patterns, stored hubs, or crawl history available for this domain. Run crawls before guessing hubs.';
    const crawlCommand = domain ? `Run crawl-place-hubs for ${domain} to collect hub candidates.` : 'Run crawl-place-hubs for this domain to collect hub candidates.';
    readiness.recommendations.push(crawlCommand);
    readiness.recommendations.push('Verify hub pages and export DSPL patterns once coverage data is available.');
  } else if (!hasVerifiedPatterns && !hasHistoricalCoverage) {
    readiness.status = 'data-limited';
    readiness.reason = 'Domain lacks verified DSPL patterns or stored hub mappings; results will rely on fallback heuristics.';
    readiness.recommendations.push('Verify hub URLs for this domain to capture DSPL patterns.');
  }

  if (metricsTimedOut) {
    const timeoutMessage = 'Readiness probes exceeded the configured timeout before completing coverage checks; metrics may be incomplete.';
    if (readiness.status === 'ready') {
      readiness.status = 'data-limited';
      readiness.reason = timeoutMessage;
    } else if (readiness.status !== 'insufficient-data') {
      readiness.recommendations.push(timeoutMessage);
    }
    readiness.recommendations.push('Increase --readiness-timeout or warm the domain by running crawl-place-hubs.');
  }

  // Deduplicate recommendations
  const seenRecommendations = new Set();
  readiness.recommendations = readiness.recommendations
    .filter((item) => typeof item === 'string' && item.trim().length > 0)
    .reduce((acc, item) => {
      if (!seenRecommendations.has(item)) {
        acc.push(item);
        seenRecommendations.add(item);
      }
      return acc;
    }, []);

  return readiness;
}

/**
 * Select places to evaluate based on analyzers and configuration
 */
function selectPlaces({ countryAnalyzer, regionAnalyzer, cityAnalyzer }, requestedKinds, limit) {
  const selected = [];
  const unsupported = [];

  for (const kind of requestedKinds) {
    if (kind === 'country' && countryAnalyzer) {
      const countries = countryAnalyzer.getTopCountries(limit);
      selected.push(...countries);
    } else if (kind === 'region' && regionAnalyzer) {
      const regions = regionAnalyzer.getTopRegions(limit);
      selected.push(...regions);
    } else if (kind === 'city' && cityAnalyzer) {
      const cities = cityAnalyzer.getTopCities(limit);
      selected.push(...cities);
    } else {
      unsupported.push(kind);
    }
  }

  return { places: selected, unsupported };
}

/**
 * Collect hub changes for diff preview
 */
function collectHubChanges(existingHub, nextSnapshot) {
  if (!existingHub || !nextSnapshot) {
    return [];
  }

  const descriptors = [
    { label: 'Place slug', nextKey: 'placeSlug', existingKey: 'place_slug' },
    { label: 'Place kind', nextKey: 'placeKind', existingKey: 'place_kind' },
    { label: 'Title', nextKey: 'title', existingKey: 'title' },
    { label: 'Nav links', nextKey: 'navLinksCount', existingKey: 'nav_links_count' },
    { label: 'Article links', nextKey: 'articleLinksCount', existingKey: 'article_links_count' }
  ];

  const changes = [];
  for (const descriptor of descriptors) {
    const after = nextSnapshot[descriptor.nextKey];
    if (after === undefined || after === null) {
      continue;
    }
    const before = existingHub[descriptor.existingKey];
    const normalizedBefore = before === undefined ? null : before;
    const normalizedAfter = after;
    if (normalizedBefore === normalizedAfter) {
      continue;
    }
    if (typeof normalizedBefore === 'number' && typeof normalizedAfter === 'number' &&
        Number.isFinite(normalizedBefore) && Number.isFinite(normalizedAfter)) {
      if (normalizedBefore === normalizedAfter) {
        continue;
      }
    }
    changes.push({
      field: descriptor.label,
      before: normalizedBefore === undefined ? null : normalizedBefore,
      after: normalizedAfter
    });
  }

  return changes;
}

/**
 * Create batch summary structure
 */
function createBatchSummary(domainLabel, totalDomains) {
  return {
    domain: domainLabel,
    totalPlaces: 0,
    totalUrls: 0,
    fetched: 0,
    cached: 0,
    skipped: 0,
    skippedDuplicatePlace: 0,
    skippedRecent4xx: 0,
    stored404: 0,
    insertedHubs: 0,
    updatedHubs: 0,
    errors: 0,
    rateLimited: 0,
    validationSucceeded: 0,
    validationFailed: 0,
    validationFailureReasons: {},
    readinessTimedOut: 0,
    batch: {
      totalDomains,
      processedDomains: 0,
      truncatedDecisionCount: 0
    },
    decisions: [],
    diffPreview: {
      inserted: [],
      updated: []
    }
  };
}

/**
 * Aggregate domain summary into batch totals
 */
function aggregateSummaryInto(aggregate, domainSummary, entry) {
  aggregate.totalPlaces += domainSummary.totalPlaces || 0;
  aggregate.totalUrls += domainSummary.totalUrls || 0;
  aggregate.fetched += domainSummary.fetched || 0;
  aggregate.cached += domainSummary.cached || 0;
  aggregate.skipped += domainSummary.skipped || 0;
  aggregate.skippedDuplicatePlace += domainSummary.skippedDuplicatePlace || 0;
  aggregate.skippedRecent4xx += domainSummary.skippedRecent4xx || 0;
  aggregate.stored404 += domainSummary.stored404 || 0;
  aggregate.insertedHubs += domainSummary.insertedHubs || 0;
  aggregate.updatedHubs += domainSummary.updatedHubs || 0;
  aggregate.errors += domainSummary.errors || 0;
  aggregate.rateLimited += domainSummary.rateLimited || 0;
  aggregate.validationSucceeded += domainSummary.validationSucceeded || 0;
  aggregate.validationFailed += domainSummary.validationFailed || 0;
  aggregate.readinessTimedOut += domainSummary.readinessTimedOut || 0;

  // Aggregate validation failure reasons
  if (domainSummary.validationFailureReasons) {
    for (const [reason, count] of Object.entries(domainSummary.validationFailureReasons)) {
      aggregate.validationFailureReasons[reason] = (aggregate.validationFailureReasons[reason] || 0) + count;
    }
  }

  // Aggregate decisions
  if (Array.isArray(domainSummary.decisions)) {
    aggregate.decisions.push(...domainSummary.decisions);
  }

  // Aggregate diff preview
  if (domainSummary.diffPreview) {
    if (Array.isArray(domainSummary.diffPreview.inserted)) {
      aggregate.diffPreview.inserted.push(...domainSummary.diffPreview.inserted);
    }
    if (Array.isArray(domainSummary.diffPreview.updated)) {
      aggregate.diffPreview.updated.push(...domainSummary.diffPreview.updated);
    }
  }
}

/**
 * Create failed domain summary
 */
function createFailedDomainSummary(entry, error) {
  return {
    domain: entry.domain,
    totalPlaces: 0,
    totalUrls: 0,
    fetched: 0,
    cached: 0,
    skipped: 0,
    skippedDuplicatePlace: 0,
    skippedRecent4xx: 0,
    stored404: 0,
    insertedHubs: 0,
    updatedHubs: 0,
    errors: 1,
    rateLimited: 0,
    validationSucceeded: 0,
    validationFailed: 0,
    validationFailureReasons: {},
    readinessTimedOut: 0,
    determination: 'error',
    determinationReason: error?.message || String(error),
    recommendations: [],
    decisions: [{
      level: 'error',
      message: `Domain processing failed: ${error?.message || error}`,
      stage: 'ERROR',
      status: null,
      outcome: 'failed'
    }],
    diffPreview: {
      inserted: [],
      updated: []
    }
  };
}

/**
 * Guess place hubs for a single domain
 * 
 * @param {Object} options - Guessing options
 * @param {string} options.domain - Domain to process
 * @param {string} [options.scheme='https'] - URL scheme
 * @param {string[]} [options.kinds=['country']] - Place kinds
 * @param {number} [options.limit] - Place limit
 * @param {boolean} [options.apply=false] - Persist to database
 * @param {number} [options.patternsPerPlace=3] - Patterns per place
 * @param {number} [options.maxAgeDays=7] - Cache max age
 * @param {number} [options.refresh404Days=180] - 404 refresh interval
 * @param {number} [options.retry4xxDays=7] - 4xx retry interval
 * @param {number} [options.readinessTimeoutMs] - Readiness timeout
 * @param {boolean} [options.verbose=false] - Verbose logging
 * @param {Object} deps - Injected dependencies
 * @param {Object} deps.db - Database connection
 * @param {Object} deps.queries - Query adapter
 * @param {Object} deps.analyzers - Hub analyzers
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
  const apply = Boolean(options.apply);
  const patternLimit = Math.max(1, Number(options.patternsPerPlace) || 3);
  const maxAgeMs = Number.isFinite(options.maxAgeDays) ? options.maxAgeDays * DAY_MS : 7 * DAY_MS;
  const refresh404Ms = Number.isFinite(options.refresh404Days) ? options.refresh404Days * DAY_MS : 180 * DAY_MS;
  const retry4xxMs = Number.isFinite(options.retry4xxDays) ? options.retry4xxDays * DAY_MS : 7 * DAY_MS;
  const nowMs = now().getTime();
  const runStartedMs = Date.now();
  const runStartedAt = new Date(runStartedMs);

  // Initialize summary
  const summary = {
    domain: normalizedDomain.host,
    totalPlaces: 0,
    totalUrls: 0,
    fetched: 0,
    cached: 0,
    skipped: 0,
    skippedDuplicatePlace: 0,
    skippedRecent4xx: 0,
    stored404: 0,
    insertedHubs: 0,
    updatedHubs: 0,
    errors: 0,
    rateLimited: 0,
    unsupportedKinds: [],
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

    if (!places.length) {
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
      if (place.kind === 'country') {
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
          const validationResult = validator.validatePlaceHub(result.body, {
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

    // Record final determination
    if (apply) {
      const determination = rateLimitTriggered ? 'rate-limited' : 'processed';
      const reason = rateLimitTriggered
        ? 'Processing aborted due to rate limiting'
        : `Processed ${summary.totalPlaces} places, ${summary.insertedHubs} hubs inserted, ${summary.updatedHubs} updated`;
      
      queries.recordDomainDetermination({
        domain: normalizedDomain.host,
        determination,
        reason,
        details: {
          totalPlaces: summary.totalPlaces,
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
    summary.determinationReason = `Processed ${summary.totalPlaces} places`;
    
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

  return readiness;
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
  createBatchSummary,
  aggregateSummaryInto
};
