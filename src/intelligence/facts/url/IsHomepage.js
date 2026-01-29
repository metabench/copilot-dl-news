'use strict';

const { UrlFact } = require('./UrlFact');

/**
 * IsHomepage - Detects if URL is a homepage or index page
 * 
 * Fact: url.isHomepage
 * 
 * Homepages are NOT articles. This is a negative indicator.
 * 
 * Patterns detected:
 * - / (root path)
 * - /index.html
 * - /index.htm
 * - /index.php
 * - /default.aspx
 * - /home
 * - /home/
 * 
 * @example
 * const fact = new IsHomepage();
 * fact.extract('https://news.example.com/');
 * // => { name: 'url.isHomepage', value: true, evidence: { pattern: 'root' } }
 */
class IsHomepage extends UrlFact {
  constructor() {
    super({
      name: 'url.isHomepage',
      description: 'URL is a homepage or index page (not an article)'
    });
    
    /**
     * Index file patterns
     * @type {RegExp[]}
     */
    this.indexPatterns = [
      /^\/?(index|default|home)\.(html?|php|aspx?|jsp)$/i,
      /^\/?(index|default|home)\/?$/i,
      /^\/?$/  // Root path
    ];
  }
  
  /**
   * Extract the homepage fact
   * 
   * @param {string|URL|Object} input - URL to analyze
   * @returns {FactResult}
   */
  extract(input) {
    const url = this.parseUrl(input);
    const path = url.pathname;
    
    // Check root path first
    if (path === '/' || path === '') {
      return this.createFact(true, { 
        pattern: 'root',
        path
      });
    }
    
    // Check index patterns
    for (const pattern of this.indexPatterns) {
      if (pattern.test(path)) {
        return this.createFact(true, {
          pattern: 'index',
          path,
          matchedPattern: pattern.toString()
        });
      }
    }
    
    return this.createFact(false, { 
      reason: 'Path does not match homepage patterns',
      path
    });
  }
}

module.exports = { IsHomepage };
