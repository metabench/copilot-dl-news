'use strict';

/**
 * remoteFetch — route the main crawler's page downloads to a remote fetch
 * worker while ALL coordination stays local.
 *
 * The crawl is planned and coordinated on this machine: the queue
 * (crawl_queue in the local news.db), URL decisions, robots handling,
 * caching, dedup, link extraction and storage are untouched. Only the raw
 * HTTP GET/HEAD is executed remotely, via the distributed fetch worker's
 * POST /batch endpoint (wip/labs/distributed-crawl/worker-server.js), whose
 * client is DistributedFetchAdapter. Page bodies come back inline in the
 * response, so the existing FetchPipeline storage path persists them into
 * the local news.db exactly as if they had been fetched locally.
 *
 * Wiring: FetchPipeline already accepts an injectable `fetchFn(url, opts)`
 * (see FetchPipeline.js — this was previously never wired). This module
 * builds that function.
 *
 * Configuration precedence (highest first):
 *   1. Explicit crawler option:  new NewsCrawler({ remoteFetch: { enabled, workerUrl, ... } })
 *      (also reachable via crawl.js --shared-overrides '{"remoteFetch":{"enabled":true}}')
 *   2. Environment:              CRAWL_REMOTE_FETCH=true|false, WORKER_URL=http://host:8081
 *   3. Worker host fallback:     FLEET_HOST env / tools/crawl/.fleet-host file
 *      (see tools/crawl/lib/fleet-host-resolver.js), port REMOTE_FETCH_WORKER_PORT or 8081.
 *
 * Remote fetch is OFF by default for the main crawl; enable it per run or
 * via env. When the worker is unreachable the adapter falls back to local
 * fetching (configurable via fallbackToLocal / DISTRIBUTED_FALLBACK).
 *
 * Behavioral note: the worker follows redirects itself (undici default),
 * so FetchPipeline's manual redirect loop simply sees the final response.
 * The worker reports the landing URL as `finalUrl`, which the Response-like
 * object exposes as `.url`.
 */

const DEFAULT_WORKER_PORT = 8081;

function resolveWorkerUrl(explicitUrl) {
  if (explicitUrl && String(explicitUrl).trim()) return String(explicitUrl).trim();
  if (process.env.WORKER_URL && process.env.WORKER_URL.trim()) return process.env.WORKER_URL.trim();
  const port = parseInt(process.env.REMOTE_FETCH_WORKER_PORT, 10) || DEFAULT_WORKER_PORT;
  try {
    const { getFleetHostSync } = require('../../../../tools/crawl/lib/fleet-host-resolver');
    return `http://${getFleetHostSync()}:${port}`;
  } catch (_) {
    return `http://127.0.0.1:${port}`;
  }
}

/**
 * Resolve the effective remote-fetch configuration.
 * @param {Object} explicit - e.g. rawOptions.remoteFetch from the crawler constructor
 * @returns {{enabled: boolean, workerUrl: string, timeoutMs: number, compress: boolean,
 *            fallbackToLocal: boolean, maxConcurrency: number, verbose: boolean}}
 */
function resolveRemoteFetchConfig(explicit = {}) {
  const env = process.env;
  const envEnabled = env.CRAWL_REMOTE_FETCH === 'true' || env.CRAWL_REMOTE_FETCH === '1';
  const envDisabled = env.CRAWL_REMOTE_FETCH === 'false' || env.CRAWL_REMOTE_FETCH === '0';

  let enabled;
  if (explicit.enabled !== undefined) enabled = !!explicit.enabled;
  else if (envEnabled) enabled = true;
  else if (envDisabled) enabled = false;
  else enabled = false; // off by default for the main crawl

  return {
    enabled,
    workerUrl: resolveWorkerUrl(explicit.workerUrl),
    timeoutMs: explicit.timeoutMs || parseInt(env.DISTRIBUTED_TIMEOUT_MS, 10) || 30000,
    compress: explicit.compress !== undefined ? !!explicit.compress : env.DISTRIBUTED_COMPRESS !== 'false',
    fallbackToLocal: explicit.fallbackToLocal !== undefined
      ? !!explicit.fallbackToLocal
      : env.DISTRIBUTED_FALLBACK !== 'false',
    maxConcurrency: explicit.maxConcurrency || parseInt(env.DISTRIBUTED_CONCURRENCY, 10) || 20,
    verbose: explicit.verbose !== undefined ? !!explicit.verbose : env.DISTRIBUTED_VERBOSE === 'true'
  };
}

/**
 * Build a FetchPipeline-compatible fetchFn backed by the remote worker.
 *
 * @param {Object} config - output of resolveRemoteFetchConfig()
 * @param {Object} [deps]
 * @param {Function} [deps.localFetch] - fallback fetch(url, opts) used when the
 *   worker is down or errors and fallbackToLocal is on. Defaults to global fetch.
 * @param {Object} [deps.logger] - console-like logger
 * @param {Object} [deps.adapter] - preconstructed DistributedFetchAdapter (tests)
 * @returns {Function|null} fetchFn, or null when remote fetch is disabled
 */
function createRemoteFetchFn(config, deps = {}) {
  if (!config || !config.enabled) return null;

  const logger = deps.logger || console;
  const localFetch = deps.localFetch || ((url, opts) => globalThis.fetch(url, opts));

  // Live telemetry state, surfaced to the crawl dashboard via progress
  // events (see core/Crawler._getRemoteFetchTelemetry → CrawlTelemetryBridge
  // → CrawlTelemetrySchema.createProgressEvent → SSE → CrawlStatusPage).
  const telemetryState = {
    lastFetchAt: null,
    lastFetchMs: null,
    lastUrl: null,
    lastBatchAt: null,
    lastBatchMs: null,
    lastBatchSize: null,
    lastErrorAt: null,
    lastError: null
  };

  let adapter = deps.adapter || null;
  const attachTelemetry = (a) => {
    if (typeof a.on !== 'function') return;
    a.on('batch', (info) => {
      telemetryState.lastBatchAt = new Date().toISOString();
      telemetryState.lastBatchMs = info?.durationMs ?? null;
      telemetryState.lastBatchSize = info?.size ?? info?.count ?? null;
    });
  };
  if (adapter) attachTelemetry(adapter);

  const getAdapter = () => {
    if (!adapter) {
      const { DistributedFetchAdapter } = require('./DistributedFetchAdapter');
      adapter = new DistributedFetchAdapter({
        workerUrl: config.workerUrl,
        timeoutMs: config.timeoutMs,
        compress: config.compress,
        maxConcurrency: config.maxConcurrency,
        localFetch,
        enabled: true
      });
      attachTelemetry(adapter);
      logger.info?.(`[remote-fetch] Routing page downloads to worker ${config.workerUrl} (local coordination unchanged)`);
    }
    return adapter;
  };

  const fetchFn = async (url, options = {}) => {
    const method = (options.method || 'GET').toUpperCase();
    const startedAt = Date.now();
    try {
      // Page bodies must come back inline: FetchPipeline calls .text().
      // `agent` is host-machine-specific and meaningless remotely; drop it.
      const { agent, signal, ...rest } = options;
      const response = await getAdapter().fetch(url, {
        ...rest,
        method,
        includeBody: method !== 'HEAD'
      });
      telemetryState.lastFetchAt = new Date().toISOString();
      telemetryState.lastFetchMs = Date.now() - startedAt;
      telemetryState.lastUrl = url;
      return response;
    } catch (err) {
      telemetryState.lastErrorAt = new Date().toISOString();
      telemetryState.lastError = err.message;
      if (config.fallbackToLocal) {
        if (config.verbose) {
          logger.warn?.(`[remote-fetch] Worker fetch failed for ${url} (${err.message}); falling back to local fetch`);
        }
        return localFetch(url, options);
      }
      throw err;
    }
  };

  fetchFn.isRemote = true;
  fetchFn.workerUrl = config.workerUrl;
  fetchFn.getAdapterStats = () => (adapter ? adapter.getStats() : null);

  /**
   * Full telemetry snapshot for dashboards. Safe to call at any time,
   * including before the first fetch (adapter not yet constructed).
   */
  fetchFn.getTelemetry = () => ({
    enabled: true,
    workerUrl: config.workerUrl,
    healthy: adapter ? adapter._healthy : null, // null = not yet contacted
    ...(adapter ? adapter.getStats() : {
      requestsSent: 0,
      requestsOk: 0,
      requestsError: 0,
      bytesTransferred: 0,
      batchesSent: 0,
      localFallbacks: 0
    }),
    ...telemetryState
  });
  return fetchFn;
}

module.exports = {
  resolveWorkerUrl,
  resolveRemoteFetchConfig,
  createRemoteFetchFn,
  DEFAULT_WORKER_PORT
};
