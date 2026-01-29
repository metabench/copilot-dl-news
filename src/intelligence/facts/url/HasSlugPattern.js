'use strict';

const { UrlFact } = require('./UrlFact');

/**
 * HasSlugPattern - Detects human-readable URL slugs
 * 
 * Fact: url.hasSlugPattern
 * 
 * A "slug" is a human-readable URL segment, typically derived from an article title.
 * Characteristics of slugs:
 * - Contains multiple words separated by hyphens or underscores
 * - Words are lowercase alphanumeric
 * - Usually 3+ words (distinguishes from simple category names)
 * - Found as the final path segment (the article identifier)
 * 
 * Examples of slugs:
 * - breaking-news-mayor-announces-new-policy
 * - climate-change-summit-reaches-agreement
 * - tech-giant-unveils-latest-smartphone
 * 
 * NOT slugs:
 * - news (single word = likely category)
 * - 12345 (numeric = likely ID)
 * - index.html (file reference)
 * 
 * @example
 * const fact = new HasSlugPattern();
 * fact.extract('https://news.com/2024/01/15/mayor-announces-new-policy');
 * // => { name: 'url.hasSlugPattern', value: true, evidence: { slug: 'mayor-announces-new-policy', wordCount: 4 } }
 */
class HasSlugPattern extends UrlFact {
  constructor() {
    super({
      name: 'url.hasSlugPattern',
      description: 'URL path ends with a human-readable slug (hyphenated words)'
    });
    
    /**
     * Minimum words in slug to distinguish from simple names
     * @type {number}
     */
    this.minWords = 3;
    
    /**
     * Pattern for individual slug words
     * @type {RegExp}
     */
    this.wordPattern = /^[a-z0-9]+$/i;
    
    /**
     * Common file extensions to strip before analysis
     * @type {RegExp}
     */
    this.extensionPattern = /\.(html?|php|aspx?|jsp)$/i;
  }
  
  /**
   * Extract the slug pattern fact
   * 
   * @param {string|URL|Object} input - URL to analyze
   * @returns {FactResult}
   */
  extract(input) {
    const url = this.parseUrl(input);
    let lastSegment = this.getLastSegment(url);
    
    if (!lastSegment) {
      return this.createFact(false, { reason: 'No path segments' });
    }
    
    // Strip common extensions
    lastSegment = lastSegment.replace(this.extensionPattern, '');
    
    // Try hyphen-separated first (most common)
    let words = lastSegment.split('-');
    let separator = '-';
    
    // Fall back to underscore if no hyphens
    if (words.length < this.minWords) {
      const underscoreWords = lastSegment.split('_');
      if (underscoreWords.length >= this.minWords) {
        words = underscoreWords;
        separator = '_';
      }
    }
    
    // Filter to valid words only
    const validWords = words.filter(w => this.wordPattern.test(w) && w.length >= 2);
    
    // Check if it's a slug pattern
    if (validWords.length >= this.minWords) {
      return this.createFact(true, {
        slug: lastSegment,
        separator,
        wordCount: validWords.length,
        words: validWords
      });
    }
    
    // Check for specific failure reasons
    if (words.length < this.minWords) {
      return this.createFact(false, { 
        reason: `Too few words (${words.length} < ${this.minWords})`,
        segment: lastSegment
      });
    }
    
    return this.createFact(false, { 
      reason: 'Does not match slug pattern',
      segment: lastSegment
    });
  }
}

module.exports = { HasSlugPattern };
