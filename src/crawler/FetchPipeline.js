const { shouldUseCache } = require('../cache');

const fetchImpl = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

function defaultLogger() {
  return {
    info: (...args) => console.log(...args),
    warn: (...args) => console.warn(...args),
    error: (...args) => console.error(...args)
  };
}

class FetchPipeline {
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
    this.getUrlDecision = opts.getUrlDecision;
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
    this.articleHeaderCache = opts.articleHeaderCache;
    this.knownArticlesCache = opts.knownArticlesCache;
    this.getDbAdapter = typeof opts.getDbAdapter === 'function'
      ? opts.getDbAdapter
      : () => (opts.dbAdapter || null);
    this.parseRetryAfter = opts.parseRetryAfter;
    this.onCacheServed = typeof opts.onCacheServed === 'function' ? opts.onCacheServed : null;
    this.fetchFn = typeof opts.fetchFn === 'function' ? opts.fetchFn : fetchImpl;
    this.logger = opts.logger || defaultLogger();
    this.handlePolicySkip = typeof opts.handlePolicySkip === 'function' ? opts.handlePolicySkip : null;
  }

  /**
   * Fetches a URL using cache and network rules.
   * @param {{url: string, context?: object}} params
   * @returns {Promise<{html: string|null, meta: object, source: 'cache'|'network'|'not-modified'|'skipped'|'error'}>}
   */
  async fetch(params) {
    const { url, context = {} } = params || {};
    const depth = context.depth || 0;
    const allowRevisit = !!context.allowRevisit;
    const decision = this.getUrlDecision(url, { ...context, phase: 'fetch', depth });
    const analysis = decision?.analysis || {};
    const normalizedUrl = analysis && !analysis.invalid ? analysis.normalized : null;

    if (!normalizedUrl) {
      return this._buildResult({
        status: 'skipped',
        source: 'skipped',
        reason: 'normalize-failed'
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
        try {
          this.handlePolicySkip(decision, { depth, context, normalizedUrl });
        } catch (_) {}
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

    const looksArticle = this.looksLikeArticle(normalizedUrl);
    const cacheResult = await this._tryCache({
      originalUrl: url,
      normalizedUrl,
      looksArticle,
      context,
      decision
    });

    if (cacheResult) {
      return cacheResult;
    }

    return this._performNetworkFetch({
      normalizedUrl,
      context,
      decision
    });
  }

  async _tryCache({ originalUrl, normalizedUrl, looksArticle, context, decision }) {
    const forcedCache = context.forceCache === true;
    const allowCache = forcedCache || !context.allowRevisit;
    const rateLimitedHost = context && context.rateLimitedHost ? context.rateLimitedHost : null;

    const preferCache = this.preferCache || forcedCache;
    const effectiveMaxAgeMs = looksArticle && this.maxAgeArticleMs != null
      ? this.maxAgeArticleMs
      : (!looksArticle && this.maxAgeHubMs != null ? this.maxAgeHubMs : this.maxAgeMs);

    if (!allowCache && !preferCache && effectiveMaxAgeMs == null) {
      return null;
    }

    let cached = context.cachedPage || null;
    if (!cached) {
      cached = await this.getCachedArticle(originalUrl);
    }
    if (!cached) return null;

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

  async _performNetworkFetch({ normalizedUrl, context, decision }) {
    const parsedUrl = new URL(normalizedUrl);
    const host = parsedUrl.hostname;

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
      try { abortController.abort(); } catch (_) {}
    }, this.requestTimeoutMs);

    try {
      this.logger.info(`Fetching: ${normalizedUrl}`);
      const headers = {
        'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)'
      };

      const conditionalHeaders = this._buildConditionalHeaders(normalizedUrl);
      if (conditionalHeaders) Object.assign(headers, conditionalHeaders);

      const response = await this.fetchFn(normalizedUrl, {
        headers,
        agent: parsedUrl.protocol === 'http:' ? this.httpAgent : this.httpsAgent,
        signal: abortController.signal
      });

      clearTimeout(timeoutHandle);

      const headersReady = Date.now();
      const ttfbMs = headersReady - started;
      const status = response.status;
      const etag = response.headers.get('etag') || null;
      const lastModified = response.headers.get('last-modified') || null;
      const contentTypeHeader = response.headers.get('content-type') || null;
      const contentLengthHeader = parseInt(response.headers.get('content-length') || '0', 10) || null;
      const contentEncoding = response.headers.get('content-encoding') || null;

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
        this._recordConditionalHeaders(normalizedUrl, { etag, lastModified, fetched_at: meta.fetchedAtIso });
        this.noteSuccess(host);
        return this._buildResult({
          status: 'not-modified',
          source: 'not-modified',
          url: normalizedUrl,
          fetchMeta: meta,
          decision
        });
      }

      if (!response.ok) {
        const retryAfterHeader = response.headers.get('retry-after');
        const retryAfterMs = this.parseRetryAfter ? this.parseRetryAfter(retryAfterHeader) : null;
        this.logger.warn(`Failed to fetch ${normalizedUrl}: ${status}`);
        this._recordHttpError(normalizedUrl, status);
        if (status === 429) {
          this.note429(host, retryAfterMs);
        }
        return this._buildResult({
          status: 'error',
          source: 'error',
          url: normalizedUrl,
          error: {
            kind: 'http',
            httpStatus: status,
            retryAfterMs
          },
          retryAfterMs,
          decision
        });
      }

      const html = await response.text();
      const finished = Date.now();
      const downloadMs = finished - headersReady;
      const totalMs = finished - started;
      const bytesDownloaded = Buffer.byteLength(html, 'utf8');
      const transferKbps = downloadMs > 0 ? (bytesDownloaded / 1024) / (downloadMs / 1000) : null;
      const finalUrl = response.url || normalizedUrl;
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

      this._recordConditionalHeaders(finalUrl, {
        etag,
        last_modified: lastModified,
        fetched_at: fetchMeta.fetchedAtIso
      });
      this.noteSuccess(host);

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
      this.logger.error(`Error fetching ${normalizedUrl}: ${error?.message || String(error)}`);
      this.recordError({ kind: 'exception', message: error?.message || error?.name || String(error), url: normalizedUrl });
      if (error && (error.code === 'ECONNRESET' || /ECONNRESET|socket hang up/i.test(String(error?.message || '')))) {
        this.handleConnectionReset(normalizedUrl, error);
      }
      const isTimeout = error && (error.name === 'AbortError' || /aborted|timeout/i.test(String(error?.message || '')));
      this._recordNetworkError(normalizedUrl, isTimeout ? 'timeout' : 'network', error);
      return this._buildResult({
        status: 'error',
        source: 'error',
        url: normalizedUrl,
        error: {
          kind: isTimeout ? 'timeout' : 'network',
          message: error?.message || String(error),
          networkError: true
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
    try {
      if (this.articleHeaderCache) {
        this.articleHeaderCache.set(normalizedUrl, meta);
      }
      if (this.knownArticlesCache) {
        this.knownArticlesCache.set(normalizedUrl, true);
      }
    } catch (_) {}
  }

  _recordHttpError(url, status) {
    try {
      this.recordError({ kind: 'http', code: status, message: `HTTP ${status}`, url });
    } catch (_) {}
    try {
      this.getDbAdapter()?.insertError?.({ url, kind: 'http', code: status, message: `HTTP ${status}`, details: null });
    } catch (_) {}
    try {
      console.log(`ERROR ${JSON.stringify({ url, kind: 'http', code: status })}`);
    } catch (_) {}
  }

  _recordNetworkError(url, kind, error) {
    try {
      this.getDbAdapter()?.insertError?.({ url, kind, message: error?.message || String(error) });
    } catch (_) {}
    try {
      console.log(`ERROR ${JSON.stringify({ url, kind, message: error?.message || String(error) })}`);
    } catch (_) {}
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
}

module.exports = { FetchPipeline };