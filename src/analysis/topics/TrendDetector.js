'use strict';

/**
 * TrendDetector - Emerging topic detection
 * 
 * Detects trending topics by comparing current activity against
 * a rolling baseline. Uses statistical thresholds to identify
 * significant increases in topic activity.
 * 
 * Algorithm:
 * 1. Calculate 7-day rolling average for each topic
 * 2. Compute standard deviation of daily counts
 * 3. Current day > baseline + 2σ = trending
 * 4. Trend score = (current - baseline) / σ
 * 
 * @module TrendDetector
 */

// Number of days for rolling baseline
const BASELINE_DAYS = 7;

// Sigma threshold for trend detection
const TREND_SIGMA_THRESHOLD = 2.0;

// Minimum daily articles to consider for trending
const MIN_DAILY_ARTICLES = 3;

// Maximum trends to return
const MAX_TRENDS = 20;

/**
 * Calculate mean of an array of numbers
 * 
 * @param {number[]} values - Array of values
 * @returns {number} Mean value
 */
function mean(values) {
  if (!values || values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Calculate standard deviation of an array
 * 
 * @param {number[]} values - Array of values
 * @param {number} [avg] - Pre-calculated mean (optional)
 * @returns {number} Standard deviation
 */
function stddev(values, avg = null) {
  if (!values || values.length < 2) return 0;
  
  const m = avg !== null ? avg : mean(values);
  const squaredDiffs = values.map(v => Math.pow(v - m, 2));
  const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
  
  return Math.sqrt(variance);
}

/**
 * Get ISO date string (YYYY-MM-DD) from Date object
 * 
 * @param {Date} date - Date object
 * @returns {string} YYYY-MM-DD format
 */
function toDateString(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Get date N days ago
 * 
 * @param {number} days - Number of days
 * @param {Date} [from] - Starting date (default: now)
 * @returns {Date} Date N days ago
 */
function daysAgo(days, from = new Date()) {
  const date = new Date(from);
  date.setDate(date.getDate() - days);
  return date;
}

/**
 * TrendDetector class
 */
class TrendDetector {
  /**
   * Create a TrendDetector
   * 
   * @param {Object} [options] - Configuration
   * @param {Object} options.topicAdapter - Topic database adapter
   * @param {Object} [options.logger] - Logger instance
   * @param {number} [options.baselineDays=7] - Days for rolling baseline
   * @param {number} [options.sigmaThreshold=2.0] - Sigma for trend detection
   * @param {number} [options.minDailyArticles=3] - Min articles to consider
   */
  constructor(options = {}) {
    this.topicAdapter = options.topicAdapter;
    this.logger = options.logger || console;
    
    this.baselineDays = options.baselineDays || BASELINE_DAYS;
    this.sigmaThreshold = options.sigmaThreshold || TREND_SIGMA_THRESHOLD;
    this.minDailyArticles = options.minDailyArticles || MIN_DAILY_ARTICLES;
    
    // Cache for baselines
    this._baselineCache = new Map();
    this._cacheTimestamp = null;
  }
  
  /**
   * Calculate baseline statistics for a topic
   * 
   * @param {number} topicId - Topic ID
   * @param {string} [asOfDate] - Calculate as of this date (default: today)
   * @returns {{mean: number, stddev: number, values: number[]}}
   */
  calculateBaseline(topicId, asOfDate = null) {
    if (!this.topicAdapter) {
      return { mean: 0, stddev: 1, values: [] };
    }
    
    const endDate = asOfDate ? new Date(asOfDate) : new Date();
    const startDate = daysAgo(this.baselineDays, endDate);
    
    // Get daily article counts for topic
    const dailyCounts = this.topicAdapter.getTopicDailyCounts({
      topicId,
      startDate: toDateString(startDate),
      endDate: toDateString(daysAgo(1, endDate)) // Exclude current day
    });
    
    // Extract just the count values
    const values = dailyCounts.map(d => d.article_count || d.articleCount || 0);
    
    // Ensure we have enough data points
    while (values.length < this.baselineDays) {
      values.push(0); // Pad with zeros if not enough history
    }
    
    const avg = mean(values);
    const sd = stddev(values, avg);
    
    return {
      mean: Math.round(avg * 100) / 100,
      stddev: Math.max(sd, 0.5), // Minimum stddev to avoid division issues
      values
    };
  }
  
  /**
   * Calculate trend score for a topic
   * 
   * @param {number} currentCount - Current day article count
   * @param {{mean: number, stddev: number}} baseline - Baseline stats
   * @returns {{score: number, isTrending: boolean, change: number, percentChange: number}}
   */
  calculateTrendScore(currentCount, baseline) {
    const { mean: baselineMean, stddev: baselineStddev } = baseline;
    
    // Z-score: how many standard deviations above baseline
    const score = (currentCount - baselineMean) / baselineStddev;
    
    // Is it trending?
    const isTrending = score >= this.sigmaThreshold && currentCount >= this.minDailyArticles;
    
    // Absolute change
    const change = currentCount - baselineMean;
    
    // Percent change
    const percentChange = baselineMean > 0 
      ? Math.round(((currentCount - baselineMean) / baselineMean) * 100)
      : currentCount > 0 ? 100 : 0;
    
    return {
      score: Math.round(score * 100) / 100,
      isTrending,
      change: Math.round(change * 100) / 100,
      percentChange
    };
  }
  
  /**
   * Detect trending topics
   * 
   * @param {Object} [options] - Options
   * @param {string} [options.date] - Date to check (default: today)
   * @param {number} [options.limit] - Max trends to return
   * @returns {Array<{topicId: number, topicName: string, score: number, change: number, percentChange: number, currentCount: number, baseline: number}>}
   */
  detectTrends(options = {}) {
    if (!this.topicAdapter) {
      return [];
    }
    
    const date = options.date || toDateString(new Date());
    const limit = options.limit || MAX_TRENDS;
    
    // Get all topics with their current day counts
    const topics = this.topicAdapter.getAllTopics({ includeSeed: true });
    
    const trends = [];
    
    for (const topic of topics) {
      // Get current day count
      const currentCount = this.topicAdapter.getTopicDayCount({
        topicId: topic.id,
        date
      });
      
      // Skip topics with no activity
      if (currentCount === 0) continue;
      
      // Calculate baseline
      const baseline = this.calculateBaseline(topic.id, date);
      
      // Calculate trend score
      const trendInfo = this.calculateTrendScore(currentCount, baseline);
      
      if (trendInfo.isTrending || currentCount >= this.minDailyArticles) {
        trends.push({
          topicId: topic.id,
          topicName: topic.name,
          score: trendInfo.score,
          change: trendInfo.change,
          percentChange: trendInfo.percentChange,
          currentCount,
          baseline: baseline.mean,
          baselineStddev: baseline.stddev,
          isTrending: trendInfo.isTrending
        });
      }
    }
    
    // Sort by score descending
    trends.sort((a, b) => b.score - a.score);
    
    return trends.slice(0, limit);
  }
  
  /**
   * Update daily topic trends in database
   * Aggregates article_topics into topic_trends for the given date
   * 
   * @param {string} [date] - Date to update (default: today)
   * @returns {{updated: number, date: string}}
   */
  updateDailyTrends(date = null) {
    if (!this.topicAdapter) {
      return { updated: 0, date: null };
    }
    
    const targetDate = date || toDateString(new Date());
    
    // Get topics with counts for the day
    const topics = this.topicAdapter.getAllTopics({ includeSeed: true });
    let updated = 0;
    
    for (const topic of topics) {
      const count = this.topicAdapter.getTopicDayCount({
        topicId: topic.id,
        date: targetDate
      });
      
      // Calculate baseline and trend score
      const baseline = this.calculateBaseline(topic.id, targetDate);
      const trendInfo = this.calculateTrendScore(count, baseline);
      
      // Save to topic_trends
      this.topicAdapter.saveTopicTrend({
        topicId: topic.id,
        date: targetDate,
        articleCount: count,
        avgProbability: 0, // TODO: Calculate average probability
        trendScore: trendInfo.score
      });
      
      updated++;
    }
    
    this.logger.log(`[TrendDetector] Updated trends for ${updated} topics on ${targetDate}`);
    
    return { updated, date: targetDate };
  }
  
  /**
   * Get historical trend data for a topic
   * 
   * @param {number} topicId - Topic ID
   * @param {Object} [options] - Options
   * @param {number} [options.days=30] - Number of days to retrieve
   * @returns {Array<{date: string, articleCount: number, trendScore: number}>}
   */
  getTopicHistory(topicId, options = {}) {
    if (!this.topicAdapter) {
      return [];
    }
    
    const days = options.days || 30;
    const endDate = new Date();
    const startDate = daysAgo(days, endDate);
    
    return this.topicAdapter.getTopicTrends({
      topicId,
      startDate: toDateString(startDate),
      endDate: toDateString(endDate)
    });
  }
  
  /**
   * Get emerging topics (new topics with sudden activity)
   * 
   * @param {Object} [options] - Options
   * @param {number} [options.days=3] - Days to look back for "new"
   * @param {number} [options.limit=10] - Max topics to return
   * @returns {Array}
   */
  getEmergingTopics(options = {}) {
    if (!this.topicAdapter) {
      return [];
    }
    
    const days = options.days || 3;
    const limit = options.limit || 10;
    const cutoffDate = toDateString(daysAgo(days));
    
    // Get topics created recently with high activity
    const topics = this.topicAdapter.getRecentTopics({
      sinceDate: cutoffDate,
      minArticles: this.minDailyArticles
    });
    
    return topics.slice(0, limit).map(t => ({
      topicId: t.id,
      topicName: t.name,
      articleCount: t.article_count || t.articleCount,
      createdAt: t.created_at || t.createdAt,
      isNew: true
    }));
  }
  
  /**
   * Detect breaking news signals
   * Looks for topics with rapid increase in last few hours
   * 
   * @param {Object} [options] - Options
   * @param {number} [options.hours=6] - Hours to look back
   * @param {number} [options.minArticles=5] - Min articles in window
   * @returns {Array}
   */
  detectBreakingNews(options = {}) {
    if (!this.topicAdapter) {
      return [];
    }
    
    const hours = options.hours || 6;
    const minArticles = options.minArticles || 5;
    
    // Get topics with recent high activity
    const topics = this.topicAdapter.getTopicsWithRecentActivity({
      hours,
      minArticles
    });
    
    // Calculate velocity (articles per hour)
    return topics.map(t => ({
      topicId: t.id,
      topicName: t.name,
      recentCount: t.recent_count || t.recentCount,
      velocity: Math.round((t.recent_count / hours) * 100) / 100,
      isBreaking: (t.recent_count / hours) >= 1 // At least 1 article per hour
    })).filter(t => t.isBreaking);
  }
  
  /**
   * Get detector statistics
   * 
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      baselineDays: this.baselineDays,
      sigmaThreshold: this.sigmaThreshold,
      minDailyArticles: this.minDailyArticles
    };
  }
}

module.exports = {
  TrendDetector,
  mean,
  stddev,
  toDateString,
  daysAgo,
  BASELINE_DAYS,
  TREND_SIGMA_THRESHOLD,
  MIN_DAILY_ARTICLES,
  MAX_TRENDS
};
