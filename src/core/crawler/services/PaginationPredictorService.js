'use strict';

const { URL } = require('url');
const EventEmitter = require('events');

/**
 * PaginationPredictorService - Detects and speculatively crawls pagination.
 * 
 * Detects pagination patterns like:
 * - ?page=N, ?p=N, ?pg=N
 * - /page/N, /p/N, /pg/N
 * - ?offset=N, ?start=N
 * - ?after=token (cursor-based)
 * 
 * Speculation strategy:
 * - If page 1 is crawled and has content, speculatively generate page 2
 * - If speculative crawl succeeds, generate page N+1
 * - If speculative crawl returns 404 or empty, mark pattern as exhausted
 * 
 * @extends EventEmitter
 */
class PaginationPredictorService extends EventEmitter {
  /**
   * @param {Object} options
   * @param {Object} [options.telemetry] - Telemetry emitter
   * @param {Object} [options.logger] - Logger instance
   * @param {number} [options.maxSpeculativePages=5] - Max pages to speculate beyond known
   * @param {number} [options.patternTtlMs=3600000] - How long to remember patterns (1 hour)
   */
  constructor(options = {}) {
    super();
    
    this.telemetry = options.telemetry || null;
    this.logger = options.logger || console;
    this.maxSpeculativePages = options.maxSpeculativePages ?? 5;
    this.patternTtlMs = options.patternTtlMs ?? 60 * 60 * 1000;
    
    // Known pagination patterns per base path
    // Key: basePath (e.g., "https://example.com/news")
    // Value: { pattern, maxPage, exhausted, lastSeen, speculated }
    this._patterns = new Map();
    
    // Statistics
    this._stats = {
      patternsDetected: 0,
      speculativeGenerated: 0,
      speculativeSucceeded: 0,
      speculativeFailed: 0,
      exhaustedPatterns: 0
    };
  }

  /**
   * Detect pagination pattern from a URL.
   * 
   * @param {string} url - URL to analyze
   * @returns {{ detected: boolean, pattern: Object|null, basePath: string|null, pageNum: number|null }}
   */
  detectPattern(url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      return { detected: false, pattern: null, basePath: null, pageNum: null };
    }
    
    // Query parameter patterns
    const queryPatterns = [
      { param: 'page', type: 'query-page' },
      { param: 'p', type: 'query-p' },
      { param: 'pg', type: 'query-pg' },
      { param: 'paged', type: 'query-paged' },
      { param: 'offset', type: 'query-offset', multiplier: true },
      { param: 'start', type: 'query-start', multiplier: true }
    ];
    
    for (const { param, type, multiplier } of queryPatterns) {
      const value = parsed.searchParams.get(param);
      if (value && /^\d+$/.test(value)) {
        const pageNum = parseInt(value, 10);
        // Create base path without the pagination param
        const baseParams = new URLSearchParams(parsed.searchParams);
        baseParams.delete(param);
        const baseQuery = baseParams.toString();
        const basePath = `${parsed.origin}${parsed.pathname}${baseQuery ? '?' + baseQuery : ''}`;
        
        return {
          detected: true,
          pattern: { type, param, multiplier: !!multiplier },
          basePath,
          pageNum
        };
      }
    }
    
    // Path-based patterns
    const pathPatterns = [
      { regex: /\/page\/(\d+)\/?$/, type: 'path-page' },
      { regex: /\/p\/(\d+)\/?$/, type: 'path-p' },
      { regex: /\/pg\/(\d+)\/?$/, type: 'path-pg' },
      { regex: /\/(\d+)\/?$/, type: 'path-numeric' }
    ];
    
    for (const { regex, type } of pathPatterns) {
      const match = parsed.pathname.match(regex);
      if (match) {
        const pageNum = parseInt(match[1], 10);
        const basePath = `${parsed.origin}${parsed.pathname.replace(regex, '')}`;
        
        return {
          detected: true,
          pattern: { type, regex: regex.source },
          basePath,
          pageNum
        };
      }
    }
    
    return { detected: false, pattern: null, basePath: null, pageNum: null };
  }

  /**
   * Analyze links on a page to detect pagination patterns.
   * 
   * @param {string} currentUrl - Current page URL
   * @param {string[]} links - Links found on the page
   * @returns {{ detected: boolean, patterns: Object[], maxPage: number }}
   */
  analyzePageLinks(currentUrl, links) {
    let parsed;
    try {
      parsed = new URL(currentUrl);
    } catch (e) {
      return { detected: false, patterns: [], maxPage: 0 };
    }
    
    const origin = parsed.origin;
    const pathname = parsed.pathname;
    const detectedPatterns = new Map();
    let maxPage = 0;
    
    for (const link of links) {
      // Only analyze same-origin links
      if (!link.startsWith(origin) && !link.startsWith('/')) continue;
      
      const detection = this.detectPattern(link.startsWith('/') ? `${origin}${link}` : link);
      if (detection.detected) {
        const key = `${detection.pattern.type}:${detection.basePath}`;
        const existing = detectedPatterns.get(key);
        
        if (!existing || detection.pageNum > existing.maxPage) {
          detectedPatterns.set(key, {
            ...detection.pattern,
            basePath: detection.basePath,
            maxPage: Math.max(existing?.maxPage || 0, detection.pageNum)
          });
        }
        maxPage = Math.max(maxPage, detection.pageNum);
      }
    }
    
    return {
      detected: detectedPatterns.size > 0,
      patterns: Array.from(detectedPatterns.values()),
      maxPage
    };
  }

  /**
   * Record a successful page visit and update pattern state.
   * 
   * @param {string} url - URL that was successfully crawled
   * @param {Object} result - Crawl result
   * @param {boolean} result.hasContent - Whether the page had meaningful content
   * @param {string[]} [result.links] - Links found on the page
   */
  recordVisit(url, result) {
    const detection = this.detectPattern(url);
    if (!detection.detected) return;
    
    const { basePath, pattern, pageNum } = detection;
    let state = this._patterns.get(basePath);
    
    if (!state) {
      state = {
        pattern,
        maxPage: pageNum,
        exhausted: false,
        lastSeen: Date.now(),
        speculated: 0,
        failures: 0
      };
      this._patterns.set(basePath, state);
      this._stats.patternsDetected++;
      
      this.emit('pattern-detected', { basePath, pattern, pageNum });
    } else {
      state.maxPage = Math.max(state.maxPage, pageNum);
      state.lastSeen = Date.now();
    }
    
    // Analyze links if provided
    if (result.links && result.links.length > 0) {
      const linkAnalysis = this.analyzePageLinks(url, result.links);
      if (linkAnalysis.maxPage > state.maxPage) {
        state.maxPage = linkAnalysis.maxPage;
      }
    }
    
    // If this was a speculative page and it had content, mark as successful
    if (pageNum > state.maxPage - this.maxSpeculativePages) {
      if (result.hasContent) {
        this._stats.speculativeSucceeded++;
      }
    }
  }

  /**
   * Record a failed speculative crawl.
   * 
   * @param {string} url - URL that failed
   * @param {string} reason - Failure reason ('404', 'empty', 'error')
   */
  recordFailure(url, reason) {
    const detection = this.detectPattern(url);
    if (!detection.detected) return;
    
    const { basePath, pageNum } = detection;
    const state = this._patterns.get(basePath);
    
    if (state) {
      state.failures++;
      this._stats.speculativeFailed++;
      
      // If we hit 404 or empty content, mark pattern as exhausted at this page
      if (reason === '404' || reason === 'empty') {
        state.exhausted = true;
        state.exhaustedAt = pageNum;
        this._stats.exhaustedPatterns++;
        
        this.emit('pattern-exhausted', { basePath, pageNum, reason });
      }
    }
  }

  /**
   * Generate speculative page URLs for a base path.
   * 
   * @param {string} basePath - The base path to generate pages for
   * @param {Object} [options] - Options
   * @param {number} [options.limit] - Max pages to generate
   * @param {Set<string>} [options.knownUrls] - URLs to exclude
   * @returns {string[]} Speculative URLs
   */
  generateSpeculative(basePath, options = {}) {
    const state = this._patterns.get(basePath);
    if (!state || state.exhausted) return [];
    
    const limit = options.limit ?? this.maxSpeculativePages;
    const knownUrls = options.knownUrls || new Set();
    const speculative = [];
    
    const startPage = state.maxPage + 1;
    const endPage = startPage + limit; // exclusive end
    
    for (let page = startPage; page < endPage; page++) {
      const url = this._buildPageUrl(basePath, state.pattern, page);
      if (url && !knownUrls.has(url)) {
        speculative.push(url);
      }
    }
    
    state.speculated += speculative.length;
    this._stats.speculativeGenerated += speculative.length;
    
    return speculative;
  }

  /**
   * Generate speculative URLs for all known patterns.
   * 
   * @param {Object} [options] - Options
   * @param {Set<string>} [options.knownUrls] - URLs to exclude
   * @param {number} [options.limitPerPattern=2] - Max pages per pattern
   * @returns {Array<{ url: string, basePath: string, type: string }>}
   */
  generateAllSpeculative(options = {}) {
    const knownUrls = options.knownUrls || new Set();
    const limitPerPattern = options.limitPerPattern ?? 2;
    const results = [];
    
    for (const [basePath, state] of this._patterns) {
      if (state.exhausted) continue;
      
      // Skip stale patterns
      if (Date.now() - state.lastSeen > this.patternTtlMs) continue;
      
      const urls = this.generateSpeculative(basePath, {
        limit: limitPerPattern,
        knownUrls
      });
      
      for (const url of urls) {
        results.push({
          url,
          basePath,
          type: state.pattern.type,
          source: 'pagination-speculation'
        });
      }
    }
    
    return results;
  }

  /**
   * Build a page URL from base path and pattern.
   * 
   * @private
   * @param {string} basePath - Base path
   * @param {Object} pattern - Pattern definition
   * @param {number} pageNum - Page number
   * @returns {string|null}
   */
  _buildPageUrl(basePath, pattern, pageNum) {
    try {
      const parsed = new URL(basePath);
      
      if (pattern.type.startsWith('query-')) {
        const param = pattern.param;
        parsed.searchParams.set(param, pageNum.toString());
        return parsed.toString();
      }
      
      if (pattern.type === 'path-page') {
        return `${basePath}/page/${pageNum}`;
      }
      
      if (pattern.type === 'path-p') {
        return `${basePath}/p/${pageNum}`;
      }
      
      if (pattern.type === 'path-pg') {
        return `${basePath}/pg/${pageNum}`;
      }
      
      if (pattern.type === 'path-numeric') {
        return `${basePath}/${pageNum}`;
      }
      
      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Get pattern state for a base path.
   * 
   * @param {string} basePath - Base path
   * @returns {Object|null}
   */
  getPatternState(basePath) {
    return this._patterns.get(basePath) || null;
  }

  /**
   * Get all known patterns.
   * 
   * @returns {Array<{ basePath: string, state: Object }>}
   */
  getAllPatterns() {
    const results = [];
    for (const [basePath, state] of this._patterns) {
      results.push({ basePath, state: { ...state } });
    }
    return results;
  }

  /**
   * Get statistics.
   * 
   * @returns {Object}
   */
  getStats() {
    return {
      ...this._stats,
      activePatterns: this._patterns.size,
      exhaustedPatterns: Array.from(this._patterns.values()).filter(s => s.exhausted).length
    };
  }

  /**
   * Clean up stale patterns.
   */
  cleanup() {
    const now = Date.now();
    for (const [basePath, state] of this._patterns) {
      if (now - state.lastSeen > this.patternTtlMs) {
        this._patterns.delete(basePath);
      }
    }
  }

  /**
   * Reset all state.
   */
  reset() {
    this._patterns.clear();
    this._stats = {
      patternsDetected: 0,
      speculativeGenerated: 0,
      speculativeSucceeded: 0,
      speculativeFailed: 0,
      exhaustedPatterns: 0
    };
  }
}

module.exports = { PaginationPredictorService };
