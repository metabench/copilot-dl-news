'use strict';

/**
 * QualityMetricsService - Aggregates extraction quality data from DB
 * 
 * Provides:
 * - getSummary() - Overall quality metrics
 * - getDomains(options) - Per-domain quality scores
 * - getRegressions(threshold) - Domains with quality drops
 * - getConfidenceDistribution() - Histogram buckets
 * 
 * All SQL queries are in the DB adapter layer:
 * src/db/sqlite/v1/queries/ui/qualityMetrics.js
 */

const { createQualityMetricsQueries } = require('../../../db/sqlite/v1/queries/ui/qualityMetrics');

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
    this.queries = createQualityMetricsQueries(db);
  }

  /**
   * Get overall quality summary
   * @returns {QualitySummary}
   */
  getSummary() {
    const stats = this.queries.getSummary();

    // Get classification breakdown
    const classificationRows = this.queries.getClassificationBreakdown();
    const classificationBreakdown = {};
    for (const row of classificationRows) {
      classificationBreakdown[row.classification] = {
        count: row.count,
        avgConfidence: row.avg_confidence
      };
    }

    // Get method breakdown
    const methodRows = this.queries.getMethodBreakdown();
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

    const rows = sortBy === 'count' 
      ? this.queries.getDomainsByCount(minArticles, limit)
      : this.queries.getDomainsByConfidence(minArticles, limit);

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

    // Handle DESC sort for confidence (query returns ASC)
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
    try {
      const rows = this.queries.getRegressions(lookbackDays, threshold);
      return rows.map(row => ({
        host: row.host,
        previousAvg: row.previous_avg,
        currentAvg: row.current_avg,
        dropPercent: row.drop_percent,
        articleCount: row.article_count,
        detectedAt: new Date().toISOString()
      }));
    } catch (err) {
      console.warn('getRegressions query failed:', err.message);
      return [];
    }
  }

  /**
   * Get confidence score distribution as histogram buckets
   * @returns {HistogramBucket[]}
   */
  getConfidenceDistribution() {
    const rows = this.queries.getHistogram();
    const total = this.queries.getTotalCount();

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
    return this.queries.getRecentActivity(limit);
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
    const rows = this.queries.getQualityTrend(days);
    
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
    const rows = this.queries.getQualityByClassification(days);
    
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
    
    try {
      const rows = this.queries.getQualityMovers(days, minArticles);
      
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
