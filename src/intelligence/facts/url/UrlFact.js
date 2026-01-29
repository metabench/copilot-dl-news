'use strict';

const { FactBase } = require('../FactBase');

/**
 * UrlFact - Base class for facts extracted from URL strings alone
 * 
 * URL facts are the cheapest to compute - they require only the URL string,
 * no network requests or HTML parsing. They should be computed first and
 * can be used to short-circuit expensive document analysis.
 * 
 * Input Requirements: ['url']
 * 
 * Common URL facts:
 * - url.hasDateSegment      - /2024/01/15/ pattern in path
 * - url.hasSlugPattern      - human-readable-slug pattern
 * - url.hasNumericId        - /article/12345 pattern
 * - url.hasNewsKeyword      - /news/, /story/, /article/ in path
 * - url.hasFileExtension    - ends with .html, .php, etc.
 * - url.hasQueryParams      - has query string
 * - url.pathDepth           - number of path segments (converted to fact: pathDepth.gt3, etc.)
 * - url.isHomepage          - path is / or /index.*
 * 
 * @example
 * class HasDateSegment extends UrlFact {
 *   constructor() {
 *     super({
 *       name: 'url.hasDateSegment',
 *       description: 'URL path contains a date pattern like /2024/01/15/'
 *     });
 *   }
 *   
 *   extract(input) {
 *     const url = this.parseUrl(input);
 *     const match = url.pathname.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
 *     return this.createFact(!!match, {
 *       pattern: match?.[0],
 *       year: match?.[1],
 *       month: match?.[2],
 *       day: match?.[3]
 *     });
 *   }
 * }
 */
class UrlFact extends FactBase {
  /**
   * @param {Object} options - Fact configuration
   * @param {string} options.name - Unique fact identifier (should start with 'url.')
   * @param {string} options.description - Human-readable description
   */
  constructor(options = {}) {
    super({
      ...options,
      category: 'url',
      requires: ['url']
    });
  }
  
  /**
   * Parse and normalize a URL string
   * 
   * @protected
   * @param {string|URL|Object} input - URL string, URL object, or {url: string}
   * @returns {URL} Parsed URL object
   */
  parseUrl(input) {
    if (input instanceof URL) {
      return input;
    }
    
    const urlString = typeof input === 'string' ? input : input?.url;
    
    if (!urlString) {
      throw new Error('URL input is required');
    }
    
    try {
      return new URL(urlString);
    } catch (e) {
      throw new Error(`Invalid URL: ${urlString}`);
    }
  }
  
  /**
   * Get normalized path segments (non-empty)
   * 
   * @protected
   * @param {URL} url - Parsed URL
   * @returns {string[]} Path segments
   */
  getPathSegments(url) {
    return url.pathname
      .split('/')
      .filter(segment => segment.length > 0);
  }
  
  /**
   * Check if path matches a regex pattern
   * 
   * @protected
   * @param {URL} url - Parsed URL
   * @param {RegExp} pattern - Pattern to match
   * @returns {RegExpMatchArray|null} Match result
   */
  matchPath(url, pattern) {
    return url.pathname.match(pattern);
  }
  
  /**
   * Check if any segment matches a pattern
   * 
   * @protected
   * @param {URL} url - Parsed URL
   * @param {RegExp} pattern - Pattern to match against each segment
   * @returns {string|null} First matching segment or null
   */
  findMatchingSegment(url, pattern) {
    return this.getPathSegments(url).find(seg => pattern.test(seg)) || null;
  }
  
  /**
   * Get the file extension from URL path
   * 
   * @protected
   * @param {URL} url - Parsed URL
   * @returns {string|null} Extension without dot (e.g., 'html') or null
   */
  getExtension(url) {
    const match = url.pathname.match(/\.([a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : null;
  }
  
  /**
   * Get the last path segment (often the slug)
   * 
   * @protected
   * @param {URL} url - Parsed URL
   * @returns {string|null} Last segment or null if path is /
   */
  getLastSegment(url) {
    const segments = this.getPathSegments(url);
    return segments.length > 0 ? segments[segments.length - 1] : null;
  }
}

module.exports = { UrlFact };
