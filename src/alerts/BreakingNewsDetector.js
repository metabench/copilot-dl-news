'use strict';

/**
 * BreakingNewsDetector - Detect breaking news from article velocity and patterns
 * 
 * Algorithm:
 * 1. Track article velocity per story cluster (from Topic/Story clustering)
 * 2. If >5 sources publish same story in 30 min → breaking
 * 3. Check for keywords: 'breaking', 'just in', 'developing', 'alert'
 * 4. High sentiment deviation from baseline → potential breaking
 * 
 * @module BreakingNewsDetector
 */

/**
 * Breaking news detection thresholds
 */
const THRESHOLDS = {
  // Minimum sources publishing same story in time window to be "breaking"
  MIN_SOURCES: 5,
  
  // Time window in minutes for velocity calculation
  TIME_WINDOW_MINUTES: 30,
  
  // Keywords that indicate breaking news
  BREAKING_KEYWORDS: [
    'breaking',
    'breaking news',
    'just in',
    'developing',
    'alert',
    'urgent',
    'live updates',
    'happening now',
    'exclusive'
  ],
  
  // Minimum velocity (articles per hour) to consider breaking
  MIN_VELOCITY: 1.0,
  
  // Sentiment deviation threshold (z-score)
  SENTIMENT_DEVIATION_THRESHOLD: 2.0
};

/**
 * BreakingNewsDetector class
 */
class BreakingNewsDetector {
  /**
   * Create a BreakingNewsDetector
   * 
   * @param {Object} [options] - Configuration
   * @param {Object} [options.alertAdapter] - Alert database adapter
   * @param {Object} [options.topicAdapter] - Topic database adapter (for story clusters)
   * @param {Object} [options.trendDetector] - TrendDetector for baseline comparison
   * @param {Object} [options.logger] - Logger instance
   * @param {Object} [options.thresholds] - Override default thresholds
   */
  constructor(options = {}) {
    this.alertAdapter = options.alertAdapter || null;
    this.topicAdapter = options.topicAdapter || null;
    this.trendDetector = options.trendDetector || null;
    this.logger = options.logger || console;
    
    this.thresholds = { ...THRESHOLDS, ...options.thresholds };
    
    // In-memory tracking for velocity calculation
    // Map<storyId, { articles: [{id, host, timestamp}], firstSeen: Date }>
    this._storyTracking = new Map();
    
    // Recent articles for velocity window
    // Array of { articleId, storyId, host, timestamp }
    this._recentArticles = [];
    
    // Breaking news baseline (for sentiment deviation)
    this._sentimentBaseline = {
      mean: 0,
      stddev: 0.3,
      samples: 0
    };
  }

  /**
   * Check if an article represents breaking news
   * 
   * @param {Object} article - Article to check
   * @param {Object} [context] - Additional context
   * @param {number} [context.storyId] - Story cluster ID
   * @param {Object} [context.sentiment] - Pre-computed sentiment
   * @returns {{isBreaking: boolean, signals: Object, confidence: number}}
   */
  detect(article, context = {}) {
    const signals = {
      hasBreakingKeywords: false,
      matchedKeywords: [],
      highVelocity: false,
      velocity: 0,
      sourceCount: 0,
      sentimentDeviation: false,
      sentimentZScore: 0
    };

    // 1. Check for breaking keywords
    const keywordResult = this._checkBreakingKeywords(article);
    signals.hasBreakingKeywords = keywordResult.found;
    signals.matchedKeywords = keywordResult.keywords;

    // 2. Check velocity (if we have story tracking)
    if (context.storyId) {
      const velocityResult = this._checkVelocity(context.storyId, article);
      signals.highVelocity = velocityResult.isHigh;
      signals.velocity = velocityResult.velocity;
      signals.sourceCount = velocityResult.sourceCount;
    }

    // 3. Check sentiment deviation
    if (context.sentiment) {
      const deviationResult = this._checkSentimentDeviation(context.sentiment);
      signals.sentimentDeviation = deviationResult.isDeviation;
      signals.sentimentZScore = deviationResult.zScore;
    }

    // Determine if breaking news
    const isBreaking = this._evaluateSignals(signals);
    const confidence = this._calculateConfidence(signals);

    return {
      isBreaking,
      signals,
      confidence
    };
  }

  /**
   * Process a new article and update tracking
   * 
   * @param {Object} article - New article
   * @param {number} [storyId] - Story cluster ID (if known)
   * @returns {{isBreaking: boolean, breakingNewsId: number|null}}
   */
  processArticle(article, storyId = null) {
    const timestamp = new Date();
    const articleId = article.id || article.contentId;
    const host = article.host || this._extractHost(article.url);

    // Add to recent articles
    this._recentArticles.push({
      articleId,
      storyId,
      host,
      timestamp
    });

    // Clean up old articles (older than 2x time window)
    this._cleanupRecentArticles();

    // Update story tracking if we have a story ID
    if (storyId) {
      this._updateStoryTracking(storyId, articleId, host, timestamp);
    }

    // Update sentiment baseline
    if (article.sentiment) {
      this._updateSentimentBaseline(article.sentiment);
    }

    // Check for breaking news
    const result = this.detect(article, {
      storyId,
      sentiment: article.sentiment
    });

    // Record if breaking news detected
    let breakingNewsId = null;
    if (result.isBreaking && this.alertAdapter) {
      // Check if we already have breaking news for this story
      const existing = storyId ? this.alertAdapter.getBreakingNewsByStory(storyId) : null;
      
      if (existing) {
        // Update existing breaking news
        this.alertAdapter.updateBreakingNewsCount(
          storyId,
          result.signals.sourceCount,
          result.signals.velocity
        );
        breakingNewsId = existing.id;
      } else {
        // Create new breaking news record
        const { id } = this.alertAdapter.recordBreakingNews({
          storyId,
          sourceCount: result.signals.sourceCount,
          velocity: result.signals.velocity,
          keywordsMatched: result.signals.matchedKeywords
        });
        breakingNewsId = id;
      }
    }

    return {
      isBreaking: result.isBreaking,
      breakingNewsId,
      signals: result.signals,
      confidence: result.confidence
    };
  }

  /**
   * Check article for breaking news keywords
   * @private
   */
  _checkBreakingKeywords(article) {
    const text = `${article.title || ''} ${article.body || article.content || ''}`.toLowerCase();
    const matchedKeywords = [];

    for (const keyword of this.thresholds.BREAKING_KEYWORDS) {
      if (text.includes(keyword.toLowerCase())) {
        matchedKeywords.push(keyword);
      }
    }

    return {
      found: matchedKeywords.length > 0,
      keywords: matchedKeywords
    };
  }

  /**
   * Check velocity for a story
   * @private
   */
  _checkVelocity(storyId, article) {
    const tracking = this._storyTracking.get(storyId);
    
    if (!tracking) {
      return { isHigh: false, velocity: 0, sourceCount: 0 };
    }

    const now = new Date();
    const windowStart = new Date(now.getTime() - this.thresholds.TIME_WINDOW_MINUTES * 60 * 1000);

    // Count articles in the time window
    const recentArticles = tracking.articles.filter(a => a.timestamp >= windowStart);
    const uniqueSources = new Set(recentArticles.map(a => a.host)).size;

    // Calculate velocity (articles per hour)
    const hoursInWindow = this.thresholds.TIME_WINDOW_MINUTES / 60;
    const velocity = recentArticles.length / hoursInWindow;

    const isHigh = uniqueSources >= this.thresholds.MIN_SOURCES || 
                   velocity >= this.thresholds.MIN_VELOCITY;

    return {
      isHigh,
      velocity: Math.round(velocity * 100) / 100,
      sourceCount: uniqueSources
    };
  }

  /**
   * Check if sentiment deviates from baseline
   * @private
   */
  _checkSentimentDeviation(sentiment) {
    const score = typeof sentiment === 'number' 
      ? sentiment 
      : (sentiment.score || sentiment.overallScore || 0);

    if (this._sentimentBaseline.samples < 10) {
      // Not enough data for baseline
      return { isDeviation: false, zScore: 0 };
    }

    const zScore = (score - this._sentimentBaseline.mean) / this._sentimentBaseline.stddev;
    const isDeviation = Math.abs(zScore) >= this.thresholds.SENTIMENT_DEVIATION_THRESHOLD;

    return {
      isDeviation,
      zScore: Math.round(zScore * 100) / 100
    };
  }

  /**
   * Evaluate all signals to determine if breaking news
   * @private
   */
  _evaluateSignals(signals) {
    // High velocity alone is breaking
    if (signals.highVelocity && signals.sourceCount >= this.thresholds.MIN_SOURCES) {
      return true;
    }

    // Breaking keywords + some velocity
    if (signals.hasBreakingKeywords && signals.velocity > 0.5) {
      return true;
    }

    // Multiple strong keywords
    if (signals.matchedKeywords.length >= 2) {
      return true;
    }

    // Sentiment deviation + keywords
    if (signals.sentimentDeviation && signals.hasBreakingKeywords) {
      return true;
    }

    return false;
  }

  /**
   * Calculate confidence score for breaking news detection
   * @private
   */
  _calculateConfidence(signals) {
    let score = 0;

    // Velocity contribution (max 0.4)
    if (signals.highVelocity) {
      score += Math.min(0.4, signals.sourceCount / this.thresholds.MIN_SOURCES * 0.4);
    }

    // Keyword contribution (max 0.3)
    if (signals.hasBreakingKeywords) {
      score += Math.min(0.3, signals.matchedKeywords.length * 0.1);
    }

    // Sentiment contribution (max 0.2)
    if (signals.sentimentDeviation) {
      score += Math.min(0.2, Math.abs(signals.sentimentZScore) / 3 * 0.2);
    }

    // Base score if any signal
    if (signals.highVelocity || signals.hasBreakingKeywords || signals.sentimentDeviation) {
      score = Math.max(score, 0.1);
    }

    return Math.min(1, Math.round(score * 100) / 100);
  }

  /**
   * Update story tracking with new article
   * @private
   */
  _updateStoryTracking(storyId, articleId, host, timestamp) {
    if (!this._storyTracking.has(storyId)) {
      this._storyTracking.set(storyId, {
        articles: [],
        firstSeen: timestamp
      });
    }

    const tracking = this._storyTracking.get(storyId);
    tracking.articles.push({ articleId, host, timestamp });

    // Limit tracking size per story
    if (tracking.articles.length > 100) {
      tracking.articles = tracking.articles.slice(-100);
    }
  }

  /**
   * Update sentiment baseline with new sample
   * @private
   */
  _updateSentimentBaseline(sentiment) {
    const score = typeof sentiment === 'number' 
      ? sentiment 
      : (sentiment.score || sentiment.overallScore || 0);

    // Exponential moving average
    const alpha = 0.1;
    this._sentimentBaseline.mean = 
      alpha * score + (1 - alpha) * this._sentimentBaseline.mean;
    
    // Update stddev approximation
    const deviation = Math.abs(score - this._sentimentBaseline.mean);
    this._sentimentBaseline.stddev = 
      alpha * deviation + (1 - alpha) * this._sentimentBaseline.stddev;
    
    this._sentimentBaseline.samples++;
  }

  /**
   * Public cleanup method for removing old articles from recent tracking
   * Calls the internal cleanup and optionally removes expired breaking news from DB
   */
  cleanup() {
    this._cleanupRecentArticles();
    
    // Also clean up expired breaking news from database if adapter available
    if (this.alertAdapter && typeof this.alertAdapter.deleteExpiredBreakingNews === 'function') {
      this.alertAdapter.deleteExpiredBreakingNews();
    }
  }

  /**
   * Clean up old articles from recent tracking
   * @private
   */
  _cleanupRecentArticles() {
    const cutoff = new Date(
      Date.now() - this.thresholds.TIME_WINDOW_MINUTES * 2 * 60 * 1000
    );

    this._recentArticles = this._recentArticles.filter(a => a.timestamp >= cutoff);

    // Also clean up story tracking
    for (const [storyId, tracking] of this._storyTracking.entries()) {
      tracking.articles = tracking.articles.filter(a => a.timestamp >= cutoff);
      
      // Remove empty story tracking
      if (tracking.articles.length === 0) {
        this._storyTracking.delete(storyId);
      }
    }
  }

  /**
   * Extract host from URL
   * @private
   */
  _extractHost(url) {
    if (!url) return '';
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  }

  /**
   * Get current breaking news items
   * 
   * @param {number} [limit=20] - Max items
   * @returns {Array<Object>}
   */
  getBreakingNews(limit = 20) {
    if (!this.alertAdapter) {
      // Return from in-memory tracking
      const breaking = [];
      for (const [storyId, tracking] of this._storyTracking.entries()) {
        const velocity = this._checkVelocity(storyId, {});
        if (velocity.isHigh) {
          breaking.push({
            storyId,
            sourceCount: velocity.sourceCount,
            velocity: velocity.velocity,
            firstSeen: tracking.firstSeen
          });
        }
      }
      return breaking.slice(0, limit);
    }

    return this.alertAdapter.getBreakingNews(limit);
  }

  /**
   * Get detector statistics
   * 
   * @returns {Object}
   */
  getStats() {
    return {
      trackedStories: this._storyTracking.size,
      recentArticles: this._recentArticles.length,
      sentimentBaseline: {
        mean: Math.round(this._sentimentBaseline.mean * 1000) / 1000,
        stddev: Math.round(this._sentimentBaseline.stddev * 1000) / 1000,
        samples: this._sentimentBaseline.samples
      },
      thresholds: this.thresholds
    };
  }

  /**
   * Reset detector state
   */
  reset() {
    this._storyTracking.clear();
    this._recentArticles = [];
    this._sentimentBaseline = {
      mean: 0,
      stddev: 0.3,
      samples: 0
    };
  }
}

module.exports = {
  BreakingNewsDetector,
  BREAKING_THRESHOLDS: THRESHOLDS,
  THRESHOLDS  // Keep backwards compatibility
};
