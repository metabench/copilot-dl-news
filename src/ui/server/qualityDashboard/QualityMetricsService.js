'use strict';

/**
 * QualityMetricsService - Aggregates extraction quality data from DB
 * 
 * Provides:
 * - getSummary() - Overall quality metrics
 * - getDomains(options) - Per-domain quality scores
 * - getRegressions(threshold) - Domains with quality drops
 * - getConfidenceDistribution() - Histogram buckets
 */

/**
 * @typedef {Object} QualitySummary
 * @property {number} avgConfidence - Average confidence score across all articles
 * @property {number} totalArticles - Total number of analyzed articles
 * @property {Object} methodBreakdown - Counts by extraction method
 * @property {Object} classificationBreakdown - Counts by classification type
 */

/**
 * @typedef {Object} DomainQuality
 * @property {string} host - Domain host
 * @property {number} articleCount - Number of articles
 * @property {number} avgConfidence - Average confidence
 * @property {number} minConfidence - Minimum confidence
 * @property {number} maxConfidence - Maximum confidence
 * @property {string} lastAnalyzedAt - Last analysis timestamp
 * @property {number} lowQualityCount - Articles with confidence < 0.5
 */

/**
 * @typedef {Object} Regression
 * @property {string} host - Domain host
 * @property {number} previousAvg - Previous average confidence
 * @property {number} currentAvg - Current average confidence
 * @property {number} dropPercent - Percent drop in confidence
 * @property {number} articleCount - Number of articles in current period
 * @property {string} detectedAt - When the regression was detected
 */

/**
 * @typedef {Object} HistogramBucket
 * @property {number} min - Bucket minimum (inclusive)
 * @property {number} max - Bucket maximum (exclusive)
 * @property {string} label - Human-readable label
 * @property {number} count - Number of articles in bucket
 * @property {number} percent - Percentage of total
 */

class QualityMetricsService {
  /**
   * @param {Object} db - better-sqlite3 database instance
   */
  constructor(db) {
    this.db = db;
    this._prepareStatements();
  }

  /**
   * Prepare SQL statements for performance
   */
  _prepareStatements() {
    // Summary query
    this._summaryStmt = this.db.prepare(`
      SELECT 
        AVG(ca.confidence_score) as avg_confidence,
        COUNT(*) as total_articles,
        SUM(CASE WHEN ca.confidence_score >= 0.8 THEN 1 ELSE 0 END) as high_quality,
        SUM(CASE WHEN ca.confidence_score >= 0.5 AND ca.confidence_score < 0.8 THEN 1 ELSE 0 END) as medium_quality,
        SUM(CASE WHEN ca.confidence_score < 0.5 THEN 1 ELSE 0 END) as low_quality
      FROM content_analysis ca
      WHERE ca.confidence_score IS NOT NULL
    `);

    // Classification breakdown
    this._classificationStmt = this.db.prepare(`
      SELECT 
        classification,
        COUNT(*) as count,
        AVG(confidence_score) as avg_confidence
      FROM content_analysis
      WHERE classification IS NOT NULL
      GROUP BY classification
      ORDER BY count DESC
    `);

    // Method breakdown (from article_xpath_patterns)
    this._methodStmt = this.db.prepare(`
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
    `);

    // Domain quality
    this._domainStmt = this.db.prepare(`
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
    `);

    // Domain quality sorted by article count
    this._domainByCountStmt = this.db.prepare(`
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
    `);

    // Confidence histogram
    this._histogramStmt = this.db.prepare(`
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
    `);

    // Total count for percentage calculation
    this._totalCountStmt = this.db.prepare(`
      SELECT COUNT(*) as total FROM content_analysis WHERE confidence_score IS NOT NULL
    `);
  }

  /**
   * Get overall quality summary
   * @returns {QualitySummary}
   */
  getSummary() {
    const stats = this._summaryStmt.get() || {
      avg_confidence: 0,
      total_articles: 0,
      high_quality: 0,
      medium_quality: 0,
      low_quality: 0
    };

    // Get classification breakdown
    const classificationRows = this._classificationStmt.all() || [];
    const classificationBreakdown = {};
    for (const row of classificationRows) {
      classificationBreakdown[row.classification] = {
        count: row.count,
        avgConfidence: row.avg_confidence
      };
    }

    // Get method breakdown
    const methodRows = this._methodStmt.all() || [];
    const methodBreakdown = {};
    for (const row of methodRows) {
      methodBreakdown[row.method] = row.count;
    }

    return {
      avgConfidence: stats.avg_confidence || 0,
      totalArticles: stats.total_articles || 0,
      qualityTiers: {
        high: stats.high_quality || 0,
        medium: stats.medium_quality || 0,
        low: stats.low_quality || 0
      },
      methodBreakdown,
      classificationBreakdown
    };
  }

  /**
   * Get per-domain quality scores
   * @param {Object} options - Query options
   * @param {number} [options.minArticles=5] - Minimum articles per domain
   * @param {number} [options.limit=50] - Maximum domains to return
   * @param {string} [options.sortBy='confidence'] - Sort field: 'confidence' or 'count'
   * @param {string} [options.sortOrder='asc'] - Sort order: 'asc' or 'desc'
   * @returns {DomainQuality[]}
   */
  getDomains(options = {}) {
    const {
      minArticles = 5,
      limit = 50,
      sortBy = 'confidence',
      sortOrder = 'asc'
    } = options;

    const stmt = sortBy === 'count' ? this._domainByCountStmt : this._domainStmt;
    const rows = stmt.all(minArticles, limit) || [];

    const domains = rows.map(row => ({
      host: row.host,
      articleCount: row.article_count,
      avgConfidence: row.avg_confidence,
      minConfidence: row.min_confidence,
      maxConfidence: row.max_confidence,
      lastAnalyzedAt: row.last_analyzed_at,
      lowQualityCount: row.low_quality_count,
      qualityRate: row.article_count > 0 
        ? ((row.article_count - row.low_quality_count) / row.article_count * 100).toFixed(1) 
        : 0
    }));

    // Handle DESC sort for confidence (stmt already returns ASC)
    if (sortBy === 'confidence' && sortOrder === 'desc') {
      domains.reverse();
    }

    return domains;
  }

  /**
   * Find domains with quality regressions
   * @param {number} [threshold=0.1] - Minimum drop threshold (0-1)
   * @param {number} [lookbackDays=7] - Days to look back for comparison
   * @returns {Regression[]}
   */
  getRegressions(threshold = 0.1, lookbackDays = 7) {
    // Compare current week vs previous week
    const stmt = this.db.prepare(`
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

    try {
      const rows = stmt.all(lookbackDays, lookbackDays, lookbackDays, threshold) || [];
      return rows.map(row => ({
        host: row.host,
        previousAvg: row.previous_avg,
        currentAvg: row.current_avg,
        dropPercent: row.drop_percent,
        articleCount: row.article_count,
        detectedAt: new Date().toISOString()
      }));
    } catch (err) {
      // Tables might not have enough data
      console.warn('getRegressions query failed:', err.message);
      return [];
    }
  }

  /**
   * Get confidence score distribution as histogram buckets
   * @returns {HistogramBucket[]}
   */
  getConfidenceDistribution() {
    const rows = this._histogramStmt.all() || [];
    const totalRow = this._totalCountStmt.get();
    const total = totalRow?.total || 0;

    // Define bucket ranges
    const bucketDefs = [
      { min: 0.9, max: 1.0, label: '0.9-1.0 (Excellent)' },
      { min: 0.8, max: 0.9, label: '0.8-0.9 (Good)' },
      { min: 0.7, max: 0.8, label: '0.7-0.8 (Fair)' },
      { min: 0.6, max: 0.7, label: '0.6-0.7' },
      { min: 0.5, max: 0.6, label: '0.5-0.6' },
      { min: 0.4, max: 0.5, label: '0.4-0.5 (Low)' },
      { min: 0.3, max: 0.4, label: '0.3-0.4' },
      { min: 0.2, max: 0.3, label: '0.2-0.3' },
      { min: 0.1, max: 0.2, label: '0.1-0.2' },
      { min: 0.0, max: 0.1, label: '0.0-0.1 (Poor)' }
    ];

    // Map query results to buckets
    const bucketMap = new Map(rows.map(r => [r.bucket, r.count]));

    return bucketDefs.map(def => {
      const bucketKey = `${def.min.toFixed(1)}-${def.max.toFixed(1)}`;
      const count = bucketMap.get(bucketKey) || 0;
      return {
        min: def.min,
        max: def.max,
        label: def.label,
        count,
        percent: total > 0 ? (count / total * 100) : 0
      };
    });
  }

  /**
   * Get recent analysis activity
   * @param {number} [limit=20] - Max results
   * @returns {Array}
   */
  getRecentActivity(limit = 20) {
    const stmt = this.db.prepare(`
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
    `);

    return stmt.all(limit) || [];
  }

  // ─────────────────────────────────────────────────────────────
  // Quality Trending (Added 2026-01-06)
  // ─────────────────────────────────────────────────────────────

  /**
   * Get quality trend over time - daily average confidence scores
   * @param {string} period - Time period (7d, 30d, 90d)
   * @returns {Array<{day: string, avgConfidence: number, articleCount: number, highQuality: number, lowQuality: number}>}
   */
  getQualityTrend(period = '30d') {
    const days = this._parsePeriod(period);
    
    const stmt = this.db.prepare(`
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
    `);
    
    const rows = stmt.all(days) || [];
    
    return rows.map(row => ({
      day: row.day,
      avgConfidence: row.avg_confidence != null ? Math.round(row.avg_confidence * 1000) / 1000 : null,
      articleCount: row.article_count || 0,
      highQuality: row.high_quality || 0,
      lowQuality: row.low_quality || 0,
      highQualityPercent: row.article_count > 0 
        ? Math.round((row.high_quality / row.article_count) * 1000) / 10 
        : 0
    }));
  }

  /**
   * Get quality by classification type over time
   * @param {string} period - Time period
   * @returns {Object} Breakdown by classification with trends
   */
  getQualityByClassification(period = '30d') {
    const days = this._parsePeriod(period);
    
    const stmt = this.db.prepare(`
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
    `);
    
    const rows = stmt.all(days) || [];
    
    return rows.map(row => ({
      classification: row.classification,
      avgConfidence: row.avg_confidence != null ? Math.round(row.avg_confidence * 1000) / 1000 : null,
      count: row.count || 0,
      minConfidence: row.min_confidence,
      maxConfidence: row.max_confidence
    }));
  }

  /**
   * Get domains with improving or declining quality
   * @param {string} period - Comparison period
   * @param {number} minArticles - Minimum articles to include
   * @returns {Object} { improving: [], declining: [] }
   */
  getQualityMovers(period = '7d', minArticles = 10) {
    const days = this._parsePeriod(period);
    
    const stmt = this.db.prepare(`
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
    
    try {
      const rows = stmt.all(days, minArticles, days, days, minArticles) || [];
      
      const improving = rows
        .filter(r => r.change > 0.05)
        .slice(0, 10)
        .map(r => ({
          host: r.host,
          currentAvg: Math.round(r.current_avg * 1000) / 1000,
          previousAvg: Math.round(r.previous_avg * 1000) / 1000,
          change: Math.round(r.change * 1000) / 1000,
          changePercent: r.change_percent,
          articleCount: r.article_count
        }));
      
      const declining = rows
        .filter(r => r.change < -0.05)
        .sort((a, b) => a.change - b.change)
        .slice(0, 10)
        .map(r => ({
          host: r.host,
          currentAvg: Math.round(r.current_avg * 1000) / 1000,
          previousAvg: Math.round(r.previous_avg * 1000) / 1000,
          change: Math.round(r.change * 1000) / 1000,
          changePercent: r.change_percent,
          articleCount: r.article_count
        }));
      
      return { improving, declining };
    } catch (err) {
      console.warn('getQualityMovers query failed:', err.message);
      return { improving: [], declining: [] };
    }
  }

  /**
   * Parse period string to days
   * @param {string} period - Period string (7d, 30d, etc)
   * @returns {number}
   */
  _parsePeriod(period) {
    if (typeof period === 'number') return period;
    const match = String(period).match(/^(\d+)d?$/i);
    return match ? parseInt(match[1], 10) : 30;
  }
}

module.exports = { QualityMetricsService };
