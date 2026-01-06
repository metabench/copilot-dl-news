const { shouldUseCache } = require('../cache');
const { safeCall, safeCallAsync } = require('./utils');
const NetworkRetryPolicy = require('./NetworkRetryPolicy');
const HostRetryBudgetManager = require('./HostRetryBudgetManager');
const EventEmitter = require('events');
const http = require('http');
const https = require('https');
const { PuppeteerDomainManager } = require('./PuppeteerDomainManager');

// Lazy-load PuppeteerFetcher to avoid requiring puppeteer when not needed
let PuppeteerFetcher = null;
function getPuppeteerFetcher() {
  if (!PuppeteerFetcher) {
    try {
      PuppeteerFetcher = require('./PuppeteerFetcher').PuppeteerFetcher;
    } catch {
      PuppeteerFetcher = null;
    }
  }
  return PuppeteerFetcher;
}

// node-fetch is ESM-only and cannot always be loaded under Jest's VM runtime.
// We try to use node-fetch first (for feature parity, incl. `agent` support), then fall back to
// a minimal built-in http/https fetch that provides the subset FetchPipeline needs.
let cachedNodeFetch = null;
let cachedNodeFetchError = null;

async function loadNodeFetch() {
  if (cachedNodeFetch) return cachedNodeFetch;
  if (cachedNodeFetchError) throw cachedNodeFetchError;
  try {
    const mod = await Function('return import("node-fetch")')();
    cachedNodeFetch = mod && (mod.default || mod);
    return cachedNodeFetch;
  } catch (err) {
    cachedNodeFetchError = err;
    throw err;
  }
}

function toHeaderValue(value) {
  if (value == null) return null;
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

function createHeadersFacade(rawHeaders) {
  const headers = rawHeaders && typeof rawHeaders === 'object' ? rawHeaders : {};
  return {
    get(name) {
      if (!name) return null;
      const value = headers[String(name).toLowerCase()];
      return toHeaderValue(value);
    }
  };
}

function basicFetch(url, { headers, agent, signal } = {}) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (err) {
      reject(err);
      return;
    }

    const transport = parsed.protocol === 'https:' ? https : http;
    const req = transport.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || undefined,
        path: `${parsed.pathname || '/'}${parsed.search || ''}`,
        method: 'GET',
        headers: headers || {},
        agent
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          const body = Buffer.concat(chunks);
          const status = Number(res.statusCode || 0);
          const headersFacade = createHeadersFacade(res.headers);
          resolve({
            status,
            ok: status >= 200 && status < 300,
            headers: headersFacade,
            text: async () => body.toString('utf8')
          });
        });
      }
    );

    req.on('error', reject);

    if (signal) {
      if (signal.aborted) {
        req.destroy(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
      } else {
        const onAbort = () => {
          req.destroy(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
        };
        try {
          signal.addEventListener('abort', onAbort, { once: true });
        } catch (_) {}
        req.on('close', () => {
          try {
            signal.removeEventListener('abort', onAbort);
          } catch (_) {}
        });
      }
    }

    req.end();
  });
}

const fetchImpl = async (...args) => {
  try {
    const nodeFetch = await loadNodeFetch();
    if (typeof nodeFetch === 'function') {
      return nodeFetch(...args);
    }
  } catch (_) {
    // Fall through to basicFetch.
  }
  return basicFetch(args[0], args[1]);
};

// Configuration for error response body storage
const STORE_ERROR_RESPONSE_BODIES = process.env.STORE_ERROR_BODIES === 'true';

const DEFAULT_NETWORK_RETRY_OPTIONS = Object.freeze({
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 8000,
  jitterRatio: 0.2,
  retryableErrorCodes: ['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'ENOTFOUND']
});

const DEFAULT_HOST_RETRY_BUDGET = Object.freeze({
  maxErrors: 6,
  windowMs: 5 * 60 * 1000,
  lockoutMs: 2 * 60 * 1000
});

function defaultLogger() {
  return {
    info: (...args) => console.log(...args),
    warn: (...args) => console.warn(...args),
    error: (...args) => console.error(...args),
    debug: (...args) => console.log(...args)
  };
}

class FetchPipeline extends EventEmitter {
  /**
   * @param {object} opts
   * @param {(url: string, ctx: object) => object} opts.getUrlDecision
   * @param {(url: string, ctx?: object) => string|null} opts.normalizeUrl
   * @param {(url: string) => boolean} opts.isOnDomain
   * @param {(url: string) => boolean} opts.isAllowed
    * @param {(url: string) => boolean} opts.hasVisited
   * @param {(url: string) => Promise<{html: string, crawledAt: string, source: string}|null>} opts.getCachedArticle
   * @param {(url: string) => any} opts.looksLikeArticle
   * @param {ArticleCache} opts.cache
   * @param {boolean} opts.preferCache
   * @param {number|undefined} opts.maxAgeMs
   * @param {number|undefined} opts.maxAgeArticleMs
   * @param {number|undefined} opts.maxAgeHubMs
   * @param {(host: string) => Promise<void>} opts.acquireDomainToken
   * @param {() => Promise<void>} opts.acquireRateToken
   * @param {number} opts.rateLimitMs
   * @param {number} opts.requestTimeoutMs
   * @param {import('http').Agent} opts.httpAgent
   * @param {import('https').Agent} opts.httpsAgent
   * @param {Map<string, any>} opts.currentDownloads
   * @param {() => void} opts.emitProgress
   * @param {(host: string, retryAfterMs: number|null) => void} opts.note429
   * @param {(host: string) => void} opts.noteSuccess
   * @param {(error: object) => void} opts.recordError
   * @param {(url: string, error: Error) => void} opts.handleConnectionReset
   * @param {Map<string, any>} opts.articleHeaderCache
   * @param {Map<string, any>} opts.knownArticlesCache
   * @param {object|null} opts.dbAdapter
   * @param {(headerVal: string|null) => number|null} opts.parseRetryAfter
  * @param {(info: object) => void} [opts.onCacheServed]
   * @param {{info: Function, warn: Function, error: Function} | undefined} opts.logger
   * @param {Function} [opts.fetchFn]
  * @param {(decision: object, extras: object) => void} [opts.handlePolicySkip]
   */
  constructor(opts) {
    super();
    this.getUrlDecision = opts.getUrlDecision;
    this.urlDecisionOrchestrator = opts.urlDecisionOrchestrator || null;
    this.normalizeUrl = opts.normalizeUrl;
    this.isOnDomain = opts.isOnDomain;
    this.isAllowed = opts.isAllowed;
    this.hasVisited = opts.hasVisited;
    this.looksLikeArticle = opts.looksLikeArticle;
    this.cache = opts.cache;
    this.preferCache = opts.preferCache;
    this.maxAgeMs = opts.maxAgeMs;
    this.maxAgeArticleMs = opts.maxAgeArticleMs;
    this.maxAgeHubMs = opts.maxAgeHubMs;
    this.getCachedArticle = opts.getCachedArticle;
    this.acquireDomainToken = opts.acquireDomainToken;
    this.acquireRateToken = opts.acquireRateToken;
    this.rateLimitMs = opts.rateLimitMs;
    this.requestTimeoutMs = opts.requestTimeoutMs;
    this.httpAgent = opts.httpAgent;
    this.httpsAgent = opts.httpsAgent;
    this.currentDownloads = opts.currentDownloads;
    this.emitProgress = typeof opts.emitProgress === 'function' ? opts.emitProgress : () => {};
    this.note429 = opts.note429;
    this.noteSuccess = opts.noteSuccess;
    this.recordError = opts.recordError;
    this.handleConnectionReset = opts.handleConnectionReset;
    this.telemetry = opts.telemetry || null;
    // Phase 1: Resilience services
    this.resilienceService = opts.resilienceService || null;
    this.contentValidationService = opts.contentValidationService || null;
    // Phase 2: Teacher service for JS-dependent pages
    this.teacherService = opts.teacherService || null;
    // Phase 5: Proxy rotation for IP-based rate limiting/blocking
    this.proxyManager = opts.proxyManager || null;
    this._currentProxyInfo = null; // Track current proxy for success/failure reporting
    this.onSoftFailure = typeof opts.onSoftFailure === 'function' ? opts.onSoftFailure : null;
    this.articleHeaderCache = opts.articleHeaderCache;
    this.knownArticlesCache = opts.knownArticlesCache;
    this.getDbAdapter = typeof opts.getDbAdapter === 'function'
      ? opts.getDbAdapter
      : () => (opts.dbAdapter || null);
    const retryOpts = (opts.networkRetryOptions && typeof opts.networkRetryOptions === 'object')
      ? opts.networkRetryOptions
      : {};
    const resolvedMaxAttempts = Number.isFinite(retryOpts.maxAttempts) && retryOpts.maxAttempts > 0
      ? Math.floor(retryOpts.maxAttempts)
      : DEFAULT_NETWORK_RETRY_OPTIONS.maxAttempts;
    const resolvedBaseDelay = Number.isFinite(retryOpts.baseDelayMs) && retryOpts.baseDelayMs >= 0
      ? retryOpts.baseDelayMs
      : DEFAULT_NETWORK_RETRY_OPTIONS.baseDelayMs;
    const resolvedMaxDelay = Number.isFinite(retryOpts.maxDelayMs) && retryOpts.maxDelayMs >= resolvedBaseDelay
      ? retryOpts.maxDelayMs
      : DEFAULT_NETWORK_RETRY_OPTIONS.maxDelayMs;
    const resolvedJitterRatio = Number.isFinite(retryOpts.jitterRatio) && retryOpts.jitterRatio >= 0
      ? Math.min(1, retryOpts.jitterRatio)
      : DEFAULT_NETWORK_RETRY_OPTIONS.jitterRatio;
    const resolvedRetryableCodes = Array.isArray(retryOpts.retryableErrorCodes) && retryOpts.retryableErrorCodes.length > 0
      ? Array.from(new Set(retryOpts.retryableErrorCodes.filter((code) => typeof code === 'string' && code.trim().length > 0)))
      : DEFAULT_NETWORK_RETRY_OPTIONS.retryableErrorCodes;
    this.networkRetryOptions = {
      maxAttempts: resolvedMaxAttempts,
      baseDelayMs: resolvedBaseDelay,
      maxDelayMs: Math.max(resolvedBaseDelay, resolvedMaxDelay),
      jitterRatio: resolvedJitterRatio,
      retryableErrorCodes: resolvedRetryableCodes,
      randomFn: typeof retryOpts.randomFn === 'function' ? retryOpts.randomFn : Math.random
    };
    this.networkRetryPolicy = new NetworkRetryPolicy(this.networkRetryOptions);
    const hostBudgetOpts = (opts.hostRetryBudget && typeof opts.hostRetryBudget === 'object') ? opts.hostRetryBudget : {};
    const resolvedHostMaxErrors = Number.isFinite(hostBudgetOpts.maxErrors) && hostBudgetOpts.maxErrors > 0
      ? Math.floor(hostBudgetOpts.maxErrors)
      : DEFAULT_HOST_RETRY_BUDGET.maxErrors;
    const resolvedHostWindowMs = Number.isFinite(hostBudgetOpts.windowMs) && hostBudgetOpts.windowMs > 0
      ? hostBudgetOpts.windowMs
      : DEFAULT_HOST_RETRY_BUDGET.windowMs;
    const resolvedHostLockoutMs = Number.isFinite(hostBudgetOpts.lockoutMs) && hostBudgetOpts.lockoutMs > 0
      ? hostBudgetOpts.lockoutMs
      : DEFAULT_HOST_RETRY_BUDGET.lockoutMs;
    this.hostRetryBudget = {
      maxErrors: resolvedHostMaxErrors,
      windowMs: resolvedHostWindowMs,
      lockoutMs: resolvedHostLockoutMs
    };
    this._hostRetryManager = new HostRetryBudgetManager({ telemetry: this.telemetry, logger: this.logger, maxErrors: this.hostRetryBudget.maxErrors, windowMs: this.hostRetryBudget.windowMs, lockoutMs: this.hostRetryBudget.lockoutMs });
    this.parseRetryAfter = opts.parseRetryAfter;
    this.onCacheServed = typeof opts.onCacheServed === 'function' ? opts.onCacheServed : null;
    this.fetchFn = typeof opts.fetchFn === 'function' ? opts.fetchFn : fetchImpl;
    this.logger = opts.logger || defaultLogger();
    this.handlePolicySkip = typeof opts.handlePolicySkip === 'function' ? opts.handlePolicySkip : null;
    
    // Puppeteer fallback configuration for TLS-fingerprinting sites
    const puppeteerOpts = opts.puppeteerFallback || {};
    this.puppeteerFallbackEnabled = puppeteerOpts.enabled !== false; // Enabled by default
    this.puppeteerFallbackOnEconnreset = puppeteerOpts.onEconnreset !== false; // Enabled by default
    this._puppeteerFetcher = null; // Lazy-initialized
    this._puppeteerConfig = puppeteerOpts; // Store config for lazy initialization
    
    // Legacy fallback: use static domains if manager not available
    // When custom domains are explicitly passed, use those instead of the manager
    const hasCustomDomains = Array.isArray(puppeteerOpts.domains) && puppeteerOpts.domains.length > 0;
    this.puppeteerFallbackDomains = hasCustomDomains
      ? puppeteerOpts.domains.map(d => d.toLowerCase())
      : ['theguardian.com', 'bloomberg.com', 'wsj.com']; // Default TLS-fingerprinting sites
    
    // Initialize PuppeteerDomainManager for auto-learning (only when not using custom domain list)
    this._puppeteerDomainManager = puppeteerOpts.domainManager || null;
    if (!this._puppeteerDomainManager && this.puppeteerFallbackEnabled && !hasCustomDomains) {
      try {
        this._puppeteerDomainManager = new PuppeteerDomainManager({ 
          logger: this.logger,
          autoSave: true
        });
        this._puppeteerDomainManager.load();
        
        // Wire up domain learning telemetry events
        this._puppeteerDomainManager.on('domain:learned', (data) => {
          this.emit('puppeteer:domain-learned', data);
          if (this.telemetry?.telemetry) {
            this.telemetry.telemetry({
              event: 'puppeteer.domain-learned',
              severity: 'info',
              domain: data.domain,
              reason: data.entry?.reason || 'ECONNRESET auto-learning',
              autoApproved: data.autoApproved,
              failureCount: data.entry?.failureCount
            });
          }
        });
        
        this._puppeteerDomainManager.on('domain:pending', (data) => {
          this.emit('puppeteer:domain-pending', data);
          if (this.telemetry?.telemetry) {
            this.telemetry.telemetry({
              event: 'puppeteer.domain-pending',
              severity: 'info',
              domain: data.domain,
              reason: data.entry?.reason || 'ECONNRESET threshold reached'
            });
          }
        });
        
        this._puppeteerDomainManager.on('failure:recorded', (data) => {
          // Only emit telemetry when approaching threshold (avoid log spam)
          if (data.count >= data.threshold - 1) {
            this.emit('puppeteer:failure-recorded', data);
          }
        });
      } catch (err) {
        this.logger.warn(`[puppeteer] Failed to initialize domain manager: ${err.message}`);
        this._puppeteerDomainManager = null;
      }
    }
  }

  /**
   * Get or create PuppeteerFetcher instance (lazy initialization)
   * @returns {Promise<Object|null>}
   */
  async _getPuppeteerFetcher() {
    if (this._puppeteerFetcher) return this._puppeteerFetcher;
    
    const PuppeteerFetcherClass = getPuppeteerFetcher();
    if (!PuppeteerFetcherClass) {
      this.logger.warn('[puppeteer] PuppeteerFetcher not available (puppeteer not installed?)');
      return null;
    }
    
    // Get lifecycle options from puppeteer fallback config
    const puppeteerOpts = this._puppeteerConfig || {};
    
    this._puppeteerFetcher = new PuppeteerFetcherClass({
      reuseSession: true,
      logger: this.logger,
      // Browser lifecycle options (with sensible defaults)
      maxPagesPerSession: puppeteerOpts.maxPagesPerSession || 50,
      maxSessionAgeMs: puppeteerOpts.maxSessionAgeMs || 10 * 60000,  // 10 minutes
      healthCheckEnabled: puppeteerOpts.healthCheckEnabled !== false,
      healthCheckIntervalMs: puppeteerOpts.healthCheckIntervalMs || 30000,
      restartOnError: puppeteerOpts.restartOnError !== false,
      maxConsecutiveErrors: puppeteerOpts.maxConsecutiveErrors || 3
    });
    
    // Wire up telemetry events
    this._puppeteerFetcher.on('browser:launched', (data) => {
      this.emit('puppeteer:browser-launched', data);
    });
    this._puppeteerFetcher.on('browser:closed', () => {
      this.emit('puppeteer:browser-closed');
    });
    this._puppeteerFetcher.on('fetch:success', (data) => {
      const reusedLabel = data.browserReused ? 'reused' : 'new';
      if (this.logger && typeof this.logger.debug === 'function') {
        this.logger.debug(`[puppeteer] Fetch success (${reusedLabel} browser, page #${data.sessionPageNumber})`, { type: 'PUPPETEER' });
      } else {
        this.logger.info(`[puppeteer] Fetch success (${reusedLabel} browser, page #${data.sessionPageNumber})`, { type: 'PUPPETEER' });
      }
    });
    
    await this._puppeteerFetcher.init();
    return this._puppeteerFetcher;
  }

  /**
   * Get Puppeteer telemetry stats
   * @returns {Object|null} Telemetry data or null if Puppeteer not initialized
   */
  getPuppeteerTelemetry() {
    if (!this._puppeteerFetcher) return null;
    return this._puppeteerFetcher.getTelemetry();
  }

  /**
   * Check if a host should use Puppeteer fallback
   * @param {string} host
   * @returns {boolean}
   */
  _shouldUsePuppeteerFallback(host) {
    if (!this.puppeteerFallbackEnabled) return false;
    const lowerHost = host.toLowerCase();
    
    // Use domain manager if available (supports auto-learning)
    if (this._puppeteerDomainManager) {
      return this._puppeteerDomainManager.shouldUsePuppeteer(lowerHost);
    }
    
    // Legacy fallback: static domain list
    return this.puppeteerFallbackDomains.some(domain => 
      lowerHost === domain || lowerHost.endsWith('.' + domain)
    );
  }

  /**
   * Cleanup Puppeteer resources (call when crawler is done)
   * @returns {Promise<Object|null>} Final telemetry stats or null
   */
  async destroyPuppeteer() {
    let telemetry = null;
    if (this._puppeteerFetcher) {
      try {
        telemetry = this._puppeteerFetcher.getTelemetry();
        await this._puppeteerFetcher.destroy();
        
        // Log summary telemetry
        if (telemetry) {
          const t = telemetry;
          this.logger.info(`[puppeteer] Session complete: ${t.browserLaunches} launches, ${t.browserReuses} reuses, ${t.pagesFetched} pages`, { type: 'PUPPETEER' });
          if (t.autoRestarts > 0 || t.errorRestarts > 0) {
            this.logger.info(`[puppeteer] Restarts: ${t.autoRestarts} auto, ${t.errorRestarts} error-based`, { type: 'PUPPETEER' });
          }
        }
      } catch (err) {
        this.logger.warn(`[puppeteer] Error closing browser: ${err.message}`);
      }
      this._puppeteerFetcher = null;
    }
    return telemetry;
  }

  /**
   * Fetches a URL using cache and network rules.
   * @param {{url: string, context?: object, retryCount?: number}} params
   * @returns {Promise<{html: string|null, meta: object, source: 'cache'|'network'|'not-modified'|'skipped'|'error'}>}
   */
  async fetch(params) {
    const { url, context = {}, retryCount = 0 } = params || {};
    this.emit('fetch:start', { url, context, retryCount });
    const depth = context.depth || 0;
    const allowRevisit = !!context.allowRevisit;
    const decisionContext = { ...context };
    if (Object.prototype.hasOwnProperty.call(decisionContext, '__networkRetry')) {
      delete decisionContext.__networkRetry;
    }
    const orchestration = this.urlDecisionOrchestrator
      ? await this.urlDecisionOrchestrator.decide(url, { ...decisionContext, phase: 'fetch', depth })
      : null;
    const decision = orchestration
      ? {
          allow: orchestration.action === 'fetch' || orchestration.action === 'cache',
          reason: orchestration.reason || null,
          analysis: orchestration.analysis || null,
          orchestration
        }
      : this.getUrlDecision(url, { ...decisionContext, phase: 'fetch', depth });
    const analysis = decision?.analysis || {};
    const normalizedUrl = analysis && !analysis.invalid ? analysis.normalized : null;

    if (!normalizedUrl) {
      return this._buildResult({
        status: 'skipped',
        source: 'skipped',
        reason: 'normalize-failed'
      });
    }

    if (orchestration && orchestration.action === 'skip') {
      const reason = orchestration.reason || decision?.reason || 'policy';
      if (this.handlePolicySkip && reason === 'query-superfluous') {
        safeCall(() => this.handlePolicySkip(decision, { depth, context, normalizedUrl }));
      }
      return this._buildResult({
        status: 'skipped-policy',
        source: 'skipped',
        reason,
        url: normalizedUrl,
        decision
      });
    }

    if (orchestration && orchestration.action === 'defer') {
      return this._buildResult({
        status: 'skipped-deferred',
        source: 'skipped',
        reason: orchestration.reason || 'deferred',
        url: normalizedUrl,
        decision
      });
    }

    if (!allowRevisit && this.hasVisited(normalizedUrl)) {
      return this._buildResult({
        status: 'skipped',
        source: 'skipped',
        reason: 'already-visited',
        url: normalizedUrl
      });
    }

    if (!this.isOnDomain(normalizedUrl) || !this.isAllowed(normalizedUrl)) {
      this.logger.info(`Skipping ${normalizedUrl} (not allowed or off-domain)`);
      return this._buildResult({
        status: 'skipped',
        source: 'skipped',
        reason: 'policy-blocked',
        url: normalizedUrl
      });
    }

    if (!decision.allow) {
      if (this.handlePolicySkip && decision.reason === 'query-superfluous') {
          safeCall(() => this.handlePolicySkip(decision, { depth, context, normalizedUrl }));
      }
      const reason = decision.reason || 'policy';
      return this._buildResult({
        status: 'skipped-policy',
        source: 'skipped',
        reason,
        url: normalizedUrl,
        decision
      });
    }

    const forceCache = orchestration && orchestration.action === 'cache';
    const cacheContext = forceCache ? { ...context, forceCache: true } : context;
    const looksArticle = this.looksLikeArticle(normalizedUrl);
    const cacheResult = await this._tryCache({
      originalUrl: url,
      normalizedUrl,
      looksArticle,
      context: cacheContext,
      decision
    });

    if (cacheResult) {
      return cacheResult;
    }

    if (forceCache) {
      return this._buildResult({
        status: 'skipped-cache-miss',
        source: 'skipped',
        reason: orchestration.reason || 'cache-miss',
        url: normalizedUrl,
        decision
      });
    }

    return this._performNetworkFetch({
      originalUrl: url,
      normalizedUrl,
      context,
      decision,
      retryCount
    });
  }

  async _tryCache({ originalUrl, normalizedUrl, looksArticle, context, decision }) {
    const forcedCache = context.forceCache === true;
    const allowCache = forcedCache || !context.allowRevisit;
    const rateLimitedHost = context && context.rateLimitedHost ? context.rateLimitedHost : null;
    const fetchPolicy = context.fetchPolicy || null;
    const contextMaxAge = typeof context.maxCacheAgeMs === 'number' && Number.isFinite(context.maxCacheAgeMs) && context.maxCacheAgeMs >= 0
      ? context.maxCacheAgeMs
      : null;

    const preferCache = this.preferCache || forcedCache;
    const effectiveMaxAgeMs = contextMaxAge != null
      ? contextMaxAge
      : (looksArticle && this.maxAgeArticleMs != null
        ? this.maxAgeArticleMs
        : (!looksArticle && this.maxAgeHubMs != null ? this.maxAgeHubMs : this.maxAgeMs));

    if (fetchPolicy === 'network-first') {
      return null;
    }

    if (!allowCache && !preferCache && effectiveMaxAgeMs == null) {
      return null;
    }

    let cached = context.cachedPage || null;
    if (!cached) {
      cached = await this.getCachedArticle(originalUrl);
    }
    if (!cached) return null;

    // Skip known 404s to avoid wasteful re-fetches
    if (cached.source === 'db-404' && cached.httpStatus === 404) {
      const ageMs = Date.now() - new Date(cached.crawledAt).getTime();
      const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
      if (this.logger && typeof this.logger.info === 'function') {
        this.logger.info(`Skipping known 404 (checked ${ageDays}d ago): ${normalizedUrl}`);
      }
      return this._buildResult({
        status: 'skip-404',
        source: 'cache',
        url: normalizedUrl,
        decision,
        cacheInfo: {
          reason: 'known-404',
          crawledAt: cached.crawledAt,
          httpStatus: 404,
          ageDays
        }
      });
    }

    const decisionCache = shouldUseCache({ preferCache, maxAgeMs: effectiveMaxAgeMs, crawledAt: cached.crawledAt });
    const useCache = forcedCache || decisionCache.use;
    if (!useCache) {
      return null;
    }

    const reason = forcedCache
      ? 'rate-limit'
      : (this.preferCache && decisionCache.use ? 'prefer-cache' : 'fresh-cache');
    const ageSeconds = decisionCache.ageSeconds ?? null;

    if (this.logger && typeof this.logger.info === 'function') {
      this.logger.info(`CACHE ${JSON.stringify({ url: normalizedUrl, source: cached.source, ageSeconds, reason })}`);
    }

    if (this.onCacheServed) {
      this.onCacheServed({
        url: normalizedUrl,
        source: cached.source,
        ageSeconds,
        reason,
        forced: forcedCache,
        rateLimitedHost
      });
    }

    this.emit('cache:hit', {
      url: normalizedUrl,
      source: cached.source,
      ageSeconds,
      reason,
      forced: forcedCache
    });

    return this._buildResult({
      status: 'cache',
      source: 'cache',
      html: cached.html,
      url: normalizedUrl,
      decision,
      cacheInfo: {
        ageSeconds,
        reason,
        forced: forcedCache,
        rateLimitedHost,
        crawledAt: cached.crawledAt || null,
        source: cached.source || null
      }
    });
  }

  async _performNetworkFetch({ originalUrl, normalizedUrl, context, decision, retryCount = 0 }) {
    let parsedUrl = new URL(normalizedUrl);
    const host = parsedUrl.hostname;
    const fetchPolicy = context.fetchPolicy || null;
    const fallbackToCache = context.fallbackToCache !== false;
    const cachedFallback = context.cachedFallback || context.cachedPage || null;
    const fallbackMeta = context.cachedFallbackMeta || {};
    const rateLimitedHostFromContext = context.rateLimitedHost || null;
    const cachedHost = context.cachedHost || null;
    const shouldFallbackToCache = fetchPolicy === 'network-first' && fallbackToCache && !!cachedFallback;
    const retryOptions = this.networkRetryOptions || DEFAULT_NETWORK_RETRY_OPTIONS;
    const totalAttempts = Math.max(1, retryOptions.maxAttempts || DEFAULT_NETWORK_RETRY_OPTIONS.maxAttempts);
    const attempt = retryCount + 1;
    const retryMeta = context && typeof context === 'object' && context.__networkRetry ? context.__networkRetry : null;
    const hostBudgetStatus = this._checkHostRetryBudget(host);
    if (hostBudgetStatus?.locked) {
      const retryAfterMs = hostBudgetStatus.retryAfterMs;
      const lockMessage = `Host retry budget exhausted for ${host}; delaying fetch`;
      this.logger.warn(`[network] host-budget-exhausted: ${host} locked for ${retryAfterMs}ms (url=${normalizedUrl})`, { type: 'NETWORK' });
      const budgetError = new Error(lockMessage);
      this.recordError({
        kind: 'exception',
        classification: 'host-budget-exhausted',
        code: 'HOST_RETRY_EXHAUSTED',
        message: lockMessage,
        url: normalizedUrl,
        attempt: attempt - 1 >= 0 ? attempt - 1 : 0,
        maxAttempts: this.hostRetryBudget.maxErrors
      });
      this._recordNetworkError(normalizedUrl, 'network', budgetError, {
        code: 'HOST_RETRY_EXHAUSTED',
        attempt: attempt - 1 >= 0 ? attempt - 1 : 0,
        attempts: totalAttempts,
        strategy: 'host-budget-exhausted'
      });
      if (hostBudgetStatus.state) {
        this._emitHostBudgetTelemetry('locked', host, hostBudgetStatus.state, {
          url: normalizedUrl,
          retryAfterMs
        });
      }
      return this._buildResult({
        status: 'error',
        source: 'error',
        url: normalizedUrl,
        error: {
          kind: 'network',
          code: 'HOST_RETRY_EXHAUSTED',
          message: lockMessage,
          retryAfterMs,
          hostRetryBudget: {
            host,
            failures: hostBudgetStatus.failures,
            maxFailures: this.hostRetryBudget.maxErrors,
            windowMs: this.hostRetryBudget.windowMs,
            lockoutMs: this.hostRetryBudget.lockoutMs,
            retryAtIso: hostBudgetStatus.retryAt ? new Date(hostBudgetStatus.retryAt).toISOString() : null
          }
        },
        retryAfterMs,
        decision
      });
    }
    if (retryMeta) {
      const resumeParts = [
        `attempt ${attempt}/${totalAttempts}`,
        retryMeta.strategy ? `strategy=${retryMeta.strategy}` : null,
        retryMeta.delayMs != null ? `delay=${retryMeta.delayMs}ms` : null,
        retryMeta.errorCode ? `code=${retryMeta.errorCode}` : null
      ].filter(Boolean);
      this.logger.warn(`[network] Resuming ${normalizedUrl}${resumeParts.length ? ` (${resumeParts.join(' | ')})` : ''}`, { type: 'NETWORK' });
    }
    const buildFallbackResult = ({ fallbackReason, httpStatus = null }) => {
      if (!cachedFallback) {
        return null;
      }
      const ageMs = typeof fallbackMeta.ageMs === 'number' ? fallbackMeta.ageMs : null;
      const ageSeconds = ageMs != null ? Math.floor(ageMs / 1000) : null;
      const html = typeof cachedFallback.html === 'string'
        ? cachedFallback.html
        : (typeof cachedFallback.body === 'string' ? cachedFallback.body : null);
      if (!html) {
        return null;
      }

      return this._buildResult({
        status: 'cache',
        source: 'cache',
        html,
        url: normalizedUrl,
        decision,
        cacheInfo: {
          reason: fallbackMeta.reason || 'network-first-fallback',
          policy: fallbackMeta.policy || fetchPolicy || null,
          forced: false,
          rateLimitedHost: rateLimitedHostFromContext || cachedHost || null,
          crawledAt: cachedFallback.crawledAt || null,
          source: cachedFallback.source || null,
          cachedHost: cachedHost || null,
          ageMs,
          ageSeconds,
          fallbackReason,
          httpStatus
        }
      });
    };

    // Validate protocol - log and fix http: URLs for https: domains
    if (parsedUrl.protocol === 'http:' && (host.includes('theguardian.com') || host.includes('bbc.co'))) {
      const httpsUrl = normalizedUrl.replace(/^http:/, 'https:');
      this.logger.warn(`URL protocol corrected: ${normalizedUrl} → ${httpsUrl}`);
      normalizedUrl = httpsUrl;
      // Re-parse with corrected URL
      parsedUrl = new URL(httpsUrl);  // Recreate URL object with corrected protocol
    }

    await this.acquireDomainToken(host);
    if (this.rateLimitMs > 0) {
      await this.acquireRateToken();
    }

    const started = Date.now();
    const requestStartedIso = new Date(started).toISOString();
    this.currentDownloads.set(normalizedUrl, { startedAt: started, policy: decision });
    this.emitProgress();

    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => {
      safeCall(() => abortController.abort());
    }, this.requestTimeoutMs);

    try {
      const attemptSuffix = totalAttempts > 1 ? ` (attempt ${attempt}/${totalAttempts})` : '';
      this.logger.info(`Fetching: ${normalizedUrl}${attemptSuffix}`, { type: 'FETCHING' });
      
      // Browser-like headers to avoid bot detection (especially on Guardian, BBC)
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
      };

      const conditionalHeaders = this._buildConditionalHeaders(normalizedUrl);
      if (conditionalHeaders) Object.assign(headers, conditionalHeaders);

      // Determine which agent to use (proxy or direct)
      let fetchAgent = parsedUrl.protocol === 'http:' ? this.httpAgent : this.httpsAgent;
      this._currentProxyInfo = null;
      
      if (this.proxyManager && this.proxyManager.isEnabled()) {
        const proxyResult = this.proxyManager.getAgent(host);
        if (proxyResult) {
          fetchAgent = proxyResult.agent;
          this._currentProxyInfo = proxyResult.proxyInfo;
          this.logger.info(`[proxy] Using ${this._currentProxyInfo.name} for ${normalizedUrl}`, { type: 'PROXY' });
        }
      }

      const response = await this.fetchFn(normalizedUrl, {
        headers,
        agent: fetchAgent,
        signal: abortController.signal,
        redirect: 'manual'  // Handle redirects manually to fix protocol
      });

      clearTimeout(timeoutHandle);

      // Handle redirects manually with protocol correction (support multiple redirects)
      let actualResponse = response;
      let finalUrl = normalizedUrl;
      let redirectCount = 0;
      const maxRedirects = 5; // Prevent infinite redirect loops
      
      while (actualResponse.status >= 300 && actualResponse.status < 400 && redirectCount < maxRedirects) {
        const location = actualResponse.headers.get('location');
        if (!location) break; // No location header, can't follow redirect
        
        let redirectUrl = location;
        // Make relative URLs absolute
        if (!redirectUrl.startsWith('http')) {
          redirectUrl = new URL(redirectUrl, finalUrl).href;
        }
        // Force https: for Guardian/BBC domains
        if (redirectUrl.startsWith('http://')) {
          const redirectHost = new URL(redirectUrl).hostname;
          if (redirectHost.includes('theguardian.com') || redirectHost.includes('bbc.co')) {
            redirectUrl = redirectUrl.replace(/^http:/, 'https:');
            this.logger.warn(`Redirect location corrected: ${location} → ${redirectUrl}`);
          }
        }
        
        redirectCount++;
        this.logger.info(`Following redirect ${redirectCount}: ${finalUrl} → ${redirectUrl}`);
        
        // Follow the redirect
        actualResponse = await this.fetchFn(redirectUrl, {
          headers,
          agent: redirectUrl.startsWith('https:') ? this.httpsAgent : this.httpAgent,
          signal: abortController.signal,
          redirect: 'manual'
        });
        finalUrl = redirectUrl;
      }
      
      // Check for too many redirects
      if (redirectCount >= maxRedirects) {
        this.logger.warn(`Too many redirects (${redirectCount}) for ${normalizedUrl}, stopping at ${finalUrl}`);
      }

      const headersReady = Date.now();
      const ttfbMs = headersReady - started;
      const status = actualResponse.status;
      const etag = actualResponse.headers.get('etag') || null;
      const lastModified = actualResponse.headers.get('last-modified') || null;
      const contentTypeHeader = actualResponse.headers.get('content-type') || null;
      const contentLengthHeader = parseInt(actualResponse.headers.get('content-length') || '0', 10) || null;
      const contentEncoding = actualResponse.headers.get('content-encoding') || null;

      if (status === 304) {
        const finished = Date.now();
        const totalMs = finished - started;
        const meta = {
          requestStartedIso,
          fetchedAtIso: new Date(finished).toISOString(),
          httpStatus: status,
          contentType: contentTypeHeader,
          contentLength: contentLengthHeader,
          contentEncoding,
          etag,
          lastModified,
          redirectChain: null,
          referrerUrl: context.referrerUrl || null,
          crawlDepth: context.depth ?? null,
          ttfbMs,
          downloadMs: null,
          totalMs,
          bytesDownloaded: 0,
          transferKbps: null,
          conditional: !!conditionalHeaders
        };

        // Record HTTP response
        await this._recordHttpResponse({
          url: normalizedUrl,
          status,
          headers: actualResponse.headers,
          timing: {
            requestStartedIso,
            fetchedAtIso: meta.fetchedAtIso,
            ttfbMs,
            downloadMs: null,
            totalMs,
            bytesDownloaded: 0,
            transferKbps: null
          },
          body: null, // 304 responses have no body
          redirectChain: null
        });

        this._recordConditionalHeaders(normalizedUrl, { etag, lastModified, fetched_at: meta.fetchedAtIso });
        this._noteHostSuccess(this._safeHost(normalizedUrl, host));
        this.noteSuccess(host);
        return this._buildResult({
          status: 'not-modified',
          source: 'not-modified',
          url: normalizedUrl,
          fetchMeta: meta,
          decision
        });
      }

      if (!actualResponse.ok) {
        const retryAfterHeader = actualResponse.headers.get('retry-after');
        const retryAfterMs = this.parseRetryAfter ? this.parseRetryAfter(retryAfterHeader) : null;
        this.logger.warn(`Failed to fetch ${normalizedUrl}: ${status}`);

        // Read response body for error recording if configured
        let errorBody = null;
        if (STORE_ERROR_RESPONSE_BODIES) {
          try {
            errorBody = await actualResponse.text();
          } catch (bodyError) {
            this.logger.warn(`Failed to read error response body: ${bodyError.message}`);
          }
        }

        // Record HTTP response
        await this._recordHttpResponse({
          url: finalUrl,
          status,
          headers: actualResponse.headers,
          timing: {
            requestStartedIso,
            fetchedAtIso: new Date(Date.now()).toISOString(),
            ttfbMs,
            downloadMs: null, // Error responses don't download content
            totalMs: Date.now() - started,
            bytesDownloaded: errorBody ? Buffer.byteLength(errorBody, 'utf8') : 0,
            transferKbps: null
          },
          body: errorBody,
          redirectChain: finalUrl !== normalizedUrl ? JSON.stringify([normalizedUrl, finalUrl]) : null
        });

        this._recordHttpError(finalUrl, status);
        if (status === 429) {
          this.note429(host, retryAfterMs);
        }

        // Phase 5: Report proxy failure for banning status codes
        if (this._currentProxyInfo && this.proxyManager) {
          this.proxyManager.recordFailure(this._currentProxyInfo.name, { httpStatus: status });
        }

        const failureHost = this._safeHost(finalUrl, host);
        const shouldCountTowardsHostBudget = !(status === 404 || status === 410);
        if (shouldCountTowardsHostBudget) {
          this._noteHostFailure(failureHost, {
            type: 'http',
            status,
            retryAfterMs
          });
        }

        if (shouldFallbackToCache) {
          const fallbackResult = buildFallbackResult({ fallbackReason: `http-${status}`, httpStatus: status });
          if (fallbackResult) {
            this.logger.warn(`Network fetch failed (${status}); returning stale cache for ${normalizedUrl}`);
            return fallbackResult;
          }
        }
        this.emit('fetch:error', { url: finalUrl, kind: 'http', status });
        return this._buildResult({
          status: 'error',
          source: 'error',
          url: finalUrl,
          error: {
            kind: 'http',
            httpStatus: status,
            retryAfterMs
          },
          retryAfterMs,
          decision
        });
      }

      const html = await actualResponse.text();
      const finished = Date.now();
      const downloadMs = finished - headersReady;
      const totalMs = finished - started;
      const bytesDownloaded = Buffer.byteLength(html, 'utf8');
      const transferKbps = downloadMs > 0 ? (bytesDownloaded / 1024) / (downloadMs / 1000) : null;
      
      // Use finalUrl from redirect handling above, or fall back to normalizedUrl
      // finalUrl already set during redirect handling
      
      const redirectChain = finalUrl !== normalizedUrl ? JSON.stringify([normalizedUrl, finalUrl]) : null;

      const fetchMeta = {
        requestStartedIso,
        fetchedAtIso: new Date(finished).toISOString(),
        httpStatus: status,
        contentType: contentTypeHeader,
        contentLength: contentLengthHeader,
        contentEncoding,
        etag,
        lastModified,
        redirectChain,
        referrerUrl: context.referrerUrl || null,
        crawlDepth: context.depth ?? null,
        ttfbMs,
        downloadMs,
        totalMs,
        bytesDownloaded,
        transferKbps,
        conditional: !!conditionalHeaders
      };

      // Record HTTP response (successful responses don't store body here - that's handled by content acquisition)
      await this._recordHttpResponse({
        url: finalUrl,
        status,
        headers: actualResponse.headers,
        timing: {
          requestStartedIso,
          fetchedAtIso: fetchMeta.fetchedAtIso,
          ttfbMs,
          downloadMs,
          totalMs,
          bytesDownloaded,
          transferKbps
        },
        body: null, // Successful responses store content via content acquisition, not here
        redirectChain
      });

      this._recordConditionalHeaders(finalUrl, {
        etag,
        last_modified: lastModified,
        fetched_at: fetchMeta.fetchedAtIso
      });
      this._noteHostSuccess(this._safeHost(finalUrl, host));
      this.noteSuccess(host);

      // Phase 5: Report proxy success
      if (this._currentProxyInfo && this.proxyManager) {
        this.proxyManager.recordSuccess(this._currentProxyInfo.name);
      }

      // Phase 1: Record activity and validate content
      if (this.resilienceService) {
        this.resilienceService.recordActivity();
        this.resilienceService.recordSuccess(host);
      }

      // Phase 1: Content validation - reject garbage content before processing
      if (this.contentValidationService && html) {
        const validation = this.contentValidationService.validate({
          url: finalUrl,
          html,
          statusCode: status,
          headers: actualResponse.headers
        });
        if (!validation.valid) {
          this.logger.warn(`[content-validation] Rejected ${finalUrl}: ${validation.reason}`, { type: 'VALIDATION' });
          if (this.telemetry) {
            this.telemetry.problem({
              kind: 'content-validation-failed',
              scope: host,
              message: validation.reason,
              details: { url: finalUrl, failureType: validation.failureType, pattern: validation.details?.matchedPattern }
            });
          }
          // Hard failures (bot protection, rate limits) should trigger circuit breaker
          if (validation.failureType === 'hard' && this.resilienceService) {
            this.resilienceService.recordFailure(host, 'content-rejection', validation.reason);
          }
          // Phase 2: Soft failures (JS-required, etc.) can be re-queued for Teacher rendering
          if (validation.failureType === 'soft' && this.onSoftFailure) {
            this.onSoftFailure({
              url: finalUrl,
              reason: validation.reason,
              details: validation.details,
              host
            });
            this.emit('fetch:soft-failure', { url: finalUrl, reason: validation.reason });
          }
          this.emit('fetch:error', { url: finalUrl, kind: 'validation', reason: validation.reason });
          return this._buildResult({
            status: 'skipped',
            source: 'validation-failed',
            url: finalUrl,
            html: null,
            fetchMeta,
            decision,
            reason: validation.reason
          });
        }
      }

      this.emit('fetch:success', { url: finalUrl, status, fetchMeta });
      return this._buildResult({
        status: 'success',
        source: 'network',
        url: finalUrl,
        html,
        fetchMeta,
        decision
      });
    } catch (error) {
      clearTimeout(timeoutHandle);

      // Use NetworkRetryPolicy to classify and compute delay
      const policy = this.networkRetryPolicy;
      const errorMessage = error?.message || String(error);
      const errorCode = typeof error?.code === 'string' ? error.code : null;
      const isRetryableNetworkError = policy.isRetryableError(error);
      const maxRetries = policy.maxRetries();

      if (isRetryableNetworkError && retryCount < maxRetries) {
        const strategy = policy.strategyFor(error) + '-backoff';
        const retryIndex = retryCount;
        const delayMs = policy.computeDelay({ attemptIndex: retryIndex });
        this.logger.warn(`[network] ${strategy}: retrying ${normalizedUrl} (attempt ${attempt + 1}/${totalAttempts}) in ${delayMs}ms [code=${errorCode || 'unknown'} message="${errorMessage}"]`, { type: 'NETWORK' });
        const retryUrl = originalUrl || normalizedUrl;
        const nextContext = { ...(context || {}), __networkRetry: { attempt, strategy, delayMs, errorCode, errorMessage } };
        this.emit('fetch:retry', { url: retryUrl, attempt: retryCount + 1, delayMs, strategy });
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return this.fetch({ url: retryUrl, context: nextContext, retryCount: retryCount + 1 });
      }

      if (isRetryableNetworkError && retryCount >= maxRetries) {
        this.logger.warn(`[network] Exhausted retries for ${normalizedUrl} after ${totalAttempts} attempts${errorCode ? ` [code=${errorCode}]` : ''}`, { type: 'NETWORK' });
      }

      const strategy = policy.strategyFor(error);
      const isTimeoutError = strategy === 'timeout';
      const isConnectionReset = strategy === 'connection-reset';
      const isRetryableCode = strategy === 'network-code';
      this.logger.error(`[network] Failed ${normalizedUrl} after ${attempt}/${totalAttempts} attempts${errorCode ? ` (code=${errorCode})` : ''}: ${errorMessage}`, { type: 'NETWORK' });

      // Phase 1: Record failure with resilience service for circuit breaker tracking
      if (this.resilienceService) {
        this.resilienceService.recordFailure(host, strategy, errorMessage);
      }

      // Phase 5: Report proxy failure for network errors
      if (this._currentProxyInfo && this.proxyManager) {
        this.proxyManager.recordFailure(this._currentProxyInfo.name, { code: errorCode || 'NETWORK_ERROR' });
      }

      this.emit('fetch:error', { url: normalizedUrl, kind: strategy, error });

      this.recordError({
        kind: 'exception',
        classification: strategy,
        code: errorCode || null,
        message: errorMessage,
        url: normalizedUrl,
        attempt,
        maxAttempts: totalAttempts
      });
      if (isConnectionReset) {
        this.handleConnectionReset(normalizedUrl, error);
        
        // Record failure for auto-learning (tracks domains that repeatedly fail with ECONNRESET)
        if (this._puppeteerDomainManager && this._puppeteerDomainManager.isTrackingEnabled()) {
          const learnResult = this._puppeteerDomainManager.recordFailure(host, normalizedUrl, errorMessage);
          if (learnResult.learned) {
            this.logger.info(`[puppeteer-learn] Domain ${host} auto-learned after ${learnResult.failureCount} ECONNRESET failures`, { type: 'PUPPETEER_LEARN' });
          } else if (learnResult.pending) {
            this.logger.info(`[puppeteer-learn] Domain ${host} pending approval after ${learnResult.failureCount} failures`, { type: 'PUPPETEER_LEARN' });
          } else if (learnResult.tracked) {
            if (this.logger && typeof this.logger.debug === 'function') {
              this.logger.debug(`[puppeteer-learn] Tracked failure ${learnResult.failureCount}/${this._puppeteerDomainManager.config.settings.autoLearnThreshold} for ${host}`, { type: 'PUPPETEER_LEARN' });
            } else {
              this.logger.info(`[puppeteer-learn] Tracked failure ${learnResult.failureCount}/${this._puppeteerDomainManager.config.settings.autoLearnThreshold} for ${host}`, { type: 'PUPPETEER_LEARN' });
            }
          }
        }
        
        // Puppeteer fallback for TLS-fingerprinting sites (ECONNRESET often means JA3/JA4 blocking)
        if (this.puppeteerFallbackOnEconnreset && this._shouldUsePuppeteerFallback(host)) {
          this.logger.info(`[puppeteer] Attempting Puppeteer fallback for ${normalizedUrl} (ECONNRESET on TLS-fingerprinting site)`, { type: 'PUPPETEER' });
          try {
            const puppeteer = await this._getPuppeteerFetcher();
            if (puppeteer) {
              const puppeteerResult = await puppeteer.fetch(normalizedUrl, {
                timeout: this.requestTimeoutMs
              });
              
              if (puppeteerResult.success) {
                this.logger.info(`[puppeteer] Success for ${normalizedUrl}: ${puppeteerResult.httpStatus}`, { type: 'PUPPETEER' });
                this._noteHostSuccess(this._safeHost(normalizedUrl, host));
                this.noteSuccess(host);
                
                // Build fetchMeta compatible with standard network fetch
                const fetchMeta = {
                  requestStartedIso: new Date().toISOString(),
                  fetchedAtIso: new Date().toISOString(),
                  httpStatus: puppeteerResult.httpStatus,
                  contentType: 'text/html',
                  contentLength: puppeteerResult.contentLength,
                  contentEncoding: null,
                  etag: null,
                  lastModified: null,
                  redirectChain: puppeteerResult.finalUrl !== normalizedUrl
                    ? JSON.stringify([normalizedUrl, puppeteerResult.finalUrl])
                    : null,
                  referrerUrl: context.referrerUrl || null,
                  crawlDepth: context.depth ?? null,
                  ttfbMs: null,
                  downloadMs: puppeteerResult.durationMs,
                  totalMs: puppeteerResult.durationMs,
                  bytesDownloaded: puppeteerResult.contentLength,
                  transferKbps: null,
                  conditional: false,
                  fetchMethod: 'puppeteer-fallback'
                };
                
                this.emit('fetch:success', { url: puppeteerResult.finalUrl, status: puppeteerResult.httpStatus, fetchMeta });
                return this._buildResult({
                  status: 'success',
                  source: 'network',
                  url: puppeteerResult.finalUrl,
                  html: puppeteerResult.html,
                  fetchMeta,
                  decision
                });
              } else {
                this.logger.warn(`[puppeteer] Failed for ${normalizedUrl}: ${puppeteerResult.error}`, { type: 'PUPPETEER' });
              }
            }
          } catch (puppeteerError) {
            this.logger.warn(`[puppeteer] Error during fallback for ${normalizedUrl}: ${puppeteerError.message}`, { type: 'PUPPETEER' });
          }
        }
      }
      const lastRetryMeta = context && typeof context === 'object' && context.__networkRetry ? context.__networkRetry : null;
      this._recordNetworkError(normalizedUrl, isTimeoutError ? 'timeout' : 'network', error, {
        code: errorCode || null,
        attempt,
        attempts: totalAttempts,
        strategy,
        lastRetry: lastRetryMeta
      });
      if (shouldFallbackToCache) {
        const fallbackReason = isTimeoutError ? 'timeout' : 'network-error';
        const fallbackResult = buildFallbackResult({ fallbackReason });
        if (fallbackResult) {
          this.logger.warn(`Network error (${fallbackReason}) for ${normalizedUrl}; returning stale cache`);
          this._noteHostFailure(this._safeHost(normalizedUrl, host), {
            type: 'network-fallback',
            strategy,
            errorCode
          });
          return fallbackResult;
        }
      }
      const lastRetryDelayMs = lastRetryMeta && typeof lastRetryMeta.delayMs === 'number' ? lastRetryMeta.delayMs : null;
      this._noteHostFailure(this._safeHost(normalizedUrl, host), {
        type: 'network',
        strategy,
        errorCode,
        lastRetryDelayMs
      });
      return this._buildResult({
        status: 'error',
        source: 'error',
        url: normalizedUrl,
        error: {
          kind: isTimeoutError ? 'timeout' : 'network',
          message: errorMessage,
          networkError: true,
          code: errorCode || null,
          attempt,
          attempts: totalAttempts,
          strategy,
          lastRetryDelayMs
        },
        decision
      });
    } finally {
      clearTimeout(timeoutHandle);
      this.currentDownloads.delete(normalizedUrl);
      this.emitProgress();
    }
  }

  _buildConditionalHeaders(normalizedUrl) {
  const dbAdapter = this.getDbAdapter();
  if (!dbAdapter || !dbAdapter.isEnabled?.()) return null;
    let meta = null;
    try {
      if (this.articleHeaderCache && this.articleHeaderCache.has(normalizedUrl)) {
        meta = this.articleHeaderCache.get(normalizedUrl);
      } else {
  meta = dbAdapter.getArticleHeaders(normalizedUrl) || null;
        if (this.articleHeaderCache) {
          this.articleHeaderCache.set(normalizedUrl, meta);
        }
      }
    } catch (_) {
      meta = null;
    }
    if (!meta || !(meta.etag || meta.last_modified || meta.lastModified)) return null;
    const headers = {};
    if (meta.etag) headers['If-None-Match'] = meta.etag;
    const lastMod = meta.last_modified || meta.lastModified;
    if (lastMod) headers['If-Modified-Since'] = lastMod;
    return Object.keys(headers).length ? headers : null;
  }

  _recordConditionalHeaders(normalizedUrl, meta) {
    if (!normalizedUrl) return;
    safeCall(() => {
      if (this.articleHeaderCache) {
        this.articleHeaderCache.set(normalizedUrl, meta);
      }
      if (this.knownArticlesCache) {
        this.knownArticlesCache.set(normalizedUrl, true);
      }
    });
  }

  _recordHttpError(url, status) {
    const message = `HTTP ${status}`;
    const host = this._safeHost(url);
    const payload = {
      url,
      kind: 'http',
      code: status,
      message,
      host
    };
    safeCall(() => this.recordError({ kind: 'http', code: status, message, url }));
    safeCall(() => this.getDbAdapter()?.insertError?.({ url, kind: 'http', code: status, message, details: null }));
    safeCall(() => console.log(`ERROR ${JSON.stringify(payload)}`));
    safeCall(() => {
      if (this.telemetry && typeof this.telemetry.telemetry === 'function') {
        this.telemetry.telemetry({
          severity: status >= 500 ? 'error' : 'warning',
          event: 'fetch.http-error',
          message,
          url,
          host,
          httpStatus: status
        });
      }
    });
  }

  _recordNetworkError(url, kind, error, meta = {}) {
    const payload = {
      url,
      kind,
      message: error?.message || String(error)
    };
    const host = this._safeHost(url);
    if (host) payload.host = host;
    if (meta && typeof meta === 'object') {
      if (meta.code != null) payload.code = meta.code;
      if (meta.attempt != null) payload.attempt = meta.attempt;
      if (meta.attempts != null) payload.maxAttempts = meta.attempts;
      if (meta.maxAttempts != null && payload.maxAttempts == null) payload.maxAttempts = meta.maxAttempts;
      const classification = meta.strategy || meta.classification || null;
      if (classification) {
        payload.strategy = classification;
        payload.classification = classification;
      }
      if (meta.lastRetry && typeof meta.lastRetry === 'object') {
        const lastRetry = {};
        if (meta.lastRetry.strategy) lastRetry.strategy = meta.lastRetry.strategy;
        if (meta.lastRetry.delayMs != null) lastRetry.delayMs = meta.lastRetry.delayMs;
        if (meta.lastRetry.errorCode) lastRetry.errorCode = meta.lastRetry.errorCode;
        if (Object.keys(lastRetry).length) payload.lastRetry = lastRetry;
      }
    }
    if (payload.maxAttempts != null && payload.attempts == null) {
      payload.attempts = payload.maxAttempts;
    }
    safeCall(() => this.getDbAdapter()?.insertError?.({ url, kind, code: payload.code || null, message: payload.message }));
    safeCall(() => console.log(`ERROR ${JSON.stringify(payload)}`));
    safeCall(() => {
      if (this.telemetry && typeof this.telemetry.telemetry === 'function') {
        this.telemetry.telemetry({
          severity: 'error',
          event: 'fetch.network-error',
          message: payload.message,
          url,
          host,
          code: payload.code || null,
          kind,
          attempt: payload.attempt ?? null,
          maxAttempts: payload.maxAttempts ?? null,
          strategy: payload.classification || payload.strategy || null,
          lastRetry: payload.lastRetry || null
        });
      }
    });
  }

  _checkHostRetryBudget(host) {
    if (!host || !this.hostRetryBudget) return { locked: false, failures: 0, state: null };
    return this._hostRetryManager.check(host);
  }

  _noteHostFailure(host, meta = {}) {
    if (!host || !this.hostRetryBudget) return;
    this._hostRetryManager.noteFailure(host, meta);
  }

  _noteHostSuccess(host) {
    if (!host || !this.hostRetryBudget) return;
    this._hostRetryManager.noteSuccess(host);
  }

  _emitHostBudgetTelemetry(stage, host, state, extras = {}) {
    // Intentionally preserved for compatibility; delegates to manager
    if (!this._hostRetryManager || !this._hostRetryManager._emitHostBudgetTelemetry) return;
    this._hostRetryManager._emitHostBudgetTelemetry(stage, host, state, extras);
  }

  _safeHost(url, fallback = null) {
    if (!url) return fallback;
    try {
      return new URL(url).hostname || fallback;
    } catch (_) {
      return fallback;
    }
  }

  /**
   * Record HTTP response metadata (and optionally body for errors when configured)
   * @param {object} responseData
   * @param {string} responseData.url - Final URL after redirects
   * @param {number} responseData.status - HTTP status code
   * @param {object} responseData.headers - Response headers object
   * @param {object} responseData.timing - Timing information
   * @param {string|null} responseData.body - Response body (only for errors when configured)
   * @param {string|null} responseData.redirectChain - JSON string of redirect chain
   */
  async _recordHttpResponse({ url, status, headers, timing, body = null, redirectChain = null }) {
    try {
      const dbAdapter = this.getDbAdapter();
      if (!dbAdapter || !dbAdapter.isEnabled?.()) return;

      // Always record HTTP response metadata
      const httpResponseData = {
        url,
        request_started_at: timing.requestStartedIso,
        fetched_at: timing.fetchedAtIso,
        http_status: status,
        content_type: headers.get('content-type') || null,
        content_encoding: headers.get('content-encoding') || null,
        etag: headers.get('etag') || null,
        last_modified: headers.get('last-modified') || null,
        redirect_chain: redirectChain,
        ttfb_ms: timing.ttfbMs,
        download_ms: timing.downloadMs,
        total_ms: timing.totalMs,
        bytes_downloaded: timing.bytesDownloaded || 0,
        transfer_kbps: timing.transferKbps
      };

      // Store response body for errors only when configured
      const shouldStoreBody = body && status >= 400 && STORE_ERROR_RESPONSE_BODIES;

      if (shouldStoreBody) {
        httpResponseData.content_body = body;
        httpResponseData.content_length = Buffer.byteLength(body, 'utf8');
      }

      await dbAdapter.insertHttpResponse(httpResponseData);
    } catch (error) {
      // Don't fail the fetch if response recording fails
      this.logger.warn(`Failed to record HTTP response for ${url}: ${error.message}`);
    }
  }

  _buildResult({ status, source, url = null, html = null, fetchMeta = null, error = null, retryAfterMs = null, decision = null, cacheInfo = null, reason = null }) {
    return {
      html,
      source,
      meta: {
        status,
        url,
        fetchMeta,
        error,
        retryAfterMs,
        decision,
        cacheInfo,
        reason
      }
    };
  }
  /**
   * Check if a URL is known to be a 404 error from cache
   * @param {string} url - URL to check
   * @returns {Promise<boolean>} True if URL is cached as 404
   */
  async isKnown404(url) {
    try {
      const cached = await this.getCachedArticle(url);
      return !!cached && cached.source === 'db-404' && cached.httpStatus === 404;
    } catch (error) {
      return false;
    }
  }
}
module.exports = { FetchPipeline };