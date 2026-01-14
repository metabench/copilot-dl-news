/**
 * NewsWebsiteService.js
 * Service facade for news website operations
 * 
 * Responsibilities:
 * - Wrap database operations with business logic
 * - Maintain statistics cache consistency
 * - Provide high-level operations for news websites
 * 
 * Design:
 * - Database layer stays pure (just SQL operations)
 * - This service handles cache updates and coordination
 * - Single responsibility: news website domain logic
 */

const NewsWebsiteStatsCache = require('./NewsWebsiteStatsCache');

class NewsWebsiteService {
  /**
   * @param {NewsDatabase} db - Database instance
   */
  constructor(db) {
    this.db = db;
    this.statsCache = new NewsWebsiteStatsCache(db);
  }

  /**
   * Save an article and update statistics cache
   * @param {Object} article - Article data
   * @returns {Object} Database result
   */
  upsertArticle(article) {
    // Pure database operation
    const result = this.db.upsertArticle(article);
    
    // Update cache with article metadata
    try {
      this.statsCache.onArticleCrawled(article.url, {
        crawled_at: article.crawled_at,
        date: article.date,
        title: article.title,
        html_length: article.html ? article.html.length : 0
      });
    } catch (err) {
      // Non-fatal - cache can be rebuilt manually if needed
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[NewsWebsiteService] Failed to update stats cache after article:', err.message);
      }
    }
    
    return result;
  }

  /**
   * Record a fetch result and update statistics cache
   * @param {Object} fetchRow - Fetch metadata
   * @returns {Object} Database result
   */
  insertFetch(fetchRow) {
    // Pure database operation
    const result = this.db.insertFetch(fetchRow);
    
    // Update cache with fetch metadata
    try {
      this.statsCache.onFetchCompleted(fetchRow.url, {
        http_status: fetchRow.http_status,
        fetched_at: fetchRow.fetched_at,
        total_ms: fetchRow.total_ms,
        bytes_downloaded: fetchRow.bytes_downloaded,
        classification: fetchRow.classification
      });
    } catch (err) {
      // Non-fatal - cache can be rebuilt manually if needed
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[NewsWebsiteService] Failed to update stats cache after fetch:', err.message);
      }
    }
    
    return result;
  }

  /**
   * Add a new news website and initialize its cache
   * @param {Object} websiteData - Website data
   * @returns {number} Website ID
   */
  addNewsWebsite(websiteData) {
    // Pure database operation
    const id = this.db.addNewsWebsite(websiteData);
    
    // Initialize cache for new website
    try {
      this.statsCache.initializeCache(id);
    } catch (err) {
      // Non-fatal - cache can be rebuilt later
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[NewsWebsiteService] Failed to initialize cache for new website:', err.message);
      }
    }
    
    return id;
  }

  /**
   * Get all news websites with cached statistics
   * @param {boolean} enabledOnly - Filter to enabled websites only
   * @returns {Array} Websites with stats
   */
  getNewsWebsitesWithStats(enabledOnly = true) {
    return this.db.getNewsWebsitesWithStats(enabledOnly);
  }

  /**
   * Get enhanced statistics for a news website
   * @param {number} id - Website ID
   * @param {boolean} useCache - Whether to use cache (default true)
   * @returns {Object} Website with stats
   */
  getNewsWebsiteEnhancedStats(id, useCache = true) {
    return this.db.getNewsWebsiteEnhancedStats(id, useCache);
  }

  /**
   * Rebuild cache for a specific website
   * @param {number} id - Website ID
   */
  rebuildCache(id) {
    this.statsCache.initializeCache(id);
  }

  /**
   * Rebuild caches for all websites
   * @returns {Object} Result summary
   */
  rebuildAllCaches() {
    return this.statsCache.rebuildAll();
  }

  /**
   * Delete a news website (cascade deletes cache automatically)
   * @param {number} id - Website ID
   */
  deleteNewsWebsite(id) {
    return this.db.deleteNewsWebsite(id);
  }

  /**
   * Update enabled status for a news website
   * @param {number} id - Website ID
   * @param {boolean} enabled - Enabled state
   */
  setNewsWebsiteEnabled(id, enabled) {
    return this.db.setNewsWebsiteEnabled(id, enabled);
  }
}

module.exports = NewsWebsiteService;

