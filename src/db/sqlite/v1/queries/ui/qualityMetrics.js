'use strict';

/**
 * Quality Metrics Queries - DB adapter layer for quality dashboard
 * 
 * All SQL for quality metrics lives here. Services should use these
 * functions instead of inline db.prepare() calls.
 */

/**
 * Create a quality metrics query module
 * @param {Object} db - better-sqlite3 database instance
 * @returns {Object} Query functions
 */
function createQualityMetricsQueries(db) {
  // Prepare statements for performance
  const statements = {
    summary: db.prepare(`
      SELECT 
        AVG(ca.confidence_score) as avg_confidence,
        COUNT(*) as total_articles,
        SUM(CASE WHEN ca.confidence_score >= 0.8 THEN 1 ELSE 0 END) as high_quality,
        SUM(CASE WHEN ca.confidence_score >= 0.5 AND ca.confidence_score < 0.8 THEN 1 ELSE 0 END) as medium_quality,
        SUM(CASE WHEN ca.confidence_score < 0.5 THEN 1 ELSE 0 END) as low_quality
      FROM content_analysis ca
      WHERE ca.confidence_score IS NOT NULL
    `),

    classification: db.prepare(`
      SELECT 
        classification,
        COUNT(*) as count,
        AVG(confidence_score) as avg_confidence
      FROM content_analysis
      WHERE classification IS NOT NULL
      GROUP BY classification
      ORDER BY count DESC
    `),

    method: db.prepare(`
      SELECT 
        CASE 
          WHEN axp.confidence >= 0.9 THEN 'learned'
          WHEN axp.confidence >= 0.7 THEN 'heuristic'
          ELSE 'fallback'
        END as method,
        COUNT(*) as count
      FROM article_xpath_patterns axp
      GROUP BY method
      ORDER BY count DESC
    `),

    domainByConfidence: db.prepare(`
      SELECT 
        u.host,
        COUNT(ca.id) as article_count,
        AVG(ca.confidence_score) as avg_confidence,
        MIN(ca.confidence_score) as min_confidence,
        MAX(ca.confidence_score) as max_confidence,
        MAX(ca.analyzed_at) as last_analyzed_at,
        SUM(CASE WHEN ca.confidence_score < 0.5 THEN 1 ELSE 0 END) as low_quality_count
      FROM content_analysis ca
      JOIN content_storage cs ON cs.id = ca.content_id
      JOIN http_responses hr ON hr.id = cs.http_response_id
      JOIN urls u ON u.id = hr.url_id
      WHERE ca.confidence_score IS NOT NULL
      GROUP BY u.host
      HAVING COUNT(ca.id) >= ?
      ORDER BY avg_confidence ASC
      LIMIT ?
    `),

    domainByCount: db.prepare(`
      SELECT 
        u.host,
        COUNT(ca.id) as article_count,
        AVG(ca.confidence_score) as avg_confidence,
        MIN(ca.confidence_score) as min_confidence,
        MAX(ca.confidence_score) as max_confidence,
        MAX(ca.analyzed_at) as last_analyzed_at,
        SUM(CASE WHEN ca.confidence_score < 0.5 THEN 1 ELSE 0 END) as low_quality_count
      FROM content_analysis ca
      JOIN content_storage cs ON cs.id = ca.content_id
      JOIN http_responses hr ON hr.id = cs.http_response_id
      JOIN urls u ON u.id = hr.url_id
      WHERE ca.confidence_score IS NOT NULL
      GROUP BY u.host
      HAVING COUNT(ca.id) >= ?
      ORDER BY article_count DESC
      LIMIT ?
    `),

    histogram: db.prepare(`
      SELECT 
        CASE 
          WHEN confidence_score >= 0.9 THEN '0.9-1.0'
          WHEN confidence_score >= 0.8 THEN '0.8-0.9'
          WHEN confidence_score >= 0.7 THEN '0.7-0.8'
          WHEN confidence_score >= 0.6 THEN '0.6-0.7'
          WHEN confidence_score >= 0.5 THEN '0.5-0.6'
          WHEN confidence_score >= 0.4 THEN '0.4-0.5'
          WHEN confidence_score >= 0.3 THEN '0.3-0.4'
          WHEN confidence_score >= 0.2 THEN '0.2-0.3'
          WHEN confidence_score >= 0.1 THEN '0.1-0.2'
          ELSE '0.0-0.1'
        END as bucket,
        COUNT(*) as count
      FROM content_analysis
      WHERE confidence_score IS NOT NULL
      GROUP BY bucket
      ORDER BY bucket DESC
    `),

    totalCount: db.prepare(`
      SELECT COUNT(*) as total FROM content_analysis WHERE confidence_score IS NOT NULL
    `),

    recentActivity: db.prepare(`
      SELECT 
        u.host,
        u.url,
        ca.classification,
        ca.confidence_score,
        ca.analyzed_at
      FROM content_analysis ca
      JOIN content_storage cs ON cs.id = ca.content_id
      JOIN http_responses hr ON hr.id = cs.http_response_id
      JOIN urls u ON u.id = hr.url_id
      WHERE ca.confidence_score IS NOT NULL
      ORDER BY ca.analyzed_at DESC
      LIMIT ?
    `),

    qualityTrend: db.prepare(`
      SELECT 
        date(ca.analyzed_at) as day,
        AVG(ca.confidence_score) as avg_confidence,
        COUNT(*) as article_count,
        SUM(CASE WHEN ca.confidence_score >= 0.8 THEN 1 ELSE 0 END) as high_quality,
        SUM(CASE WHEN ca.confidence_score < 0.5 THEN 1 ELSE 0 END) as low_quality
      FROM content_analysis ca
      WHERE ca.analyzed_at >= date('now', '-' || ? || ' days')
        AND ca.confidence_score IS NOT NULL
      GROUP BY day
      ORDER BY day
    `),

    qualityByClassification: db.prepare(`
      SELECT 
        COALESCE(ca.classification, 'unknown') as classification,
        AVG(ca.confidence_score) as avg_confidence,
        COUNT(*) as count,
        MIN(ca.confidence_score) as min_confidence,
        MAX(ca.confidence_score) as max_confidence
      FROM content_analysis ca
      WHERE ca.analyzed_at >= date('now', '-' || ? || ' days')
        AND ca.confidence_score IS NOT NULL
      GROUP BY classification
      ORDER BY count DESC
    `)
  };

  return {
    /**
     * Get overall quality summary stats
     */
    getSummary() {
      return statements.summary.get() || {
        avg_confidence: 0,
        total_articles: 0,
        high_quality: 0,
        medium_quality: 0,
        low_quality: 0
      };
    },

    /**
     * Get classification breakdown
     */
    getClassificationBreakdown() {
      return statements.classification.all() || [];
    },

    /**
     * Get method breakdown
     */
    getMethodBreakdown() {
      return statements.method.all() || [];
    },

    /**
     * Get domain quality sorted by confidence
     */
    getDomainsByConfidence(minArticles, limit) {
      return statements.domainByConfidence.all(minArticles, limit) || [];
    },

    /**
     * Get domain quality sorted by article count
     */
    getDomainsByCount(minArticles, limit) {
      return statements.domainByCount.all(minArticles, limit) || [];
    },

    /**
     * Get confidence histogram buckets
     */
    getHistogram() {
      return statements.histogram.all() || [];
    },

    /**
     * Get total analyzed article count
     */
    getTotalCount() {
      return statements.totalCount.get()?.total || 0;
    },

    /**
     * Get recent analysis activity
     */
    getRecentActivity(limit) {
      return statements.recentActivity.all(limit) || [];
    },

    /**
     * Get quality trend over time
     */
    getQualityTrend(days) {
      return statements.qualityTrend.all(days) || [];
    },

    /**
     * Get quality by classification
     */
    getQualityByClassification(days) {
      return statements.qualityByClassification.all(days) || [];
    },

    /**
     * Get regressions - requires dynamic query
     */
    getRegressions(lookbackDays, threshold) {
      const stmt = db.prepare(`
        WITH current_period AS (
          SELECT 
            u.host,
            AVG(ca.confidence_score) as avg_confidence,
            COUNT(*) as article_count
          FROM content_analysis ca
          JOIN content_storage cs ON cs.id = ca.content_id
          JOIN http_responses hr ON hr.id = cs.http_response_id
          JOIN urls u ON u.id = hr.url_id
          WHERE ca.confidence_score IS NOT NULL
            AND ca.analyzed_at > datetime('now', '-' || ? || ' days')
          GROUP BY u.host
          HAVING COUNT(*) >= 3
        ),
        previous_period AS (
          SELECT 
            u.host,
            AVG(ca.confidence_score) as avg_confidence
          FROM content_analysis ca
          JOIN content_storage cs ON cs.id = ca.content_id
          JOIN http_responses hr ON hr.id = cs.http_response_id
          JOIN urls u ON u.id = hr.url_id
          WHERE ca.confidence_score IS NOT NULL
            AND ca.analyzed_at <= datetime('now', '-' || ? || ' days')
            AND ca.analyzed_at > datetime('now', '-' || (? * 2) || ' days')
          GROUP BY u.host
          HAVING COUNT(*) >= 3
        )
        SELECT 
          c.host,
          p.avg_confidence as previous_avg,
          c.avg_confidence as current_avg,
          c.article_count,
          ((p.avg_confidence - c.avg_confidence) / p.avg_confidence * 100) as drop_percent
        FROM current_period c
        JOIN previous_period p ON p.host = c.host
        WHERE p.avg_confidence > c.avg_confidence
          AND (p.avg_confidence - c.avg_confidence) >= ?
        ORDER BY drop_percent DESC
        LIMIT 20
      `);
      return stmt.all(lookbackDays, lookbackDays, lookbackDays, threshold) || [];
    },

    /**
     * Get quality movers - domains with improving/declining quality
     */
    getQualityMovers(days, minArticles) {
      const stmt = db.prepare(`
        WITH current_period AS (
          SELECT 
            u.host,
            AVG(ca.confidence_score) as avg_confidence,
            COUNT(*) as article_count
          FROM content_analysis ca
          JOIN content_storage cs ON cs.id = ca.content_id
          JOIN http_responses hr ON hr.id = cs.http_response_id
          JOIN urls u ON u.id = hr.url_id
          WHERE ca.analyzed_at >= date('now', '-' || ? || ' days')
            AND ca.confidence_score IS NOT NULL
          GROUP BY u.host
          HAVING COUNT(*) >= ?
        ),
        previous_period AS (
          SELECT 
            u.host,
            AVG(ca.confidence_score) as avg_confidence,
            COUNT(*) as article_count
          FROM content_analysis ca
          JOIN content_storage cs ON cs.id = ca.content_id
          JOIN http_responses hr ON hr.id = cs.http_response_id
          JOIN urls u ON u.id = hr.url_id
          WHERE ca.analyzed_at >= date('now', '-' || (? * 2) || ' days')
            AND ca.analyzed_at < date('now', '-' || ? || ' days')
            AND ca.confidence_score IS NOT NULL
          GROUP BY u.host
          HAVING COUNT(*) >= ?
        )
        SELECT 
          c.host,
          c.avg_confidence as current_avg,
          p.avg_confidence as previous_avg,
          c.article_count,
          (c.avg_confidence - p.avg_confidence) as change,
          ROUND((c.avg_confidence - p.avg_confidence) / p.avg_confidence * 100, 1) as change_percent
        FROM current_period c
        JOIN previous_period p ON p.host = c.host
        ORDER BY change DESC
      `);
      return stmt.all(days, minArticles, days, days, minArticles) || [];
    }
  };
}

module.exports = { createQualityMetricsQueries };
