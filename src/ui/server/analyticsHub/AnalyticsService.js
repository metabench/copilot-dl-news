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
 * 
 * All SQL queries are in the DB adapter layer:
 * src/db/sqlite/v1/queries/ui/analytics.js
 */

const { createAnalyticsQueries } = require('../../../db/sqlite/v1/queries/ui/analytics');

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
    this.queries = createAnalyticsQueries(db);
    this._cache = new Map();
    this._cacheTTL = 5 * 60 * 1000; // 5 minutes
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
      rows = this.queries.getDailyCountsRange(startDate, endDate);
    } else {
      // Default to 30 days
      const days = startDate ? this._parsePeriod(startDate) : 30;
      rows = this.queries.getDailyCounts(days);
    }

    const result = rows.map(row => ({
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

    const rows = this.queries.getLeaderboard(days, limit);

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

    const rows = this.queries.getHourlyActivity(days);

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
      const rows = this.queries.getCategoryBreakdown(days);
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

    const row = this.queries.getSuccessRate(days);

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

    const stats = this.queries.getOverallStats();
    const totalDomains = this.queries.getTotalDomains();

    const result = {
      totalResponses: stats.total_responses || 0,
      uniqueUrls: stats.unique_urls || 0,
      totalDomains: totalDomains || 0,
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

  // ─────────────────────────────────────────────────────────────
  // Historical Metrics (Added 2026-01-06)
  // ─────────────────────────────────────────────────────────────

  /**
   * Get throughput trend - pages/hour over time
   * @param {string} period - Time period (7d, 30d, 90d)
   * @returns {Array<{hour: string, count: number, avgPerHour: number}>}
   */
  getThroughputTrend(period = '7d') {
    const cacheKey = `throughput:${period}`;
    const cached = this._getCached(cacheKey);
    if (cached) return cached;

    const days = this._parsePeriod(period);
    const rows = this.queries.getThroughputTrend(days);
    
    // Aggregate into daily averages
    const byDay = new Map();
    for (const row of rows) {
      if (!byDay.has(row.day)) {
        byDay.set(row.day, { total: 0, hours: 0 });
      }
      const d = byDay.get(row.day);
      d.total += row.count;
      d.hours += 1;
    }

    const result = Array.from(byDay.entries()).map(([day, data]) => ({
      day,
      totalPages: data.total,
      activeHours: data.hours,
      pagesPerHour: data.hours > 0 ? Math.round(data.total / data.hours) : 0
    }));

    this._setCache(cacheKey, result);
    return result;
  }

  /**
   * Get success/error rate trend over time
   * @param {string} period - Time period (7d, 30d, 90d)
   * @returns {Array<{day: string, success: number, clientError: number, serverError: number, total: number, successRate: number}>}
   */
  getSuccessRateTrend(period = '7d') {
    const cacheKey = `successTrend:${period}`;
    const cached = this._getCached(cacheKey);
    if (cached) return cached;

    const days = this._parsePeriod(period);
    const rows = this.queries.getSuccessRateTrend(days);
    
    const result = rows.map(row => ({
      day: row.day,
      total: row.total || 0,
      success: row.success || 0,
      clientError: row.client_error || 0,
      serverError: row.server_error || 0,
      successRate: row.total > 0 ? Math.round((row.success / row.total) * 1000) / 10 : 0
    }));

    this._setCache(cacheKey, result);
    return result;
  }

  /**
   * Get hub health metrics - staleness and yield
   * Uses place_hubs table which tracks article hubs per domain/place
   * @param {number} limit - Max hubs to return
   * @returns {Array<{hubId: number, host: string, placeSlug: string, title: string, lastSeen: string, staleDays: number, placeKind: string}>}
   */
  getHubHealth(limit = 50) {
    const cacheKey = `hubHealth:${limit}`;
    const cached = this._getCached(cacheKey);
    if (cached) return cached;

    if (!this.queries.hasPlaceHubs()) {
      return [];
    }

    try {
      const rows = this.queries.getHubHealth(limit);
      
      const result = rows.map(row => ({
        hubId: row.hub_id,
        host: row.host || '',
        placeSlug: row.place_slug || '',
        title: row.title || 'Unknown',
        lastSeen: row.last_seen,
        staleDays: row.stale_days || 0,
        navLinksCount: row.nav_links_count || 0,
        articleLinksCount: row.article_links_count || 0,
        placeKind: row.place_kind || '',
        topicSlug: row.topic_slug || '',
        topicLabel: row.topic_label || ''
      }));

      this._setCache(cacheKey, result);
      return result;
    } catch (e) {
      // Table might have unexpected schema
      return [];
    }
  }

  /**
   * Get layout signature (SkeletonHash) statistics
   * @param {number} limit - Max clusters to return
   * @returns {Object} Layout signature statistics
   */
  getLayoutSignatureStats(limit = 20) {
    const cacheKey = `layoutSignatures:${limit}`;
    const cached = this._getCached(cacheKey);
    if (cached) return cached;

    if (!this.queries.hasLayoutSignatures()) {
      return { totalSignatures: 0, topClusters: [], uniqueTemplates: 0 };
    }

    try {
      const stats = this.queries.getLayoutSignatureStats();
      const clusters = this.queries.getTopLayoutClusters(limit);

      const result = {
        totalSignatures: stats.total || 0,
        totalPages: stats.total_pages || 0,
        l1Templates: stats.l1_count || 0,
        l2Structures: stats.l2_count || 0,
        topClusters: clusters.map(c => ({
          hash: c.signature_hash,
          level: c.level,
          seenCount: c.seen_count,
          firstSeenUrl: c.first_seen_url,
          createdAt: c.created_at
        }))
      };

      this._setCache(cacheKey, result);
      return result;
    } catch (e) {
      return { totalSignatures: 0, topClusters: [], uniqueTemplates: 0 };
    }
  }
}

module.exports = { AnalyticsService };
