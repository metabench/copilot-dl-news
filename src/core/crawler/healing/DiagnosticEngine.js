'use strict';

/**
 * DiagnosticEngine - Classifies crawler errors into actionable failure types
 * 
 * Analyzes errors, HTTP responses, and context to determine the root cause
 * of crawler failures. Returns structured diagnoses with confidence scores.
 * 
 * @module DiagnosticEngine
 */

/**
 * @typedef {Object} DiagnosisResult
 * @property {string} type - Failure type (STALE_PROXY, LAYOUT_CHANGE, etc.)
 * @property {number} confidence - Confidence score (0-1)
 * @property {Object} evidence - Supporting evidence for the diagnosis
 * @property {string} [message] - Human-readable explanation
 */

/**
 * Failure type constants
 */
const FailureTypes = Object.freeze({
  STALE_PROXY: 'STALE_PROXY',
  LAYOUT_CHANGE: 'LAYOUT_CHANGE',
  RATE_LIMITED: 'RATE_LIMITED',
  DNS_FAILURE: 'DNS_FAILURE',
  CONTENT_BLOCK: 'CONTENT_BLOCK',
  SOFT_BLOCK: 'SOFT_BLOCK',
  CONNECTION_RESET: 'CONNECTION_RESET',
  TIMEOUT: 'TIMEOUT',
  SSL_ERROR: 'SSL_ERROR',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  SERVER_ERROR: 'SERVER_ERROR',
  UNKNOWN: 'UNKNOWN'
});

/**
 * Detection patterns for each failure type
 */
const DETECTION_PATTERNS = {
  [FailureTypes.STALE_PROXY]: {
    statusCodes: [403, 407, 502, 503],
    errorCodes: ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'],
    consecutiveThreshold: 5,
    description: 'Proxy appears stale or blocked'
  },
  [FailureTypes.LAYOUT_CHANGE]: {
    confidenceDropThreshold: 0.30, // 30% drop
    selectors: ['article', '.content', '#main'],
    description: 'Page layout changed significantly'
  },
  [FailureTypes.RATE_LIMITED]: {
    statusCodes: [429],
    headers: ['retry-after', 'x-ratelimit-remaining', 'x-ratelimit-reset'],
    bodyPatterns: [/rate.?limit/i, /too.?many.?requests/i, /slow.?down/i],
    description: 'Rate limit hit'
  },
  [FailureTypes.DNS_FAILURE]: {
    errorCodes: ['ENOTFOUND', 'EAI_NONAME', 'EAI_NODATA', 'ENOENT'],
    description: 'DNS resolution failed'
  },
  [FailureTypes.CONTENT_BLOCK]: {
    bodyPatterns: [
      /enable.?javascript/i,
      /javascript.?required/i,
      /browser.?not.?supported/i,
      /please.?enable.?cookies/i,
      /turn.?on.?javascript/i,
      /<noscript>/i
    ],
    statusCodes: [200], // Returns 200 but blocked content
    description: 'JavaScript-required content block'
  },
  [FailureTypes.SOFT_BLOCK]: {
    bodyPatterns: [
      /captcha/i,
      /recaptcha/i,
      /hcaptcha/i,
      /verify.?you.?are.?(human|not.?a.?robot)/i,
      /cloudflare/i,
      /challenge/i,
      /bot.?detection/i,
      /access.?denied/i,
      /blocked/i,
      /unusual.?traffic/i
    ],
    statusCodes: [403, 503],
    description: 'CAPTCHA or bot detection triggered'
  },
  [FailureTypes.CONNECTION_RESET]: {
    errorCodes: ['ECONNRESET', 'EPIPE', 'ECONNABORTED'],
    description: 'Connection reset by server'
  },
  [FailureTypes.TIMEOUT]: {
    errorCodes: ['ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ENETUNREACH'],
    errorPatterns: [/timeout/i, /timed.?out/i],
    description: 'Request timed out'
  },
  [FailureTypes.SSL_ERROR]: {
    errorCodes: [
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      'CERT_HAS_EXPIRED',
      'DEPTH_ZERO_SELF_SIGNED_CERT',
      'ERR_TLS_CERT_ALTNAME_INVALID',
      'SELF_SIGNED_CERT_IN_CHAIN'
    ],
    errorPatterns: [/ssl/i, /certificate/i, /tls/i],
    description: 'SSL/TLS certificate error'
  },
  [FailureTypes.AUTH_REQUIRED]: {
    statusCodes: [401, 402, 407],
    bodyPatterns: [
      /sign.?in/i,
      /log.?in.?required/i,
      /subscribe.?to.?(read|access|continue)/i,
      /paywall/i,
      /premium.?content/i,
      /members?.?only/i
    ],
    description: 'Authentication or subscription required'
  },
  [FailureTypes.SERVER_ERROR]: {
    statusCodes: [500, 502, 503, 504],
    bodyPatterns: [
      /internal.?server.?error/i,
      /bad.?gateway/i,
      /service.?unavailable/i,
      /gateway.?timeout/i,
      /temporarily.?unavailable/i
    ],
    description: 'Server error (5xx)'
  }
};

class DiagnosticEngine {
  /**
   * @param {Object} [opts]
   * @param {Object} [opts.patterns] - Custom detection patterns to merge
   * @param {Object} [opts.logger] - Logger instance
   * @param {Object} [opts.domainStats] - Domain statistics tracker
   */
  constructor(opts = {}) {
    this.logger = opts.logger || console;
    this.domainStats = opts.domainStats || null;
    
    // Allow custom patterns to override defaults
    this._patterns = { ...DETECTION_PATTERNS };
    if (opts.patterns) {
      for (const [type, pattern] of Object.entries(opts.patterns)) {
        this._patterns[type] = { ...this._patterns[type], ...pattern };
      }
    }
    
    // Track consecutive errors per domain for STALE_PROXY detection
    this._consecutiveErrors = new Map();
  }

  /**
   * Diagnose an error and return the failure type
   * 
   * @param {Error|Object} error - The error or response object
   * @param {Object} [context] - Additional context
   * @param {string} [context.domain] - Domain being crawled
   * @param {string} [context.url] - URL that failed
   * @param {number} [context.statusCode] - HTTP status code
   * @param {Object} [context.headers] - Response headers
   * @param {string} [context.body] - Response body (truncated)
   * @param {number} [context.previousConfidence] - Previous extraction confidence
   * @param {number} [context.currentConfidence] - Current extraction confidence
   * @param {string} [context.proxyName] - Proxy used (if any)
   * @returns {DiagnosisResult}
   */
  diagnose(error, context = {}) {
    const results = [];
    
    // Extract error details
    const errorCode = error?.code || error?.cause?.code;
    const errorMessage = error?.message || String(error);
    const statusCode = context.statusCode || error?.statusCode || error?.status;
    const headers = context.headers || {};
    const body = context.body || '';
    const domain = context.domain || this._extractDomain(context.url);
    
    // Track consecutive errors for domain
    if (domain) {
      this._trackConsecutiveError(domain, statusCode, errorCode);
    }
    
    // Check each failure type
    results.push(this._checkRateLimited(statusCode, headers, body, errorMessage));
    results.push(this._checkDnsFailure(errorCode, errorMessage));
    results.push(this._checkAuthRequired(statusCode, body));
    results.push(this._checkServerError(statusCode, body, errorMessage));
    results.push(this._checkSoftBlock(statusCode, body, errorMessage));
    results.push(this._checkContentBlock(statusCode, body));
    results.push(this._checkStaleProxy(domain, statusCode, errorCode, context.proxyName));
    results.push(this._checkLayoutChange(context.previousConfidence, context.currentConfidence));
    results.push(this._checkConnectionReset(errorCode, errorMessage));
    results.push(this._checkTimeout(errorCode, errorMessage));
    results.push(this._checkSslError(errorCode, errorMessage));
    
    // Sort by confidence and return the best match
    const validResults = results.filter(r => r && r.confidence > 0);
    validResults.sort((a, b) => b.confidence - a.confidence);
    
    if (validResults.length > 0) {
      const best = validResults[0];
      this.logger.debug?.(
        `[DiagnosticEngine] Diagnosed ${domain || 'unknown'}: ${best.type} ` +
        `(confidence: ${(best.confidence * 100).toFixed(0)}%)`
      );
      return best;
    }
    
    // Unknown failure
    return {
      type: FailureTypes.UNKNOWN,
      confidence: 0.1,
      evidence: {
        errorCode,
        errorMessage: errorMessage.slice(0, 200),
        statusCode
      },
      message: `Unrecognized error: ${errorMessage.slice(0, 100)}`
    };
  }

  /**
   * Get detection patterns
   * @returns {Object} Detection patterns
   */
  getPatterns() {
    return { ...this._patterns };
  }

  /**
   * Get failure type constants
   * @returns {Object} Failure types
   */
  static get FailureTypes() {
    return FailureTypes;
  }

  /**
   * Reset consecutive error tracking for a domain
   * @param {string} domain
   */
  resetDomainTracking(domain) {
    this._consecutiveErrors.delete(domain);
  }

  /**
   * Get consecutive error count for a domain
   * @param {string} domain
   * @returns {Object|null}
   */
  getDomainErrorState(domain) {
    return this._consecutiveErrors.get(domain) || null;
  }

  // Private methods

  _extractDomain(url) {
    if (!url) return null;
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }

  _trackConsecutiveError(domain, statusCode, errorCode) {
    const state = this._consecutiveErrors.get(domain) || {
      count: 0,
      lastStatusCode: null,
      lastErrorCode: null,
      firstAt: Date.now(),
      lastAt: Date.now()
    };
    
    state.count++;
    state.lastStatusCode = statusCode;
    state.lastErrorCode = errorCode;
    state.lastAt = Date.now();
    
    this._consecutiveErrors.set(domain, state);
  }

  _checkRateLimited(statusCode, headers, body, errorMessage) {
    const pattern = this._patterns[FailureTypes.RATE_LIMITED];
    const evidence = { statusCode, matchedHeaders: [], matchedPatterns: [] };
    let confidence = 0;
    
    // Check status code
    if (pattern.statusCodes.includes(statusCode)) {
      confidence = 0.95;
      evidence.statusMatch = true;
    }
    
    // Check headers
    const headerKeys = Object.keys(headers).map(k => k.toLowerCase());
    for (const h of pattern.headers) {
      if (headerKeys.includes(h.toLowerCase())) {
        evidence.matchedHeaders.push(h);
        confidence = Math.max(confidence, 0.9);
      }
    }
    
    // Check body patterns
    for (const p of pattern.bodyPatterns) {
      if (p.test(body) || p.test(errorMessage)) {
        evidence.matchedPatterns.push(p.source);
        confidence = Math.max(confidence, 0.8);
      }
    }
    
    if (confidence === 0) return null;
    
    return {
      type: FailureTypes.RATE_LIMITED,
      confidence,
      evidence,
      message: pattern.description
    };
  }

  _checkDnsFailure(errorCode, errorMessage) {
    const pattern = this._patterns[FailureTypes.DNS_FAILURE];
    
    if (pattern.errorCodes.includes(errorCode)) {
      return {
        type: FailureTypes.DNS_FAILURE,
        confidence: 0.99,
        evidence: { errorCode },
        message: pattern.description
      };
    }
    
    // Check for DNS-related error messages
    if (/getaddrinfo|dns|resolve|lookup/i.test(errorMessage)) {
      return {
        type: FailureTypes.DNS_FAILURE,
        confidence: 0.85,
        evidence: { errorMessage: errorMessage.slice(0, 200) },
        message: pattern.description
      };
    }
    
    return null;
  }

  _checkSoftBlock(statusCode, body, errorMessage) {
    const pattern = this._patterns[FailureTypes.SOFT_BLOCK];
    const evidence = { matchedPatterns: [], statusCode };
    let confidence = 0;
    
    // Check body patterns
    for (const p of pattern.bodyPatterns) {
      if (p.test(body)) {
        evidence.matchedPatterns.push(p.source);
        confidence = Math.max(confidence, 0.85);
      }
    }
    
    // Higher confidence if status code matches
    if (confidence > 0 && pattern.statusCodes.includes(statusCode)) {
      confidence = Math.min(confidence + 0.1, 0.98);
    }
    
    if (confidence === 0) return null;
    
    return {
      type: FailureTypes.SOFT_BLOCK,
      confidence,
      evidence,
      message: pattern.description
    };
  }

  _checkContentBlock(statusCode, body) {
    const pattern = this._patterns[FailureTypes.CONTENT_BLOCK];
    const evidence = { matchedPatterns: [], statusCode };
    let confidence = 0;
    
    // Only check on 200 OK responses (blocked content masquerading as success)
    if (statusCode === 200 || !statusCode) {
      for (const p of pattern.bodyPatterns) {
        if (p.test(body)) {
          evidence.matchedPatterns.push(p.source);
          confidence = Math.max(confidence, 0.80);
        }
      }
    }
    
    if (confidence === 0) return null;
    
    return {
      type: FailureTypes.CONTENT_BLOCK,
      confidence,
      evidence,
      message: pattern.description
    };
  }

  _checkStaleProxy(domain, statusCode, errorCode, proxyName) {
    const pattern = this._patterns[FailureTypes.STALE_PROXY];
    
    // Must have a proxy in use
    if (!proxyName) return null;
    
    const state = this._consecutiveErrors.get(domain);
    if (!state) return null;
    
    const evidence = {
      proxyName,
      consecutiveErrors: state.count,
      lastStatusCode: state.lastStatusCode,
      lastErrorCode: state.lastErrorCode
    };
    
    // Check for consecutive failures meeting threshold
    if (state.count >= pattern.consecutiveThreshold) {
      // Check if status codes or error codes match proxy failure patterns
      if (pattern.statusCodes.includes(statusCode) || 
          pattern.errorCodes.includes(errorCode)) {
        return {
          type: FailureTypes.STALE_PROXY,
          confidence: Math.min(0.6 + (state.count * 0.05), 0.95),
          evidence,
          message: pattern.description
        };
      }
    }
    
    // Check for proxy-specific errors even without hitting threshold
    if (statusCode === 407 || statusCode === 502) {
      return {
        type: FailureTypes.STALE_PROXY,
        confidence: 0.90,
        evidence,
        message: 'Proxy authentication or gateway error'
      };
    }
    
    return null;
  }

  _checkLayoutChange(previousConfidence, currentConfidence) {
    const pattern = this._patterns[FailureTypes.LAYOUT_CHANGE];
    
    if (previousConfidence == null || currentConfidence == null) return null;
    if (previousConfidence <= 0) return null;
    
    const drop = (previousConfidence - currentConfidence) / previousConfidence;
    
    if (drop >= pattern.confidenceDropThreshold) {
      return {
        type: FailureTypes.LAYOUT_CHANGE,
        confidence: Math.min(0.5 + (drop * 0.5), 0.95),
        evidence: {
          previousConfidence,
          currentConfidence,
          dropPercent: (drop * 100).toFixed(1)
        },
        message: `${pattern.description} (${(drop * 100).toFixed(0)}% confidence drop)`
      };
    }
    
    return null;
  }

  _checkConnectionReset(errorCode, errorMessage) {
    const pattern = this._patterns[FailureTypes.CONNECTION_RESET];
    
    if (pattern.errorCodes.includes(errorCode)) {
      return {
        type: FailureTypes.CONNECTION_RESET,
        confidence: 0.95,
        evidence: { errorCode },
        message: pattern.description
      };
    }
    
    return null;
  }

  _checkTimeout(errorCode, errorMessage) {
    const pattern = this._patterns[FailureTypes.TIMEOUT];
    let confidence = 0;
    const evidence = { errorCode };
    
    if (pattern.errorCodes.includes(errorCode)) {
      confidence = 0.95;
    }
    
    // Check error message patterns
    if (confidence === 0 && pattern.errorPatterns) {
      for (const p of pattern.errorPatterns) {
        if (p.test(errorMessage)) {
          evidence.matchedPattern = p.source;
          confidence = 0.85;
          break;
        }
      }
    }
    
    if (confidence === 0) return null;
    
    return {
      type: FailureTypes.TIMEOUT,
      confidence,
      evidence,
      message: pattern.description
    };
  }

  _checkSslError(errorCode, errorMessage) {
    const pattern = this._patterns[FailureTypes.SSL_ERROR];
    let confidence = 0;
    const evidence = { errorCode };
    
    if (pattern.errorCodes.includes(errorCode)) {
      confidence = 0.95;
    }
    
    // Check error message patterns
    if (confidence === 0 && pattern.errorPatterns) {
      for (const p of pattern.errorPatterns) {
        if (p.test(errorMessage)) {
          evidence.matchedPattern = p.source;
          confidence = 0.80;
          break;
        }
      }
    }
    
    if (confidence === 0) return null;
    
    return {
      type: FailureTypes.SSL_ERROR,
      confidence,
      evidence,
      message: pattern.description
    };
  }

  _checkAuthRequired(statusCode, body) {
    const pattern = this._patterns[FailureTypes.AUTH_REQUIRED];
    const evidence = { statusCode, matchedPatterns: [] };
    let confidence = 0;

    // Direct status code match (401, 402, 407)
    if (pattern.statusCodes.includes(statusCode)) {
      confidence = 0.99;
      evidence.statusMatch = true;
    }

    // Check body for paywall / login patterns even on other status codes
    if (body && pattern.bodyPatterns) {
      for (const p of pattern.bodyPatterns) {
        if (p.test(body)) {
          evidence.matchedPatterns.push(p.source);
          confidence = Math.max(confidence, 0.75);
        }
      }
    }

    if (confidence === 0) return null;

    return {
      type: FailureTypes.AUTH_REQUIRED,
      confidence,
      evidence,
      message: pattern.description
    };
  }

  _checkServerError(statusCode, body, errorMessage) {
    const pattern = this._patterns[FailureTypes.SERVER_ERROR];
    const evidence = { statusCode, matchedPatterns: [] };
    let confidence = 0;

    // Direct status code match (500-504)
    if (pattern.statusCodes.includes(statusCode)) {
      confidence = 0.90;
      evidence.statusMatch = true;
    }

    // Also match on generic 5xx range
    if (statusCode >= 500 && statusCode < 600) {
      confidence = Math.max(confidence, 0.85);
      evidence.statusRange = '5xx';
    }

    // Check body for server error patterns
    if (body && pattern.bodyPatterns) {
      for (const p of pattern.bodyPatterns) {
        if (p.test(body)) {
          evidence.matchedPatterns.push(p.source);
          confidence = Math.max(confidence, 0.80);
        }
      }
    }

    if (confidence === 0) return null;

    return {
      type: FailureTypes.SERVER_ERROR,
      confidence,
      evidence,
      message: pattern.description
    };
  }
}

module.exports = {
  DiagnosticEngine,
  FailureTypes,
  DETECTION_PATTERNS
};
