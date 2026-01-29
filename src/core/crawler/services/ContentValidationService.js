/**
 * ContentValidationService
 * 
 * Filters "garbage" content (e.g., "Please enable JS", "Access Denied", empty body)
 * before it pollutes the database. Part of Phase 1: Foundation.
 * 
 * @see docs/designs/RELIABLE_CRAWLER_PHASE_1_SPEC.md
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether the content passes validation
 * @property {string} [reason] - Rejection reason if invalid
 * @property {'hard'|'soft'|null} [failureType] - 'hard' = stop domain, 'soft' = re-queue for Puppeteer
 * @property {Object} [details] - Additional context for logging
 */

/**
 * Default garbage text signatures that indicate non-content responses
 */
const DEFAULT_GARBAGE_SIGNATURES = [
  // JavaScript-required pages
  /please\s+enable\s+javascript/i,
  /javascript\s+is\s+(required|disabled)/i,
  /you\s+need\s+to\s+enable\s+javascript/i,
  /this\s+site\s+requires\s+javascript/i,
  
  // Browser verification / bot detection
  /checking\s+your\s+browser/i,
  /please\s+wait\s+while\s+we\s+verify/i,
  /verifying\s+you\s+are\s+human/i,
  /completing\s+the\s+captcha/i,
  /cloudflare/i,
  /ddos\s+protection/i,
  /ray\s+id/i,
  
  // Access denied
  /access\s+denied/i,
  /403\s+forbidden/i,
  /401\s+unauthorized/i,
  /you\s+don't\s+have\s+permission/i,
  /permission\s+denied/i,
  
  // Paywalls and subscriptions
  /subscribe\s+to\s+continue/i,
  /subscription\s+required/i,
  /please\s+log\s+in\s+to\s+continue/i,
  
  // Empty / error states
  /page\s+not\s+found/i,
  /404\s+not\s+found/i,
  /content\s+unavailable/i,
  /this\s+page\s+is\s+no\s+longer\s+available/i,
  
  // Rate limiting
  /too\s+many\s+requests/i,
  /rate\s+limit/i,
  /slow\s+down/i
];

/**
 * Signatures that indicate a "hard" failure - stop crawling this domain
 */
const HARD_FAILURE_SIGNATURES = [
  /access\s+denied/i,
  /403\s+forbidden/i,
  /401\s+unauthorized/i,
  /permission\s+denied/i,
  /ip\s+(has\s+been\s+)?blocked/i,
  /banned/i
];

/**
 * Signatures that indicate a "soft" failure - try with Puppeteer later
 */
const SOFT_FAILURE_SIGNATURES = [
  /please\s+enable\s+javascript/i,
  /javascript\s+is\s+(required|disabled)/i,
  /checking\s+your\s+browser/i,
  /cloudflare/i,
  /ddos\s+protection/i
];

class ContentValidationService {
  /**
   * @param {Object} options
   * @param {number} [options.minBodyLength=500] - Minimum body length in bytes
   * @param {RegExp[]} [options.garbageSignatures] - Custom garbage text patterns
   * @param {RegExp[]} [options.hardFailureSignatures] - Custom hard failure patterns
   * @param {RegExp[]} [options.softFailureSignatures] - Custom soft failure patterns
   * @param {Object} [options.telemetry] - Telemetry service for logging rejections
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    this.minBodyLength = options.minBodyLength ?? 500;
    this.garbageSignatures = options.garbageSignatures ?? DEFAULT_GARBAGE_SIGNATURES;
    this.hardFailureSignatures = options.hardFailureSignatures ?? HARD_FAILURE_SIGNATURES;
    this.softFailureSignatures = options.softFailureSignatures ?? SOFT_FAILURE_SIGNATURES;
    this.telemetry = options.telemetry ?? null;
    this.logger = options.logger ?? console;
    
    // Stats tracking
    this._stats = {
      validated: 0,
      rejected: 0,
      hardFailures: 0,
      softFailures: 0,
      byReason: {}
    };
  }

  /**
   * Validate content before storing in the database
   * 
   * @param {Object} params
   * @param {string} params.url - The URL that was fetched
   * @param {string} params.html - The raw HTML body
   * @param {number} [params.statusCode] - HTTP status code
   * @param {Object} [params.headers] - Response headers
   * @param {Object} [params.$] - Cheerio instance (if already parsed)
   * @returns {ValidationResult}
   */
  validate({ url, html, statusCode, headers, $ }) {
    this._stats.validated++;
    
    // Check HTTP status code first
    if (statusCode && statusCode >= 400) {
      return this._reject(url, `http-${statusCode}`, 'hard', {
        statusCode,
        message: `HTTP error status: ${statusCode}`
      });
    }
    
    // Check body length
    if (!html || html.length < this.minBodyLength) {
      return this._reject(url, 'body-too-short', 'soft', {
        bodyLength: html?.length ?? 0,
        minRequired: this.minBodyLength
      });
    }
    
    // Extract text content for pattern matching
    const textContent = this._extractTextContent(html, $);
    
    // Check for garbage signatures
    for (const pattern of this.garbageSignatures) {
      if (pattern.test(textContent)) {
        const failureType = this._classifyFailure(pattern);
        const patternName = this._getPatternName(pattern);
        return this._reject(url, patternName, failureType, {
          matchedPattern: pattern.source,
          sample: this._getSample(textContent, pattern)
        });
      }
    }
    
    // Check structural validity (if $ is provided)
    if ($) {
      const structuralResult = this._validateStructure($);
      if (!structuralResult.valid) {
        return this._reject(url, structuralResult.reason, 'soft', structuralResult.details);
      }
    }
    
    return { valid: true };
  }

  /**
   * Quick check for common rejection patterns without full validation
   * Useful for early filtering in the fetch pipeline
   * 
   * @param {string} html - Raw HTML to check
   * @returns {boolean} - True if content looks suspicious
   */
  quickCheck(html) {
    if (!html || html.length < 100) return true;
    
    const sample = html.slice(0, 2000).toLowerCase();
    
    // Quick checks for common garbage indicators
    const quickPatterns = [
      'enable javascript',
      'checking your browser',
      'access denied',
      'cloudflare',
      '403 forbidden'
    ];
    
    return quickPatterns.some(p => sample.includes(p));
  }

  /**
   * Get validation statistics
   * @returns {Object}
   */
  getStats() {
    return { ...this._stats };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this._stats = {
      validated: 0,
      rejected: 0,
      hardFailures: 0,
      softFailures: 0,
      byReason: {}
    };
  }

  // --- Private methods ---

  /**
   * @private
   */
  _reject(url, reason, failureType, details) {
    this._stats.rejected++;
    this._stats.byReason[reason] = (this._stats.byReason[reason] || 0) + 1;
    
    if (failureType === 'hard') {
      this._stats.hardFailures++;
    } else if (failureType === 'soft') {
      this._stats.softFailures++;
    }
    
    // Log rejection
    if (this.telemetry) {
      try {
        this.telemetry.problem({
          kind: 'content-validation-rejected',
          scope: this._extractHost(url),
          message: `Content rejected: ${reason}`,
          details: { url, reason, failureType, ...details }
        });
      } catch (e) {
        // Telemetry should never break validation
      }
    }
    
    return {
      valid: false,
      reason,
      failureType,
      details
    };
  }

  /**
   * @private
   */
  _extractTextContent(html, $) {
    if ($) {
      try {
        // Remove script and style tags, get text
        $('script, style, noscript').remove();
        return $('body').text() || '';
      } catch (e) {
        // Fall back to regex extraction
      }
    }
    
    // Simple regex-based text extraction
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * @private
   */
  _validateStructure($) {
    try {
      // Check for meaningful content tags
      const paragraphs = $('p').length;
      const articles = $('article').length;
      const mainContent = $('main, [role="main"], .content, #content, .article, #article').length;
      
      if (paragraphs === 0 && articles === 0 && mainContent === 0) {
        return {
          valid: false,
          reason: 'no-content-structure',
          details: { paragraphs, articles, mainContent }
        };
      }
      
      // Check if page is mostly scripts
      const scripts = $('script').length;
      const totalElements = $('*').length;
      if (totalElements > 0 && scripts / totalElements > 0.5) {
        return {
          valid: false,
          reason: 'script-heavy',
          details: { scripts, totalElements, ratio: scripts / totalElements }
        };
      }
      
      return { valid: true };
    } catch (e) {
      // If structural check fails, don't reject - just pass through
      return { valid: true };
    }
  }

  /**
   * @private
   */
  _classifyFailure(pattern) {
    for (const hardPattern of this.hardFailureSignatures) {
      if (hardPattern.source === pattern.source) {
        return 'hard';
      }
    }
    for (const softPattern of this.softFailureSignatures) {
      if (softPattern.source === pattern.source) {
        return 'soft';
      }
    }
    return 'soft'; // Default to soft for unknown patterns
  }

  /**
   * @private
   */
  _getPatternName(pattern) {
    const source = pattern.source.toLowerCase();
    if (source.includes('javascript')) return 'javascript-required';
    if (source.includes('cloudflare') || source.includes('ddos')) return 'bot-protection';
    if (source.includes('403') || source.includes('denied')) return 'access-denied';
    if (source.includes('captcha') || source.includes('verify')) return 'captcha-required';
    if (source.includes('subscribe') || source.includes('log in')) return 'paywall';
    if (source.includes('404') || source.includes('not found')) return 'not-found';
    if (source.includes('rate') || source.includes('too many')) return 'rate-limited';
    return 'garbage-content';
  }

  /**
   * @private
   */
  _getSample(text, pattern) {
    const match = text.match(pattern);
    if (!match) return null;
    const index = match.index || 0;
    const start = Math.max(0, index - 50);
    const end = Math.min(text.length, index + match[0].length + 50);
    return text.slice(start, end).trim();
  }

  /**
   * @private
   */
  _extractHost(url) {
    try {
      return new URL(url).hostname;
    } catch (e) {
      return 'unknown';
    }
  }
}

module.exports = { ContentValidationService };
