'use strict';

/**
 * Analytics Queries - DB adapter layer for historical crawl analytics
 * 
 * All SQL for analytics dashboard lives here. Services should use these
 * functions instead of inline db.prepare() calls.
 * 
 * Added 2026-01-06 as part of P3 Query Optimization
 */

/**
 * Create an analytics query module
 * @param {Object} db - better-sqlite3 database instance
 * @returns {Object} Query functions
 */
function createAnalyticsQueries(db) {
  // Prepare statements for performance
  const dailyCountsStmt = db.prepare(`
    SELECT date(fetched_at) as day, COUNT(*) as count 
    FROM http_responses 
    WHERE fetched_at >= date('now', '-' || ? || ' days')
      AND fetched_at IS NOT NULL
    GROUP BY day 
    ORDER BY day
  `);

  const dailyCountsRangeStmt = db.prepare(`
    SELECT date(fetched_at) as day, COUNT(*) as count 
    FROM http_responses 
    WHERE fetched_at >= ? AND fetched_at <= ?
      AND fetched_at IS NOT NULL
    GROUP BY day 
    ORDER BY day
  `);

  const leaderboardStmt = db.prepare(`
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

  const hourlyActivityStmt = db.prepare(`
    SELECT 
      CAST(strftime('%H', fetched_at) AS INTEGER) as hour, 
      CAST(strftime('%w', fetched_at) AS INTEGER) as dow, 
      COUNT(*) as count 
    FROM http_responses 
    WHERE fetched_at >= date('now', '-' || ? || ' days')
      AND fetched_at IS NOT NULL
    GROUP BY hour, dow
  `);

  const categoryStmt = db.prepare(`
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

  const successRateStmt = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN http_status >= 200 AND http_status < 300 THEN 1 ELSE 0 END) as success,
      SUM(CASE WHEN http_status >= 400 AND http_status < 500 THEN 1 ELSE 0 END) as client_error,
      SUM(CASE WHEN http_status >= 500 THEN 1 ELSE 0 END) as server_error
    FROM http_responses
    WHERE fetched_at >= date('now', '-' || ? || ' days')
      AND fetched_at IS NOT NULL
  `);

  const overallStatsStmt = db.prepare(`
    SELECT 
      COUNT(*) as total_responses,
      COUNT(DISTINCT url_id) as unique_urls,
      MIN(fetched_at) as earliest,
      MAX(fetched_at) as latest
    FROM http_responses
    WHERE fetched_at IS NOT NULL
  `);

  const totalDomainsStmt = db.prepare(`
    SELECT COUNT(DISTINCT u.host) as count
    FROM urls u
    JOIN http_responses hr ON hr.url_id = u.id
    WHERE hr.fetched_at IS NOT NULL
  `);

  const throughputTrendStmt = db.prepare(`
    SELECT 
      date(fetched_at) as day,
      CAST(strftime('%H', fetched_at) AS INTEGER) as hour,
      COUNT(*) as count
    FROM http_responses 
    WHERE fetched_at >= date('now', '-' || ? || ' days')
      AND fetched_at IS NOT NULL
    GROUP BY day, hour
    ORDER BY day, hour
  `);

  const successRateTrendStmt = db.prepare(`
    SELECT 
      date(fetched_at) as day,
      COUNT(*) as total,
      SUM(CASE WHEN http_status >= 200 AND http_status < 300 THEN 1 ELSE 0 END) as success,
      SUM(CASE WHEN http_status >= 400 AND http_status < 500 THEN 1 ELSE 0 END) as client_error,
      SUM(CASE WHEN http_status >= 500 THEN 1 ELSE 0 END) as server_error
    FROM http_responses
    WHERE fetched_at >= date('now', '-' || ? || ' days')
      AND fetched_at IS NOT NULL
    GROUP BY day
    ORDER BY day
  `);

  /**
   * Check if a table exists
   */
  function tableExists(tableName) {
    const result = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name=?
    `).get(tableName);
    return !!result;
  }

  return {
    /**
     * Get daily article counts for N days back
     */
    getDailyCounts(days) {
      return dailyCountsStmt.all(days) || [];
    },

    /**
     * Get daily article counts for date range
     */
    getDailyCountsRange(startDate, endDate) {
      return dailyCountsRangeStmt.all(startDate, endDate) || [];
    },

    /**
     * Get domain leaderboard
     */
    getLeaderboard(days, limit) {
      return leaderboardStmt.all(days, limit) || [];
    },

    /**
     * Get hourly activity for heatmap
     */
    getHourlyActivity(days) {
      return hourlyActivityStmt.all(days) || [];
    },

    /**
     * Get category breakdown
     */
    getCategoryBreakdown(days) {
      return categoryStmt.all(days) || [];
    },

    /**
     * Get success rate for period
     */
    getSuccessRate(days) {
      return successRateStmt.get(days) || {
        total: 0,
        success: 0,
        client_error: 0,
        server_error: 0
      };
    },

    /**
     * Get overall stats
     */
    getOverallStats() {
      return overallStatsStmt.get() || {
        total_responses: 0,
        unique_urls: 0,
        earliest: null,
        latest: null
      };
    },

    /**
     * Get total domains count
     */
    getTotalDomains() {
      const result = totalDomainsStmt.get();
      return result ? result.count : 0;
    },

    /**
     * Get throughput trend data
     */
    getThroughputTrend(days) {
      return throughputTrendStmt.all(days) || [];
    },

    /**
     * Get success rate trend data
     */
    getSuccessRateTrend(days) {
      return successRateTrendStmt.all(days) || [];
    },

    /**
     * Check if place_hubs table exists
     */
    hasPlaceHubs() {
      return tableExists('place_hubs');
    },

    /**
     * Get hub health data
     */
    getHubHealth(limit) {
      const stmt = db.prepare(`
        SELECT 
          ph.id as hub_id,
          ph.host,
          ph.place_slug,
          ph.title,
          ph.last_seen_at as last_seen,
          CAST(julianday('now') - julianday(ph.last_seen_at) AS INTEGER) as stale_days,
          ph.nav_links_count,
          ph.article_links_count,
          ph.place_kind,
          ph.topic_slug,
          ph.topic_label
        FROM place_hubs ph
        WHERE ph.last_seen_at IS NOT NULL
        ORDER BY stale_days DESC, article_links_count DESC
        LIMIT ?
      `);
      return stmt.all(limit) || [];
    },

    /**
     * Check if layout_signatures table exists
     */
    hasLayoutSignatures() {
      return tableExists('layout_signatures');
    },

    /**
     * Get layout signature stats
     */
    getLayoutSignatureStats() {
      const stmt = db.prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(seen_count) as total_pages,
          COUNT(CASE WHEN level = 1 THEN 1 END) as l1_count,
          COUNT(CASE WHEN level = 2 THEN 1 END) as l2_count
        FROM layout_signatures
      `);
      return stmt.get() || { total: 0, total_pages: 0, l1_count: 0, l2_count: 0 };
    },

    /**
     * Get top layout clusters
     */
    getTopLayoutClusters(limit) {
      const stmt = db.prepare(`
        SELECT 
          signature_hash,
          level,
          seen_count,
          first_seen_url,
          created_at
        FROM layout_signatures
        WHERE level = 2
        ORDER BY seen_count DESC
        LIMIT ?
      `);
      return stmt.all(limit) || [];
    }
  };
}

module.exports = { createAnalyticsQueries };
