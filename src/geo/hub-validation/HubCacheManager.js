/**
 * HubCacheManager - Article caching and retrieval logic
 *
 * Extracted from HubValidator to handle cached article retrieval
 * from both legacy articles table and normalized HTTP responses.
 */

const { getHubValidationCachedArticle } = require('news-crawler-db');

class HubCacheManager {
  constructor(db) {
    this.db = db;
  }

  /**
   * Check if we have a cached version of the URL
   * @param {string} url - URL to check
   * @returns {Object|null} - Article record or null
   */
  getCachedArticle(url) {
    return getHubValidationCachedArticle(this.db, url);
  }
}

module.exports = { HubCacheManager };
