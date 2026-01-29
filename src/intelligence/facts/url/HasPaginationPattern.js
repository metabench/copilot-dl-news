'use strict';

const { UrlFact } = require('./UrlFact');

/**
 * HasPaginationPattern - Detects pagination patterns in URLs
 * 
 * Fact: url.hasPaginationPattern
 * 
 * This is a neutral structural observation - pagination is neither
 * positive nor negative, it's simply a characteristic of the URL.
 * 
 * Patterns detected:
 * - /page/2, /page/3, etc. (path segment)
 * - ?page=2, ?p=2 (query parameter)
 * - /2/, /3/ (trailing numeric segment in some CMS patterns)
 * - ?offset=10, ?start=20 (offset-based pagination)
 * 
 * @example
 * const fact = new HasPaginationPattern();
 * fact.extract('https://news.com/category/tech?page=2');
 * // => { name: 'url.hasPaginationPattern', value: true, evidence: { type: 'query', param: 'page', value: '2' } }
 */
class HasPaginationPattern extends UrlFact {
  constructor() {
    super({
      name: 'url.hasPaginationPattern',
      description: 'URL contains pagination indicators (page numbers, offsets)'
    });
    
    /**
     * Query parameters that indicate pagination
     * @type {Set<string>}
     */
    this.paginationParams = new Set([
      'page',
      'p',
      'pg',
      'paged',
      'offset',
      'start',
      'skip',
      'from',
      'pagenum',
      'page_num',
      'pagenumber'
    ]);
    
    /**
     * Path segment patterns for pagination
     * @type {RegExp[]}
     */
    this.pathPatterns = [
      // /page/2, /page/3, etc.
      /\/page\/(\d+)\/?$/i,
      // /p/2, /p/3 (short form)
      /\/p\/(\d+)\/?$/i,
      // Some sites use just /2/, /3/ at the end
      /\/(\d+)\/?$/
    ];
  }
  
  /**
   * Extract the pagination pattern fact
   * 
   * @param {string|URL|Object} input - URL to analyze
   * @returns {FactResult}
   */
  extract(input) {
    const url = this.parseUrl(input);
    
    // Check query parameters first (most common)
    for (const [param, value] of url.searchParams) {
      if (this.paginationParams.has(param.toLowerCase())) {
        // Must be numeric to be pagination
        if (/^\d+$/.test(value)) {
          return this.createFact(true, {
            type: 'query',
            param,
            value,
            pageNumber: parseInt(value, 10)
          });
        }
      }
    }
    
    // Check path patterns
    for (const pattern of this.pathPatterns) {
      const match = url.pathname.match(pattern);
      if (match) {
        const pageNum = parseInt(match[1], 10);
        // Avoid false positives: page 1 is often not pagination, just the default
        // Also avoid matching years (1900-2100) or other large numbers
        if (pageNum > 1 && pageNum < 1000) {
          return this.createFact(true, {
            type: 'path',
            pattern: pattern.toString(),
            value: match[1],
            pageNumber: pageNum
          });
        }
      }
    }
    
    return this.createFact(false, { reason: 'No pagination pattern detected' });
  }
}

module.exports = { HasPaginationPattern };
