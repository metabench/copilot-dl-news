/**
 * News Website Statistics Cache Manager
 * 
 * Precomputes and caches expensive statistics for news websites.
 * Updates happen incrementally during normal operations (crawls, fetches, analysis).
 * 
 * Benefits:
 * - Fast queries: All stats cached in a single table
 * - Incremental updates: No need to scan entire tables
 * - Real-time: Updates as operations occur
 * - Low overhead: Delta updates only
 */

const { tof } = require('lang-tools');

class NewsWebsiteStatsCache {
  /**
   * @param {NewsDatabase} db - Database instance
   */
  constructor(db) {
    this.db = db;
    this._ensureTables();
  }

  /**
   * Ensure statistics cache table exists
   * @private
   */
  _ensureTables() {
    this.db.db.exec(`
      CREATE TABLE IF NOT EXISTS news_websites_stats_cache (
        website_id INTEGER PRIMARY KEY,
        
        -- Article statistics
        article_count INTEGER DEFAULT 0,
        article_latest_date TEXT,
        article_latest_crawled_at TEXT,
        article_first_seen_at TEXT,
        
        -- Fetch statistics  
        fetch_count INTEGER DEFAULT 0,
        fetch_ok_count INTEGER DEFAULT 0,
        fetch_error_count INTEGER DEFAULT 0,
        fetch_last_at TEXT,
        fetch_first_at TEXT,
        
        -- HTTP status distribution (top 5)
        status_200_count INTEGER DEFAULT 0,
        status_404_count INTEGER DEFAULT 0,
        status_403_count INTEGER DEFAULT 0,
        status_500_count INTEGER DEFAULT 0,
        status_503_count INTEGER DEFAULT 0,
        
        -- Content statistics
        avg_article_size_bytes INTEGER DEFAULT 0,
        total_content_bytes INTEGER DEFAULT 0,
        
        -- Crawl performance
        avg_fetch_time_ms INTEGER DEFAULT 0,
        successful_crawls INTEGER DEFAULT 0,
        failed_crawls INTEGER DEFAULT 0,
        
        -- Time statistics
        last_updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        cache_version INTEGER DEFAULT 1,
        
        FOREIGN KEY (website_id) REFERENCES news_websites(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_news_websites_stats_updated 
        ON news_websites_stats_cache(last_updated_at);
    `);
  }

  /**
   * Initialize cache for a news website (full scan)
   * @param {number} websiteId - Website ID
   * @returns {Object} - Statistics object
   */
  initializeCache(websiteId) {
    const website = this.db.getNewsWebsite(websiteId);
    if (!website) {
      throw new Error(`News website ${websiteId} not found`);
    }

    const pattern = website.url_pattern;
    const stats = this._computeFullStats(pattern);
    
    // Upsert into cache
    this.db.db.prepare(`
      INSERT OR REPLACE INTO news_websites_stats_cache (
        website_id,
        article_count, article_latest_date, article_latest_crawled_at, article_first_seen_at,
        fetch_count, fetch_ok_count, fetch_error_count, fetch_last_at, fetch_first_at,
        status_200_count, status_404_count, status_403_count, status_500_count, status_503_count,
        avg_article_size_bytes, total_content_bytes,
        avg_fetch_time_ms, successful_crawls, failed_crawls,
        last_updated_at
      ) VALUES (
        ?, 
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?,
        CURRENT_TIMESTAMP
      )
    `).run(
      websiteId,
      stats.article_count, stats.article_latest_date, stats.article_latest_crawled_at, stats.article_first_seen_at,
      stats.fetch_count, stats.fetch_ok_count, stats.fetch_error_count, stats.fetch_last_at, stats.fetch_first_at,
      stats.status_200_count, stats.status_404_count, stats.status_403_count, stats.status_500_count, stats.status_503_count,
      stats.avg_article_size_bytes, stats.total_content_bytes,
      stats.avg_fetch_time_ms, stats.successful_crawls, stats.failed_crawls
    );

    return stats;
  }

  /**
   * Compute full statistics for a URL pattern (expensive operation)
   * @param {string} pattern - URL pattern (e.g., 'https://news.sky.com/%')
   * @returns {Object} - Complete statistics
   * @private
   */
  _computeFullStats(pattern) {
    // Article statistics
    const articleStats = this.db.db.prepare(`
      SELECT 
        COUNT(*) as count,
        MAX(date) as latest_date,
        MAX(crawled_at) as latest_crawled_at,
        MIN(crawled_at) as first_seen_at
      FROM articles 
      WHERE url LIKE ?
    `).get(pattern);

    // Fetch statistics
    const fetchStats = this.db.db.prepare(`
      SELECT 
        COUNT(*) as count,
        SUM(CASE WHEN http_status >= 200 AND http_status < 300 THEN 1 ELSE 0 END) as ok_count,
        SUM(CASE WHEN http_status >= 400 THEN 1 ELSE 0 END) as error_count,
        MAX(fetched_at) as last_at,
        MIN(fetched_at) as first_at,
        SUM(CASE WHEN http_status = 200 THEN 1 ELSE 0 END) as status_200,
        SUM(CASE WHEN http_status = 404 THEN 1 ELSE 0 END) as status_404,
        SUM(CASE WHEN http_status = 403 THEN 1 ELSE 0 END) as status_403,
        SUM(CASE WHEN http_status = 500 THEN 1 ELSE 0 END) as status_500,
        SUM(CASE WHEN http_status = 503 THEN 1 ELSE 0 END) as status_503,
        AVG(CASE WHEN fetch_time_ms > 0 THEN fetch_time_ms ELSE NULL END) as avg_fetch_time
      FROM fetches 
      WHERE url LIKE ?
    `).get(pattern);

    // Content statistics
    const contentStats = this.db.db.prepare(`
      SELECT 
        AVG(LENGTH(body_text)) as avg_size,
        SUM(LENGTH(body_text)) as total_size,
        SUM(CASE WHEN body_text IS NOT NULL AND body_text != '' THEN 1 ELSE 0 END) as successful,
        SUM(CASE WHEN body_text IS NULL OR body_text = '' THEN 1 ELSE 0 END) as failed
      FROM articles 
      WHERE url LIKE ?
    `).get(pattern);

    return {
      article_count: articleStats.count || 0,
      article_latest_date: articleStats.latest_date || null,
      article_latest_crawled_at: articleStats.latest_crawled_at || null,
      article_first_seen_at: articleStats.first_seen_at || null,
      
      fetch_count: fetchStats.count || 0,
      fetch_ok_count: fetchStats.ok_count || 0,
      fetch_error_count: fetchStats.error_count || 0,
      fetch_last_at: fetchStats.last_at || null,
      fetch_first_at: fetchStats.first_at || null,
      
      status_200_count: fetchStats.status_200 || 0,
      status_404_count: fetchStats.status_404 || 0,
      status_403_count: fetchStats.status_403 || 0,
      status_500_count: fetchStats.status_500 || 0,
      status_503_count: fetchStats.status_503 || 0,
      
      avg_article_size_bytes: Math.round(contentStats.avg_size || 0),
      total_content_bytes: contentStats.total_size || 0,
      
      avg_fetch_time_ms: Math.round(fetchStats.avg_fetch_time || 0),
      successful_crawls: contentStats.successful || 0,
      failed_crawls: contentStats.failed || 0
    };
  }

  /**
   * Get cached statistics for a news website (fast)
   * @param {number} websiteId - Website ID
   * @returns {Object|null} - Cached statistics or null if not initialized
   */
  getCachedStats(websiteId) {
    return this.db.db.prepare(`
      SELECT * FROM news_websites_stats_cache WHERE website_id = ?
    `).get(websiteId);
  }

  /**
   * Get cached statistics for all news websites (very fast)
   * @returns {Map<number, Object>} - Map of website_id to stats
   */
  getAllCachedStats() {
    const rows = this.db.db.prepare(`
      SELECT * FROM news_websites_stats_cache
    `).all();
    
    const map = new Map();
    for (const row of rows) {
      map.set(row.website_id, row);
    }
    return map;
  }

  /**
   * Incrementally update cache after a new article is crawled
   * @param {string} url - Article URL
   * @param {Object} metadata - Article metadata (date, size, etc.)
   */
  onArticleCrawled(url, metadata = {}) {
    const websites = this._findMatchingWebsites(url);
    
    for (const websiteId of websites) {
      const cached = this.getCachedStats(websiteId);
      if (!cached) {
        // Not initialized yet, skip incremental update
        continue;
      }

      const bodySize = tof(metadata.body_text) === 'string' ? metadata.body_text.length : 0;
      const newTotalSize = cached.total_content_bytes + bodySize;
      const newArticleCount = cached.article_count + 1;
      const newAvgSize = Math.round(newTotalSize / newArticleCount);

      this.db.db.prepare(`
        UPDATE news_websites_stats_cache
        SET 
          article_count = article_count + 1,
          article_latest_date = COALESCE(?, article_latest_date),
          article_latest_crawled_at = COALESCE(?, article_latest_crawled_at, CURRENT_TIMESTAMP),
          article_first_seen_at = COALESCE(article_first_seen_at, CURRENT_TIMESTAMP),
          avg_article_size_bytes = ?,
          total_content_bytes = ?,
          successful_crawls = successful_crawls + ?,
          last_updated_at = CURRENT_TIMESTAMP
        WHERE website_id = ?
      `).run(
        metadata.date || null,
        metadata.crawled_at || null,
        newAvgSize,
        newTotalSize,
        bodySize > 0 ? 1 : 0,
        websiteId
      );
    }
  }

  /**
   * Incrementally update cache after a fetch
   * @param {string} url - Fetched URL
   * @param {Object} result - Fetch result (status, time, etc.)
   */
  onFetchCompleted(url, result = {}) {
    const websites = this._findMatchingWebsites(url);
    
    for (const websiteId of websites) {
      const cached = this.getCachedStats(websiteId);
      if (!cached) {
        continue;
      }

      const status = result.http_status || 0;
      const isOk = status >= 200 && status < 300;
      const isError = status >= 400;
      const fetchTime = result.fetch_time_ms || 0;

      // Calculate new average fetch time
      const totalFetchTime = cached.avg_fetch_time_ms * cached.fetch_count;
      const newFetchCount = cached.fetch_count + 1;
      const newAvgFetchTime = Math.round((totalFetchTime + fetchTime) / newFetchCount);

      // Build status counter update
      const statusField = this._getStatusCounterField(status);
      const statusUpdate = statusField ? `, ${statusField} = ${statusField} + 1` : '';

      this.db.db.prepare(`
        UPDATE news_websites_stats_cache
        SET 
          fetch_count = fetch_count + 1,
          fetch_ok_count = fetch_ok_count + ?,
          fetch_error_count = fetch_error_count + ?,
          fetch_last_at = COALESCE(?, fetch_last_at, CURRENT_TIMESTAMP),
          fetch_first_at = COALESCE(fetch_first_at, CURRENT_TIMESTAMP),
          avg_fetch_time_ms = ?
          ${statusUpdate},
          last_updated_at = CURRENT_TIMESTAMP
        WHERE website_id = ?
      `).run(
        isOk ? 1 : 0,
        isError ? 1 : 0,
        result.fetched_at || null,
        newAvgFetchTime,
        websiteId
      );
    }
  }

  /**
   * Find news websites matching a URL
   * @param {string} url - URL to match
   * @returns {number[]} - Array of website IDs
   * @private
   */
  _findMatchingWebsites(url) {
    const rows = this.db.db.prepare(`
      SELECT id FROM news_websites WHERE ? LIKE url_pattern
    `).all(url);
    
    return rows.map(r => r.id);
  }

  /**
   * Get the counter field name for a status code
   * @param {number} status - HTTP status code
   * @returns {string|null} - Field name or null
   * @private
   */
  _getStatusCounterField(status) {
    const tracked = [200, 404, 403, 500, 503];
    if (tracked.includes(status)) {
      return `status_${status}_count`;
    }
    return null;
  }

  /**
   * Rebuild cache for all websites (maintenance operation)
   * @returns {Object} - Summary of rebuild operation
   */
  rebuildAll() {
    const websites = this.db.getNewsWebsites(false); // Get all, including disabled
    let initialized = 0;
    let errors = 0;

    for (const website of websites) {
      try {
        this.initializeCache(website.id);
        initialized++;
      } catch (err) {
        console.error(`[StatsCache] Failed to rebuild cache for website ${website.id}:`, err.message);
        errors++;
      }
    }

    return { initialized, errors, total: websites.length };
  }

  /**
   * Get cache age for a website
   * @param {number} websiteId - Website ID
   * @returns {number|null} - Age in seconds or null if not cached
   */
  getCacheAge(websiteId) {
    const cached = this.getCachedStats(websiteId);
    if (!cached || !cached.last_updated_at) return null;
    
    const updatedAt = new Date(cached.last_updated_at);
    const now = new Date();
    return Math.floor((now - updatedAt) / 1000);
  }
}

module.exports = NewsWebsiteStatsCache;
