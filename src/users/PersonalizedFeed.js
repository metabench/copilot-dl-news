'use strict';

/**
 * PersonalizedFeed - Generate personalized article feeds
 * 
 * Combines:
 * - User preferences (category/topic/source weights)
 * - Content freshness (recency)
 * - Trending signals
 * - Domain diversity (prevent single-source domination)
 * 
 * Handles cold-start (new users) with trending + editorially curated content.
 * 
 * @module PersonalizedFeed
 */

/**
 * Default weights for feed scoring
 */
const DEFAULT_WEIGHTS = {
  preference: 0.5,   // Match to user interests
  recency: 0.3,      // How recent the article is
  trending: 0.2      // Trending score
};

/**
 * Max articles from same domain
 */
const MAX_PER_DOMAIN = 3;

/**
 * Days of content to consider
 */
const CONTENT_WINDOW_DAYS = 7;

/**
 * PersonalizedFeed class
 */
class PersonalizedFeed {
  /**
   * Create a PersonalizedFeed
   * 
   * @param {Object} options - Configuration
   * @param {Object} options.userAdapter - User database adapter
   * @param {Object} [options.preferenceLearner] - Preference learner instance
   * @param {Object} [options.logger] - Logger instance
   * @param {Object} [options.weights] - Scoring weights
   */
  constructor(options = {}) {
    if (!options.userAdapter) {
      throw new Error('PersonalizedFeed requires a userAdapter');
    }
    
    this.userAdapter = options.userAdapter;
    this.preferenceLearner = options.preferenceLearner || null;
    this.logger = options.logger || console;
    this.weights = { ...DEFAULT_WEIGHTS, ...options.weights };
  }

  /**
   * Generate personalized feed for a user
   * 
   * @param {number} userId - User ID
   * @param {Object} [options] - Feed options
   * @param {number} [options.limit=30] - Max articles
   * @param {number} [options.offset=0] - Pagination offset
   * @param {boolean} [options.excludeViewed=true] - Exclude already-viewed articles
   * @returns {Object} Feed with articles and metadata
   */
  async generateFeed(userId, { limit = 30, offset = 0, excludeViewed = true } = {}) {
    // Get user preferences
    const preferences = this.userAdapter.getPreferences(userId);
    
    // Check for cold-start
    if (!preferences || this._isEmptyPreferences(preferences)) {
      this.logger.log(`[PersonalizedFeed] Cold-start feed for user ${userId}`);
      return this._generateColdStartFeed(userId, { limit, offset, excludeViewed });
    }
    
    // Get viewed content IDs for exclusion
    const viewedIds = excludeViewed 
      ? this.userAdapter.getViewedContentIds(userId) 
      : new Set();
    
    // Fetch candidate articles from different sources
    const candidates = await this._fetchCandidates(preferences, viewedIds, limit * 3);
    
    // Score and rank candidates
    const scoredCandidates = this._scoreArticles(candidates, preferences);
    
    // Apply diversity filter
    const diversified = this._applyDiversity(scoredCandidates, MAX_PER_DOMAIN);
    
    // Paginate
    const feedArticles = diversified.slice(offset, offset + limit);
    
    return {
      userId,
      articles: feedArticles,
      total: diversified.length,
      offset,
      limit,
      personalized: true,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Generate feed for cold-start users (no preferences yet)
   * 
   * @param {number} userId - User ID
   * @param {Object} options - Feed options
   * @returns {Object} Cold-start feed
   */
  async _generateColdStartFeed(userId, { limit, offset, excludeViewed }) {
    const viewedIds = excludeViewed 
      ? this.userAdapter.getViewedContentIds(userId) 
      : new Set();
    
    // Mix trending + recent articles
    const trending = this.userAdapter.getTrendingArticles(limit);
    const recent = this.userAdapter.getRecentArticles(limit);
    
    // Merge and dedupe
    const seenIds = new Set();
    const candidates = [];
    
    // Interleave trending and recent
    for (let i = 0; i < Math.max(trending.length, recent.length); i++) {
      if (i < trending.length) {
        const article = trending[i];
        if (!seenIds.has(article.contentId) && !viewedIds.has(article.contentId)) {
          seenIds.add(article.contentId);
          candidates.push({
            ...article,
            score: 1.0 - (i * 0.02), // Decay by position
            reasons: ['trending']
          });
        }
      }
      if (i < recent.length) {
        const article = recent[i];
        if (!seenIds.has(article.contentId) && !viewedIds.has(article.contentId)) {
          seenIds.add(article.contentId);
          candidates.push({
            ...article,
            score: 0.8 - (i * 0.02),
            reasons: ['recent']
          });
        }
      }
    }
    
    // Sort by score
    candidates.sort((a, b) => b.score - a.score);
    
    // Apply diversity
    const diversified = this._applyDiversity(candidates, MAX_PER_DOMAIN);
    
    // Paginate
    const feedArticles = diversified.slice(offset, offset + limit);
    
    return {
      userId,
      articles: feedArticles,
      total: diversified.length,
      offset,
      limit,
      personalized: false,
      coldStart: true,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Fetch candidate articles based on preferences
   * 
   * @param {Object} preferences - User preferences
   * @param {Set} viewedIds - Already-viewed content IDs
   * @param {number} limit - Max candidates to fetch
   * @returns {Array} Candidate articles
   * @private
   */
  async _fetchCandidates(preferences, viewedIds, limit) {
    const candidates = new Map(); // contentId -> article
    
    // Get articles by top categories
    const topCategories = Object.entries(preferences.categoryWeights)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    for (const [category, weight] of topCategories) {
      const perCategory = Math.ceil(limit * weight);
      const articles = this.userAdapter.getArticlesByCategory(category, perCategory);
      
      for (const article of articles) {
        if (!viewedIds.has(article.contentId) && !candidates.has(article.contentId)) {
          candidates.set(article.contentId, {
            ...article,
            matchedCategory: category,
            categoryWeight: weight
          });
        }
      }
    }
    
    // Add trending to fill gaps
    if (candidates.size < limit) {
      const trending = this.userAdapter.getTrendingArticles(limit - candidates.size);
      for (const article of trending) {
        if (!viewedIds.has(article.contentId) && !candidates.has(article.contentId)) {
          candidates.set(article.contentId, {
            ...article,
            isTrending: true
          });
        }
      }
    }
    
    // Add recent if still short
    if (candidates.size < limit) {
      const recent = this.userAdapter.getRecentArticles(limit - candidates.size);
      for (const article of recent) {
        if (!viewedIds.has(article.contentId) && !candidates.has(article.contentId)) {
          candidates.set(article.contentId, article);
        }
      }
    }
    
    return Array.from(candidates.values());
  }

  /**
   * Score articles based on preferences and other signals
   * 
   * @param {Array} articles - Candidate articles
   * @param {Object} preferences - User preferences
   * @returns {Array} Scored articles
   * @private
   */
  _scoreArticles(articles, preferences) {
    const now = Date.now();
    
    return articles.map(article => {
      let score = 0;
      const reasons = [];
      
      // Preference match score
      let prefScore = 0;
      
      // Category match
      if (article.category && preferences.categoryWeights[article.category]) {
        prefScore += preferences.categoryWeights[article.category] * 0.6;
        reasons.push(`category:${article.category}`);
      }
      
      // Source match
      if (article.host && preferences.sourceWeights && preferences.sourceWeights[article.host]) {
        prefScore += preferences.sourceWeights[article.host] * 0.4;
        reasons.push(`source:${article.host}`);
      }
      
      score += prefScore * this.weights.preference;
      
      // Recency score (decay over 7 days)
      if (article.createdAt) {
        const articleTime = new Date(article.createdAt).getTime();
        const ageHours = (now - articleTime) / (1000 * 60 * 60);
        const recencyScore = Math.max(0, 1 - (ageHours / (CONTENT_WINDOW_DAYS * 24)));
        score += recencyScore * this.weights.recency;
        
        if (recencyScore > 0.8) {
          reasons.push('fresh');
        }
      }
      
      // Trending score
      if (article.trendScore) {
        const normalizedTrend = Math.min(1, article.trendScore / 100);
        score += normalizedTrend * this.weights.trending;
        
        if (normalizedTrend > 0.5) {
          reasons.push('trending');
        }
      } else if (article.isTrending) {
        score += 0.5 * this.weights.trending;
        reasons.push('trending');
      }
      
      return {
        ...article,
        score: Math.round(score * 1000) / 1000,
        reasons
      };
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * Apply domain diversity filter
   * 
   * @param {Array} articles - Scored articles
   * @param {number} maxPerDomain - Max articles from same domain
   * @returns {Array} Diversified articles
   * @private
   */
  _applyDiversity(articles, maxPerDomain) {
    const domainCounts = {};
    const diversified = [];
    
    for (const article of articles) {
      const domain = article.host || 'unknown';
      const count = domainCounts[domain] || 0;
      
      if (count < maxPerDomain) {
        diversified.push(article);
        domainCounts[domain] = count + 1;
      }
    }
    
    return diversified;
  }

  /**
   * Check if preferences are empty/minimal
   * 
   * @param {Object} preferences - Preferences object
   * @returns {boolean} True if empty
   * @private
   */
  _isEmptyPreferences(preferences) {
    const categoryCount = Object.keys(preferences.categoryWeights || {}).length;
    const topicCount = Object.keys(preferences.topicWeights || {}).length;
    
    return categoryCount === 0 && topicCount === 0;
  }

  /**
   * Preview feed without user (for testing/demo)
   * 
   * @param {Object} mockPreferences - Mock preference weights
   * @param {number} [limit=20] - Max articles
   * @returns {Object} Preview feed
   */
  async previewFeed(mockPreferences, limit = 20) {
    const candidates = await this._fetchCandidates(mockPreferences, new Set(), limit * 2);
    const scored = this._scoreArticles(candidates, mockPreferences);
    const diversified = this._applyDiversity(scored, MAX_PER_DOMAIN);
    
    return {
      articles: diversified.slice(0, limit),
      total: diversified.length,
      preview: true,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Get feed statistics for a user
   * 
   * @param {number} userId - User ID
   * @returns {Object} Feed stats
   */
  getFeedStats(userId) {
    const preferences = this.userAdapter.getPreferences(userId);
    const eventCounts = this.userAdapter.getEventCounts(userId, 30);
    
    return {
      userId,
      hasPreferences: !!preferences && !this._isEmptyPreferences(preferences),
      preferencesUpdatedAt: preferences?.updatedAt || null,
      categoryCount: Object.keys(preferences?.categoryWeights || {}).length,
      topicCount: Object.keys(preferences?.topicWeights || {}).length,
      recentEvents: eventCounts,
      coldStartMode: !preferences || this._isEmptyPreferences(preferences)
    };
  }
}

module.exports = {
  PersonalizedFeed,
  DEFAULT_WEIGHTS,
  MAX_PER_DOMAIN,
  CONTENT_WINDOW_DAYS
};
