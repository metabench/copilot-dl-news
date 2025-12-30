'use strict';

/**
 * AnalyticsService - Aggregates historical crawl data for analytics
 * 
 * Provides:
 * - getArticleCountsByDate(startDate, endDate, granularity) - Time-series counts
 * - getDomainLeaderboard(limit, period) - Top domains by article count
 * - getHourlyActivity(period) - 7×24 heatmap data
 * - getCategoryBreakdown(period) - Articles by category
 * - getExtractionSuccessRate(period) - Success vs failure rates
 */

/**
 * @typedef {Object} DailyCount
 * @property {string} day - Date string YYYY-MM-DD
 * @property {number} count - Number of articles
 */

/**
 * @typedef {Object} DomainLeader
 * @property {number} rank - Position in leaderboard
 * @property {string} host - Domain hostname
 * @property {number} articleCount - Total articles
 * @property {number} avgPerDay - Average articles per day
 * @property {string} lastCrawled - Last crawl timestamp
 */

/**
 * @typedef {Object} HourlyCell
 * @property {number} hour - Hour of day (0-23)
 * @property {number} dow - Day of week (0=Sunday, 6=Saturday)
 * @property {number} count - Number of articles
 */

/**
 * @typedef {Object} CategoryCount
 * @property {string} category - Category name
 * @property {number} count - Number of articles
 * @property {number} percent - Percentage of total
 */

/**
 * @typedef {Object} SuccessRate
 * @property {number} total - Total requests
 * @property {number} success - Successful (2xx)
 * @property {number} clientError - Client errors (4xx)
 * @property {number} serverError - Server errors (5xx)
 * @property {number} successRate - Success percentage
 */

class AnalyticsService {
  /**
   * @param {Object} db - better-sqlite3 database instance
   */
  constructor(db) {
    this.db = db;
    this._cache = new Map();
    this._cacheTTL = 5 * 60 * 1000; // 5 minutes
    this._prepareStatements();
  }

  /**
   * Prepare SQL statements for performance
   */
  _prepareStatements() {
    // Daily article counts
    this._dailyCountsStmt = this.db.prepare(`
      SELECT date(fetched_at) as day, COUNT(*) as count 
      FROM http_responses 
      WHERE fetched_at >= date('now', '-' || ? || ' days')
        AND fetched_at IS NOT NULL
      GROUP BY day 
      ORDER BY day
    `);

    // Daily counts with date range
    this._dailyCountsRangeStmt = this.db.prepare(`
      SELECT date(fetched_at) as day, COUNT(*) as count 
      FROM http_responses 
      WHERE fetched_at >= ? AND fetched_at <= ?
        AND fetched_at IS NOT NULL
      GROUP BY day 
      ORDER BY day
    `);

    // Domain leaderboard
    this._leaderboardStmt = this.db.prepare(`
      SELECT 
        u.host,
        COUNT(*) as article_count,
        MAX(hr.fetched_at) as last_crawled,
        MIN(hr.fetched_at) as first_crawled
      FROM urls u 
      JOIN http_responses hr ON hr.url_id = u.id 
      WHERE hr.fetched_at >= date('now', '-' || ? || ' days')
        AND hr.fetched_at IS NOT NULL
      GROUP BY u.host 
      ORDER BY article_count DESC 
      LIMIT ?
    `);

    // Hourly activity for heatmap
    this._hourlyActivityStmt = this.db.prepare(`
      SELECT 
        CAST(strftime('%H', fetched_at) AS INTEGER) as hour, 
        CAST(strftime('%w', fetched_at) AS INTEGER) as dow, 
        COUNT(*) as count 
      FROM http_responses 
      WHERE fetched_at >= date('now', '-' || ? || ' days')
        AND fetched_at IS NOT NULL
      GROUP BY hour, dow
    `);

    // Category breakdown
    this._categoryStmt = this.db.prepare(`
      SELECT 
        COALESCE(ca.classification, 'Uncategorized') as category,
        COUNT(*) as count
      FROM content_analysis ca
      JOIN content_storage cs ON cs.id = ca.content_id
      JOIN http_responses hr ON hr.id = cs.http_response_id
      WHERE hr.fetched_at >= date('now', '-' || ? || ' days')
        AND hr.fetched_at IS NOT NULL
      GROUP BY category
      ORDER BY count DESC
    `);

    // Extraction success rate
    this._successRateStmt = this.db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN http_status >= 200 AND http_status < 300 THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN http_status >= 400 AND http_status < 500 THEN 1 ELSE 0 END) as client_error,
        SUM(CASE WHEN http_status >= 500 THEN 1 ELSE 0 END) as server_error
      FROM http_responses
      WHERE fetched_at >= date('now', '-' || ? || ' days')
        AND fetched_at IS NOT NULL
    `);

    // Overall stats
    this._overallStatsStmt = this.db.prepare(`
      SELECT 
        COUNT(*) as total_responses,
        COUNT(DISTINCT url_id) as unique_urls,
        MIN(fetched_at) as earliest,
        MAX(fetched_at) as latest
      FROM http_responses
      WHERE fetched_at IS NOT NULL
    `);

    // Total domains
    this._totalDomainsStmt = this.db.prepare(`
      SELECT COUNT(DISTINCT u.host) as count
      FROM urls u
      JOIN http_responses hr ON hr.url_id = u.id
      WHERE hr.fetched_at IS NOT NULL
    `);
  }

  /**
   * Check and return cached result
   * @param {string} key - Cache key
   * @returns {*|null}
   */
  _getCached(key) {
    const cached = this._cache.get(key);
    if (cached && Date.now() - cached.timestamp < this._cacheTTL) {
      return cached.data;
    }
    return null;
  }

  /**
   * Store result in cache
   * @param {string} key - Cache key
   * @param {*} data - Data to cache
   */
  _setCache(key, data) {
    this._cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Parse period string to days
   * @param {string} period - Period string (7d, 30d, 90d, or number)
   * @returns {number}
   */
  _parsePeriod(period) {
    if (typeof period === 'number') return period;
    const match = String(period).match(/^(\d+)d?$/i);
    return match ? parseInt(match[1], 10) : 30;
  }

  /**
   * Get article counts by date
   * @param {string} [startDate] - Start date (YYYY-MM-DD)
   * @param {string} [endDate] - End date (YYYY-MM-DD)
   * @param {string} [granularity='day'] - Granularity (day, week, month)
   * @returns {DailyCount[]}
   */
  getArticleCountsByDate(startDate, endDate, granularity = 'day') {
    const cacheKey = `counts:${startDate}:${endDate}:${granularity}`;
    const cached = this._getCached(cacheKey);
    if (cached) return cached;

    let rows;
    if (startDate && endDate) {
      rows = this._dailyCountsRangeStmt.all(startDate, endDate);
    } else {
      // Default to 30 days
      const days = startDate ? this._parsePeriod(startDate) : 30;
      rows = this._dailyCountsStmt.all(days);
    }

    const result = (rows || []).map(row => ({
      day: row.day,
      count: row.count || 0
    }));

    this._setCache(cacheKey, result);
    return result;
  }

  /**
   * Get domain leaderboard
   * @param {number} [limit=50] - Maximum domains to return
   * @param {string} [period='30d'] - Time period
   * @returns {DomainLeader[]}
   */
  getDomainLeaderboard(limit = 50, period = '30d') {
    const days = this._parsePeriod(period);
    const cacheKey = `leaderboard:${limit}:${days}`;
    const cached = this._getCached(cacheKey);
    if (cached) return cached;

    const rows = this._leaderboardStmt.all(days, limit) || [];

    const result = rows.map((row, idx) => {
      // Calculate avg per day
      const firstDate = row.first_crawled ? new Date(row.first_crawled) : new Date();
      const lastDate = row.last_crawled ? new Date(row.last_crawled) : new Date();
      const daySpan = Math.max(1, Math.ceil((lastDate - firstDate) / (1000 * 60 * 60 * 24)));
      const avgPerDay = row.article_count / Math.min(daySpan, days);

      return {
        rank: idx + 1,
        host: row.host,
        articleCount: row.article_count,
        avgPerDay: Math.round(avgPerDay * 10) / 10,
        lastCrawled: row.last_crawled
      };
    });

    this._setCache(cacheKey, result);
    return result;
  }

  /**
   * Get hourly activity for heatmap (7×24 grid)
   * @param {string} [period='7d'] - Time period
   * @returns {HourlyCell[]}
   */
  getHourlyActivity(period = '7d') {
    const days = this._parsePeriod(period);
    const cacheKey = `hourly:${days}`;
    const cached = this._getCached(cacheKey);
    if (cached) return cached;

    const rows = this._hourlyActivityStmt.all(days) || [];

    // Initialize complete 7×24 grid
    const grid = [];
    for (let dow = 0; dow < 7; dow++) {
      for (let hour = 0; hour < 24; hour++) {
        grid.push({ hour, dow, count: 0 });
      }
    }

    // Fill in actual counts
    for (const row of rows) {
      const idx = row.dow * 24 + row.hour;
      if (idx >= 0 && idx < grid.length) {
        grid[idx].count = row.count;
      }
    }

    this._setCache(cacheKey, grid);
    return grid;
  }

  /**
   * Get category breakdown
   * @param {string} [period='30d'] - Time period
   * @returns {CategoryCount[]}
   */
  getCategoryBreakdown(period = '30d') {
    const days = this._parsePeriod(period);
    const cacheKey = `category:${days}`;
    const cached = this._getCached(cacheKey);
    if (cached) return cached;

    try {
      const rows = this._categoryStmt.all(days) || [];
      const total = rows.reduce((sum, r) => sum + r.count, 0);

      const result = rows.map(row => ({
        category: row.category,
        count: row.count,
        percent: total > 0 ? Math.round(row.count / total * 1000) / 10 : 0
      }));

      this._setCache(cacheKey, result);
      return result;
    } catch (err) {
      // content_analysis might not exist or be empty
      console.warn('getCategoryBreakdown failed:', err.message);
      return [];
    }
  }

  /**
   * Get extraction success rate
   * @param {string} [period='7d'] - Time period
   * @returns {SuccessRate}
   */
  getExtractionSuccessRate(period = '7d') {
    const days = this._parsePeriod(period);
    const cacheKey = `success:${days}`;
    const cached = this._getCached(cacheKey);
    if (cached) return cached;

    const row = this._successRateStmt.get(days) || {
      total: 0,
      success: 0,
      client_error: 0,
      server_error: 0
    };

    const result = {
      total: row.total || 0,
      success: row.success || 0,
      clientError: row.client_error || 0,
      serverError: row.server_error || 0,
      successRate: row.total > 0 
        ? Math.round(row.success / row.total * 1000) / 10 
        : 0
    };

    this._setCache(cacheKey, result);
    return result;
  }

  /**
   * Get overall summary stats
   * @returns {Object}
   */
  getOverallStats() {
    const cacheKey = 'overall';
    const cached = this._getCached(cacheKey);
    if (cached) return cached;

    const stats = this._overallStatsStmt.get() || {
      total_responses: 0,
      unique_urls: 0,
      earliest: null,
      latest: null
    };

    const domains = this._totalDomainsStmt.get() || { count: 0 };

    const result = {
      totalResponses: stats.total_responses || 0,
      uniqueUrls: stats.unique_urls || 0,
      totalDomains: domains.count || 0,
      dateRange: {
        earliest: stats.earliest,
        latest: stats.latest
      }
    };

    this._setCache(cacheKey, result);
    return result;
  }

  /**
   * Clear all cached data
   */
  clearCache() {
    this._cache.clear();
  }
}

module.exports = { AnalyticsService };
