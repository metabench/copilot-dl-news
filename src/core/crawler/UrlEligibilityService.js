'use strict';

const { URL } = require('url');

const statementCache = new WeakMap();
const ACQUISITION_KINDS = new Set(['article', 'refresh', 'history']);

class UrlEligibilityService {
  constructor(options = {}) {
    const {
      getUrlDecision,
      handlePolicySkip,
      isOnDomain,
      isAllowed,
      hasVisited,
      looksLikeArticle,
      knownArticlesCache,
      getDbAdapter,
      maxAgeHubMs,
      urlDecisionOrchestrator
    } = options;
    if (typeof getUrlDecision !== 'function') {
      throw new Error('UrlEligibilityService requires getUrlDecision function');
    }
    if (typeof handlePolicySkip !== 'function') {
      throw new Error('UrlEligibilityService requires handlePolicySkip function');
    }
    if (typeof isOnDomain !== 'function') {
      throw new Error('UrlEligibilityService requires isOnDomain function');
    }
    if (typeof isAllowed !== 'function') {
      throw new Error('UrlEligibilityService requires isAllowed function');
    }
    this.getUrlDecision = getUrlDecision;
    this.handlePolicySkip = handlePolicySkip;
    this.isOnDomain = isOnDomain;
    this.isAllowed = isAllowed;
    this.hasVisited = typeof hasVisited === 'function' ? hasVisited : () => false;
    this.looksLikeArticle = typeof looksLikeArticle === 'function' ? looksLikeArticle : () => false;
    this.knownArticlesCache = knownArticlesCache || new Map();
    this.getDbAdapter = typeof getDbAdapter === 'function' ? getDbAdapter : null;
    this.maxAgeHubMs = Number.isFinite(maxAgeHubMs) && maxAgeHubMs >= 0 ? maxAgeHubMs : null;
    this.urlDecisionOrchestrator = urlDecisionOrchestrator || null;
  }

  evaluate({ url, depth = 0, type, queueSize = 0, isDuplicate }) {
    const meta = type && typeof type === 'object' ? type : null;
    let normalized = null;

    const orchestratorGate = this._orchestratorQueueDecision({
      url,
      normalized,
      depth,
      kind: meta?.kind || meta?.type || meta?.intent || (typeof type === 'string' ? type : null)
    });

    if (orchestratorGate && orchestratorGate.shouldDrop) {
      const mappedReason = orchestratorGate.reason;
      const normalizedFallback = normalized || url;
      const hostFallback = this._safeHost(normalizedFallback);
      const syntheticDecision = {
        allow: false,
        reason: mappedReason,
        analysis: { normalized: normalizedFallback, raw: url }
      };

      if (mappedReason === 'query-superfluous') {
        this.handlePolicySkip(syntheticDecision, { depth, queueSize });
        return {
          status: 'drop',
          handled: true,
          reason: mappedReason,
          normalized: normalizedFallback,
          host: hostFallback,
          decision: syntheticDecision
        };
      }

      return {
        status: 'drop',
        reason: mappedReason,
        normalized: normalizedFallback,
        host: hostFallback,
        decision: syntheticDecision
      };
    }

    const decision = this.getUrlDecision(url, { phase: 'enqueue', depth });
    const analysis = decision?.analysis || {};
    normalized = analysis && !analysis.invalid ? analysis.normalized : null;
    const host = this._safeHost(normalized || url);

    if (!decision?.allow) {
      if (decision?.reason === 'query-superfluous') {
        this.handlePolicySkip(decision, { depth, queueSize });
        return {
          status: 'drop',
          handled: true,
          reason: decision.reason,
          normalized,
          host,
          decision
        };
      }
      return {
        status: 'drop',
        reason: decision?.reason || 'policy-blocked',
        normalized,
        host,
        decision
      };
    }

    if (!normalized) {
      return {
        status: 'drop',
        reason: 'bad-url',
        normalized,
        host,
        decision
      };
    }

    if (!this.isOnDomain(normalized)) {
      return {
        status: 'drop',
        reason: 'off-domain',
        normalized,
        host,
        decision
      };
    }

    if (!this.isAllowed(normalized)) {
      return {
        status: 'drop',
        reason: 'robots-disallow',
        normalized,
        host,
        decision
      };
    }

    let kind = null;
    if (meta) {
      kind = meta.kind || meta.type || meta.intent || null;
    } else if (typeof type === 'string') {
      kind = type;
    }
    if (!kind || typeof kind !== 'string') {
      kind = this.looksLikeArticle(normalized) ? 'article' : 'nav';
    }

    let reason = meta?.reason || null;
    const allowRevisit = !!meta?.allowRevisit;

    // Check database first for already processed URLs (prevents duplicate processing across crawl sessions)
    if (!allowRevisit && this._isAlreadyProcessed(normalized, { kind })) {
      return {
        status: 'drop',
        reason: 'already-processed',
        normalized,
        host,
        decision
      };
    }

    if (!allowRevisit && this.hasVisited(normalized)) {
      return {
        status: 'drop',
        reason: 'visited',
        normalized,
        host,
        decision
      };
    }

    if (kind === 'article' && this._isKnownArticle(normalized)) {
      kind = 'refresh';
      if (!reason) {
        reason = 'known-article';
      }
    }

    const queueKey = (allowRevisit || kind === 'refresh') ? `${kind}:${normalized}` : normalized;
    if (typeof isDuplicate === 'function' && isDuplicate(queueKey)) {
      return {
        status: 'drop',
        reason: 'duplicate',
        normalized,
        host,
        decision
      };
    }

    return {
      status: 'allow',
      normalized,
      host,
      decision,
      kind,
      allowRevisit,
      reason,
      queueKey,
      meta
    };
  }

  _isKnownArticle(normalized) {
    if (!normalized) return false;
    if (this.knownArticlesCache?.has(normalized)) {
      return !!this.knownArticlesCache.get(normalized);
    }
    let isKnown = false;
    const adapter = this.getDbAdapter ? this.getDbAdapter() : null;
    if (adapter && adapter.isEnabled && adapter.isEnabled()) {
      try {
        const row = (adapter.getArticleRowByUrl?.(normalized)) || (adapter.getArticleByUrlOrCanonical?.(normalized));
        isKnown = !!row;
      } catch (_) {
        isKnown = false;
      }
    }
    if (this.knownArticlesCache) {
      this.knownArticlesCache.set(normalized, isKnown);
    }
    return isKnown;
  }

  /**
   * Check if URL has already been successfully fetched and stored
   * @param {string} normalized - Normalized URL to check
   * @returns {boolean} - True if URL has successful HTTP response with content storage
   */
  _isAlreadyProcessed(normalized, options = {}) {
    if (!normalized) return false;
    
    // Check cache first
    if (this.knownArticlesCache?.has(normalized)) {
      return !!this.knownArticlesCache.get(normalized);
    }
    
    const adapter = this.getDbAdapter ? this.getDbAdapter() : null;
    if (!adapter || !adapter.isEnabled || !adapter.isEnabled()) {
      return false;
    }
    
    try {
      // Check if URL has successful HTTP response with content storage
      const db = adapter.getDb ? adapter.getDb() : null;
      if (!db) return false;

      const { processedCheck, latestFetch } = this._getStatements(db);
      const isNavigationKind = this._isNavigationKind(options.kind);

      if (isNavigationKind && this.maxAgeHubMs != null) {
        const latestRow = this._getLatestFetch(latestFetch, normalized);
        if (!this._isHubFetchFresh(latestRow)) {
          return false;
        }
      }

      if (!processedCheck) {
        return false;
      }

      const row = processedCheck.get(normalized);
      return !!row;
    } catch (error) {
      // If database check fails, err on the side of processing (don't block potentially valid URLs)
      return false;
    }
  }

  _getStatements(db) {
    if (!db) return { processedCheck: null, latestFetch: null };
    let cached = statementCache.get(db);
    if (cached) {
      return cached;
    }

    let processedCheck = null;
    let latestFetch = null;

    try {
      processedCheck = db.prepare(`
        SELECT 1 FROM urls u
        INNER JOIN http_responses hr ON hr.url_id = u.id
        INNER JOIN content_storage cs ON cs.http_response_id = hr.id
        WHERE u.url = ? AND hr.http_status >= 200 AND hr.http_status < 300
        LIMIT 1
      `);
    } catch (_) {}

    try {
      latestFetch = db.prepare(`
        SELECT hr.fetched_at AS fetched_at
        FROM urls u
        INNER JOIN http_responses hr ON hr.url_id = u.id
        WHERE u.url = ?
        ORDER BY hr.fetched_at DESC
        LIMIT 1
      `);
    } catch (_) {}

    cached = { processedCheck, latestFetch };
    statementCache.set(db, cached);
    return cached;
  }

  _getLatestFetch(statement, normalized) {
    if (!statement || !normalized) {
      return null;
    }
    try {
      return statement.get(normalized) || null;
    } catch (_) {
      return null;
    }
  }

  _isHubFetchFresh(row) {
    if (!row || !row.fetched_at) {
      return false;
    }
    if (this.maxAgeHubMs == null) {
      return false;
    }
    const fetchedAtMs = Date.parse(row.fetched_at);
    if (!Number.isFinite(fetchedAtMs)) {
      return false;
    }
    const ageMs = Date.now() - fetchedAtMs;
    if (ageMs < 0) {
      return false;
    }
    return ageMs < this.maxAgeHubMs;
  }

  _isNavigationKind(kind) {
    if (!kind || typeof kind !== 'string') {
      return true;
    }
    const normalized = kind.toLowerCase();
    return !ACQUISITION_KINDS.has(normalized);
  }

  _safeHost(url) {
    if (!url) return null;
    try {
      return new URL(url).hostname;
    } catch (_) {
      return null;
    }
  }

  _orchestratorQueueDecision({ url, normalized, depth, kind }) {
    if (!this.urlDecisionOrchestrator || typeof this.urlDecisionOrchestrator.shouldQueue !== 'function') {
      return null;
    }

    const targetUrl = normalized || url;
    if (!targetUrl) return null;

    try {
      const result = this.urlDecisionOrchestrator.shouldQueue(targetUrl, {
        depth,
        classification: typeof kind === 'string' ? kind : null
      });
      if (!result || result.shouldQueue !== false) return null;
      return {
        shouldDrop: true,
        reason: this._mapOrchestratorReason(result.reason || 'policy-blocked')
      };
    } catch (_) {
      return null;
    }
  }

  _mapOrchestratorReason(reason) {
    if (!reason) return 'policy-blocked';
    switch (reason) {
      case 'has-query-string':
        return 'query-superfluous';
      case 'invalid-url':
      case 'invalid-protocol':
      case 'blocked-extension':
        return 'bad-url';
      case 'off-domain':
      case 'domain-not-allowed':
        return 'off-domain';
      case 'max-depth-exceeded':
        return 'max-depth';
      case 'domain-blocked':
        return 'domain-blocked';
      default:
        return reason;
    }
  }
}

module.exports = { UrlEligibilityService };
