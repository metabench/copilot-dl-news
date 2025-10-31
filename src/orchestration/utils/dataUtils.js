/**
 * Data Processing Utilities
 *
 * Utility functions for data processing, signal extraction, and age calculations.
 * Extracted from placeHubGuessing.js to improve modularity.
 */

/**
 * Compute age in milliseconds from fetch record
 * @param {Object} row - Database row with timestamp
 * @param {number} nowUtcMs - Current time in milliseconds
 * @returns {number} - Age in milliseconds
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
 * Extract prediction signals from prediction source object
 * @param {any} predictionSource - Prediction source data
 * @returns {Object|null} - Extracted signals or null
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
  return Object.keys(extracted).length > 0 ? extracted : null;
}

/**
 * Compose candidate signals from various sources
 * @param {Object} params - Signal composition parameters
 * @param {any} params.predictionSource - Prediction source data
 * @param {any} params.patternSource - Pattern source data
 * @param {Object} params.place - Place information
 * @param {string} params.attemptId - Attempt identifier
 * @param {Object} params.validationMetrics - Validation metrics
 * @returns {Object} - Composed candidate signals
 */
function composeCandidateSignals({ predictionSource, patternSource, place, attemptId, validationMetrics = null }) {
  const predictionSignals = extractPredictionSignals(predictionSource);
  const patternSignals = extractPredictionSignals(patternSource);

  const signals = {
    attemptId,
    place: {
      id: place.id,
      name: place.name,
      kind: place.kind,
      countryCode: place.country_code
    },
    timestamp: new Date().toISOString()
  };

  if (predictionSignals) {
    signals.prediction = predictionSignals;
  }

  if (patternSignals) {
    signals.pattern = patternSignals;
  }

  if (validationMetrics) {
    signals.validation = validationMetrics;
  }

  return signals;
}

/**
 * Create fetch row from result data
 * @param {Object} result - Fetch result
 * @param {string} fallbackHost - Fallback host if not in result
 * @returns {Object} - Standardized fetch row
 */
function createFetchRow(result, fallbackHost) {
  if (!result) {
    return null;
  }

  const finalUrl = result.finalUrl || result.url || null;
  let host = result.host || fallbackHost || null;
  if (!host && finalUrl) {
    try {
      const parsed = new URL(finalUrl);
      host = parsed.hostname ? parsed.hostname.toLowerCase() : host;
    } catch (_) {
      // ignore URL parsing errors
    }
  }

  const metrics = result.metrics || {};

  return {
    url: finalUrl,
    host: host || null,
    status: Number.isFinite(result.status) ? result.status : (result.error ? 'error' : null),
    statusCode: Number.isFinite(result.status) ? result.status : null,
    http_status: Number.isFinite(result.status) ? result.status : null,
    contentType: result.contentType || metrics.content_type || null,
    contentLength: result.contentLength || metrics.content_length || null,
    title: result.title || null,
    error: result.error || null,
    duration: result.duration || metrics.duration_ms || null,
    timestamp: result.timestamp || metrics.fetched_at || new Date().toISOString(),
    fetched_at: metrics.fetched_at || result.fetched_at || null,
    request_started_at: metrics.request_started_at || result.request_started_at || null,
    bytes_downloaded: metrics.bytes_downloaded || result.bytes_downloaded || null,
    total_ms: metrics.duration_ms || result.total_ms || null,
    download_ms: metrics.download_ms || result.download_ms || null,
    attemptId: result.attemptId || null
  };
}

module.exports = {
  computeAgeMs,
  extractPredictionSignals,
  composeCandidateSignals,
  createFetchRow
};