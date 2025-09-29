'use strict';

const { URL } = require('url');

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
      getDbAdapter
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
  }

  evaluate({ url, depth = 0, type, queueSize = 0, isDuplicate }) {
    const meta = type && typeof type === 'object' ? type : null;

    const decision = this.getUrlDecision(url, { phase: 'enqueue', depth });
    const analysis = decision?.analysis || {};
    const normalized = analysis && !analysis.invalid ? analysis.normalized : null;
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

  _safeHost(url) {
    if (!url) return null;
    try {
      return new URL(url).hostname;
    } catch (_) {
      return null;
    }
  }
}

module.exports = { UrlEligibilityService };
