const { shouldUseCache } = require('../cache');

const fetchImpl = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

// Configuration for error response body storage
const STORE_ERROR_RESPONSE_BODIES = process.env.STORE_ERROR_BODIES === 'true';

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
   * @param {{url: string, context?: object, retryCount?: number}} params
   * @returns {Promise<{html: string|null, meta: object, source: 'cache'|'network'|'not-modified'|'skipped'|'error'}>}
   */
  async fetch(params) {
    const { url, context = {}, retryCount = 0 } = params || {};
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
    let parsedUrl = new URL(normalizedUrl);
    const host = parsedUrl.hostname;

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
      
      // Check if this is a retryable network error
      const isConnectionReset = error && (error.code === 'ECONNRESET' || /ECONNRESET|socket hang up/i.test(String(error?.message || '')));
      const isTimeout = error && (error.name === 'AbortError' || /aborted|timeout/i.test(String(error?.message || '')));
      const maxRetries = 1; // Single retry by default
      
      // Retry on connection reset or timeout (but not on other errors)
      if ((isConnectionReset || isTimeout) && retryCount < maxRetries) {
        this.logger.warn(`Retrying ${normalizedUrl} after ${isTimeout ? 'timeout' : 'connection reset'} (attempt ${retryCount + 1}/${maxRetries + 1})`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay before retry
        return this.fetch({ url, context, retryCount: retryCount + 1 });
      }
      
      // Log error and record after retries exhausted
      this.logger.error(`Error fetching ${normalizedUrl}: ${error?.message || String(error)}`);
      this.recordError({ kind: 'exception', message: error?.message || error?.name || String(error), url: normalizedUrl });
      if (isConnectionReset) {
        this.handleConnectionReset(normalizedUrl, error);
      }
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
}

module.exports = { FetchPipeline };