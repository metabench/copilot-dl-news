'use strict';

const { UrlFact } = require('./UrlFact');

/**
 * HasNewsKeyword - Detects news-related keywords in URL path
 * 
 * Fact: url.hasNewsKeyword
 * 
 * Checks if the URL path contains common news-related path segments.
 * These indicate the URL is in a news/article section of the site.
 * 
 * Keywords detected (as path segments):
 * - /news/
 * - /article/
 * - /story/
 * - /post/
 * - /blog/
 * - /press/
 * - /press-release/
 * - /stories/
 * - /articles/
 * 
 * Note: These must be complete path segments, not substrings.
 * "/newsroom/" would NOT match "/news/" but "/news/" would.
 * 
 * @example
 * const fact = new HasNewsKeyword();
 * fact.extract('https://example.com/news/2024/story-title');
 * // => { name: 'url.hasNewsKeyword', value: true, evidence: { keyword: 'news', position: 1 } }
 */
class HasNewsKeyword extends UrlFact {
  constructor() {
    super({
      name: 'url.hasNewsKeyword',
      description: 'URL path contains a news-related segment like /news/, /article/, /story/'
    });
    
    /**
     * News-related keywords to detect (lowercase)
     * @type {Set<string>}
     */
    this.keywords = new Set([
      'news',
      'article',
      'articles',
      'story',
      'stories',
      'post',
      'posts',
      'blog',
      'press',
      'press-release',
      'press-releases',
      'breaking',
      'latest',
      'opinion',
      'editorial',
      'editorials',
      'column',
      'columns',
      'feature',
      'features',
      'report',
      'reports',
      'update',
      'updates',
      'headline',
      'headlines'
    ]);
  }
  
  /**
   * Extract the news keyword fact
   * 
   * @param {string|URL|Object} input - URL to analyze
   * @returns {FactResult}
   */
  extract(input) {
    const url = this.parseUrl(input);
    const segments = this.getPathSegments(url);
    
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i].toLowerCase();
      
      if (this.keywords.has(segment)) {
        return this.createFact(true, {
          keyword: segment,
          position: i,
          segment: segments[i]
        });
      }
    }
    
    return this.createFact(false, { 
      reason: 'No news keywords found in path segments',
      segments
    });
  }
}

module.exports = { HasNewsKeyword };
