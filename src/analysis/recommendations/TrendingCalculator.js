'use strict';

/**
 * TrendingCalculator - Computes trend scores for articles
 * 
 * Uses exponential decay based on view count and recency:
 * trend_score = log(view_count + 1) * e^(-(now - last_view) / 86400)
 * 
 * Scores are normalized to 0-1 range for hybrid scoring.
 * 
 * @module TrendingCalculator
 */

/**
 * Default decay rate (24 hours in seconds)
 */
const DEFAULT_DECAY_RATE = 86400;

/**
 * TrendingCalculator class
 */
class TrendingCalculator {
  /**
   * Create a TrendingCalculator
   * 
   * @param {Object} [options] - Configuration
   * @param {Object} [options.recommendationAdapter] - Database adapter
   * @param {Object} [options.logger] - Logger instance
   * @param {number} [options.decayRate=86400] - Decay rate in seconds (default: 24 hours)
   */
  constructor(options = {}) {
    this.recommendationAdapter = options.recommendationAdapter || null;
    this.logger = options.logger || console;
    this.decayRate = options.decayRate || DEFAULT_DECAY_RATE;
    
    // Cache for normalization
    this._maxScore = 0;
    this._lastNormalizationTime = 0;
  }
  
  /**
   * Compute raw trend score for an article
   * 
   * Formula: log(view_count + 1) * e^(-(age_seconds) / decay_rate)
   * 
   * @param {number} viewCount - Number of views
   * @param {Date|string} lastViewAt - Last view timestamp
   * @param {Date} [now] - Current time (for testing)
   * @returns {number} Raw trend score
   */
  computeRawScore(viewCount, lastViewAt, now = new Date()) {
    if (viewCount <= 0) {
      return 0;
    }
    
    const lastView = lastViewAt instanceof Date ? lastViewAt : new Date(lastViewAt);
    const nowTime = now instanceof Date ? now : new Date(now);
    
    // Age in seconds
    const ageSeconds = Math.max(0, (nowTime.getTime() - lastView.getTime()) / 1000);
    
    // Base score from view count (logarithmic)
    const baseScore = Math.log(viewCount + 1);
    
    // Decay factor (exponential)
    const decayFactor = Math.exp(-ageSeconds / this.decayRate);
    
    return baseScore * decayFactor;
  }
  
  /**
   * Normalize a score to 0-1 range
   * 
   * @param {number} rawScore - Raw trend score
   * @param {number} [maxScore] - Maximum score for normalization
   * @returns {number} Normalized score (0-1)
   */
  normalizeScore(rawScore, maxScore = null) {
    if (rawScore <= 0) {
      return 0;
    }
    
    const max = maxScore || this._maxScore || 1;
    return Math.min(1, rawScore / max);
  }
  
  /**
   * Get trend score for an article
   * 
   * @param {number} contentId - Content ID
   * @returns {{score: number, normalized: number, viewCount: number, lastViewAt: string}|null}
   */
  getTrendScore(contentId) {
    if (!this.recommendationAdapter) {
      return null;
    }
    
    const trending = this.recommendationAdapter.getTrending(contentId);
    
    if (!trending) {
      return { score: 0, normalized: 0, viewCount: 0, lastViewAt: null };
    }
    
    return {
      score: trending.trendScore,
      normalized: this.normalizeScore(trending.trendScore),
      viewCount: trending.viewCount,
      lastViewAt: trending.lastViewAt
    };
  }
  
  /**
   * Get top trending articles
   * 
   * @param {Object} [options] - Options
   * @param {number} [options.limit=20] - Max articles
   * @param {string} [options.category] - Filter by category
   * @returns {Array<Object>}
   */
  getTopTrending(options = {}) {
    if (!this.recommendationAdapter) {
      return [];
    }
    
    const trending = this.recommendationAdapter.getTopTrending(options);
    
    // Update max score for normalization
    if (trending.length > 0) {
      this._maxScore = Math.max(this._maxScore, trending[0].trendScore);
    }
    
    return trending.map(item => ({
      contentId: item.contentId,
      title: item.title,
      host: item.host,
      score: item.trendScore,
      normalized: this.normalizeScore(item.trendScore),
      viewCount: item.viewCount,
      category: item.category
    }));
  }
  
  /**
   * Record a view for an article (increments view count)
   * 
   * @param {number} contentId - Content ID
   * @returns {{success: boolean}}
   */
  recordView(contentId) {
    if (!this.recommendationAdapter) {
      return { success: false };
    }
    
    this.recommendationAdapter.incrementViews(contentId);
    return { success: true };
  }
  
  /**
   * Recompute trending scores for all articles
   * 
   * Should be called periodically (e.g., hourly) to update decay
   * 
   * @param {Object} [options] - Options
   * @param {Function} [options.onProgress] - Progress callback
   * @returns {{updated: number, maxScore: number, durationMs: number}}
   */
  async recomputeAllScores(options = {}) {
    const { onProgress = null } = options;
    
    if (!this.recommendationAdapter) {
      throw new Error('recommendationAdapter required for recomputation');
    }
    
    const startTime = Date.now();
    const now = new Date();
    
    // Get all articles with views
    const articles = this.recommendationAdapter.getArticlesForTrendingUpdate();
    
    if (articles.length === 0) {
      return { updated: 0, maxScore: 0, durationMs: Date.now() - startTime };
    }
    
    // Compute new scores
    let maxScore = 0;
    const updates = [];
    
    for (const article of articles) {
      const rawScore = this.computeRawScore(
        article.viewCount,
        article.lastViewAt,
        now
      );
      
      maxScore = Math.max(maxScore, rawScore);
      
      updates.push({
        contentId: article.contentId,
        viewCount: article.viewCount,
        lastViewAt: article.lastViewAt,
        trendScore: rawScore
      });
    }
    
    // Bulk save
    const { saved } = this.recommendationAdapter.bulkSaveTrending(updates);
    
    // Update normalization cache
    this._maxScore = maxScore;
    this._lastNormalizationTime = Date.now();
    
    if (onProgress) {
      onProgress({ updated: saved, maxScore, total: articles.length });
    }
    
    this.logger.log(`[TrendingCalculator] Recomputed ${saved} scores, max=${maxScore.toFixed(4)}`);
    
    return {
      updated: saved,
      maxScore,
      durationMs: Date.now() - startTime
    };
  }
  
  /**
   * Get statistics
   * 
   * @returns {Object}
   */
  getStats() {
    const stats = {
      decayRate: this.decayRate,
      maxScore: this._maxScore,
      lastNormalizationTime: this._lastNormalizationTime
        ? new Date(this._lastNormalizationTime).toISOString()
        : null
    };
    
    if (this.recommendationAdapter) {
      const dbStats = this.recommendationAdapter.getStats();
      stats.trendingArticles = dbStats.trendingArticles;
      stats.avgTrendScore = dbStats.avgTrendScore;
      stats.maxViews = dbStats.maxViews;
    }
    
    return stats;
  }
}

/**
 * Create a TrendingCalculator with adapter from database handle
 * 
 * @param {Object} db - better-sqlite3 database instance
 * @param {Object} [options] - Additional options
 * @returns {TrendingCalculator} Configured calculator
 */
function createTrendingCalculator(db, options = {}) {
  const { createRecommendationAdapter } = require('../../db/sqlite/v1/queries/recommendationAdapter');
  
  const recommendationAdapter = createRecommendationAdapter(db);
  
  return new TrendingCalculator({
    recommendationAdapter,
    ...options
  });
}

module.exports = {
  TrendingCalculator,
  createTrendingCalculator,
  DEFAULT_DECAY_RATE
};
