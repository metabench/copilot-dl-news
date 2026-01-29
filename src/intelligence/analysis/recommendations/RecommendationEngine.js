'use strict';

/**
 * RecommendationEngine - Main orchestration for article recommendations
 * 
 * Combines multiple recommendation strategies:
 * - Content-based (SimHash similarity) - weight 0.5
 * - Tag-based (keyword/category overlap) - weight 0.3
 * - Trending (recency-weighted views) - weight 0.2
 * 
 * Features:
 * - Hybrid scoring with configurable weights
 * - Domain diversification (max 2 per domain)
 * - Cold-start handling
 * - Caching for precomputed recommendations
 * 
 * @module RecommendationEngine
 */

const { TrendingCalculator } = require('./TrendingCalculator');
const { ContentRecommender } = require('./ContentRecommender');
const { TagRecommender } = require('./TagRecommender');

/**
 * Default weights for hybrid scoring
 */
const DEFAULT_WEIGHTS = {
  content: 0.5,
  tag: 0.3,
  trending: 0.2
};

/**
 * Max articles from same domain
 */
const MAX_PER_DOMAIN = 2;

/**
 * Recommendation strategies
 */
const STRATEGIES = {
  HYBRID: 'hybrid',
  CONTENT: 'content',
  TAG: 'tag',
  TRENDING: 'trending'
};

/**
 * RecommendationEngine class
 */
class RecommendationEngine {
  /**
   * Create a RecommendationEngine
   * 
   * @param {Object} [options] - Configuration
   * @param {Object} [options.contentRecommender] - Content-based recommender
   * @param {Object} [options.tagRecommender] - Tag-based recommender
   * @param {Object} [options.trendingCalculator] - Trending calculator
   * @param {Object} [options.recommendationAdapter] - Database adapter for caching
   * @param {Object} [options.articlesAdapter] - Articles adapter for metadata
   * @param {Object} [options.logger] - Logger instance
   * @param {Object} [options.weights] - Weight configuration
   * @param {number} [options.maxPerDomain=2] - Max articles from same domain
   */
  constructor(options = {}) {
    this.contentRecommender = options.contentRecommender || null;
    this.tagRecommender = options.tagRecommender || null;
    this.trendingCalculator = options.trendingCalculator || null;
    this.recommendationAdapter = options.recommendationAdapter || null;
    this.articlesAdapter = options.articlesAdapter || null;
    this.logger = options.logger || console;
    
    this.weights = { ...DEFAULT_WEIGHTS, ...options.weights };
    this.maxPerDomain = options.maxPerDomain || MAX_PER_DOMAIN;
    
    this._initialized = false;
  }
  
  /**
   * Initialize the engine (loads detector index, etc.)
   * 
   * @returns {Promise<{initialized: boolean}>}
   */
  async initialize() {
    if (this._initialized) {
      return { initialized: true };
    }
    
    // Initialize content recommender's duplicate detector
    if (this.contentRecommender?.duplicateDetector) {
      await this.contentRecommender.duplicateDetector.initialize();
    }
    
    this._initialized = true;
    return { initialized: true };
  }
  
  /**
   * Get recommendations for an article
   * 
   * @param {number} contentId - Content ID
   * @param {Object} [options] - Options
   * @param {string} [options.strategy='hybrid'] - Strategy: hybrid, content, tag, trending
   * @param {number} [options.limit=10] - Maximum recommendations
   * @param {boolean} [options.useCache=true] - Use cached recommendations if available
   * @param {boolean} [options.diversify=true] - Apply domain diversification
   * @returns {Promise<{recommendations: Array, strategy: string, computedAt: string, cached: boolean}>}
   */
  async getRecommendations(contentId, options = {}) {
    const {
      strategy = STRATEGIES.HYBRID,
      limit = 10,
      useCache = true,
      diversify = true
    } = options;
    
    // Check cache first
    if (useCache && this.recommendationAdapter) {
      const cached = this.recommendationAdapter.getRecommendations(contentId, {
        strategy,
        limit
      });
      
      if (cached && cached.length > 0) {
        return {
          recommendations: cached,
          strategy,
          computedAt: cached[0].computedAt,
          cached: true
        };
      }
    }
    
    // Compute fresh recommendations
    let recommendations;
    
    switch (strategy) {
      case STRATEGIES.CONTENT:
        recommendations = await this._getContentRecommendations(contentId, { limit: limit * 2 });
        break;
      case STRATEGIES.TAG:
        recommendations = await this._getTagRecommendations(contentId, { limit: limit * 2 });
        break;
      case STRATEGIES.TRENDING:
        recommendations = await this._getTrendingRecommendations(contentId, { limit: limit * 2 });
        break;
      case STRATEGIES.HYBRID:
      default:
        recommendations = await this._getHybridRecommendations(contentId, { limit: limit * 2 });
        break;
    }
    
    // Apply diversification
    if (diversify) {
      recommendations = this._diversify(recommendations);
    }
    
    // Limit results
    recommendations = recommendations.slice(0, limit);
    
    // Add reasons
    recommendations = recommendations.map(rec => ({
      ...rec,
      reasons: this._generateReasons(rec)
    }));
    
    const computedAt = new Date().toISOString();
    
    return {
      recommendations,
      strategy,
      computedAt,
      cached: false
    };
  }
  
  /**
   * Get hybrid recommendations (combines all strategies)
   * 
   * @private
   */
  async _getHybridRecommendations(contentId, options = {}) {
    const { limit = 20 } = options;
    
    // Gather recommendations from all sources
    const [contentRecs, tagRecs, trendingRecs] = await Promise.all([
      this._getContentRecommendations(contentId, { limit }),
      this._getTagRecommendations(contentId, { limit }),
      this._getTrendingRecommendations(contentId, { limit })
    ]);
    
    // Merge and score
    const merged = new Map(); // contentId -> merged record
    
    // Add content recommendations
    for (const rec of contentRecs) {
      merged.set(rec.contentId, {
        contentId: rec.contentId,
        contentScore: rec.score,
        tagScore: 0,
        trendingScore: 0,
        title: rec.title,
        host: rec.host,
        url: rec.url,
        sameCategory: false,
        keywordOverlap: 0
      });
    }
    
    // Add tag recommendations
    for (const rec of tagRecs) {
      if (merged.has(rec.contentId)) {
        const existing = merged.get(rec.contentId);
        existing.tagScore = rec.score;
        existing.sameCategory = rec.sameCategory;
        existing.keywordOverlap = rec.keywordOverlap;
        existing.category = rec.category;
      } else {
        merged.set(rec.contentId, {
          contentId: rec.contentId,
          contentScore: 0,
          tagScore: rec.score,
          trendingScore: 0,
          title: rec.title,
          host: rec.host,
          sameCategory: rec.sameCategory,
          keywordOverlap: rec.keywordOverlap,
          category: rec.category
        });
      }
    }
    
    // Add trending scores
    for (const rec of trendingRecs) {
      if (merged.has(rec.contentId)) {
        const existing = merged.get(rec.contentId);
        existing.trendingScore = rec.score;
        existing.viewCount = rec.viewCount;
      } else {
        merged.set(rec.contentId, {
          contentId: rec.contentId,
          contentScore: 0,
          tagScore: 0,
          trendingScore: rec.score,
          title: rec.title,
          host: rec.host,
          viewCount: rec.viewCount,
          category: rec.category
        });
      }
    }
    
    // Compute hybrid scores
    const results = [...merged.values()].map(rec => ({
      ...rec,
      score: this._computeHybridScore(rec.contentScore, rec.tagScore, rec.trendingScore)
    }));
    
    // Sort by hybrid score
    results.sort((a, b) => b.score - a.score);
    
    // Exclude self
    return results.filter(r => r.contentId !== contentId);
  }
  
  /**
   * Compute hybrid score from component scores
   * 
   * @param {number} contentScore - Content similarity score (0-1)
   * @param {number} tagScore - Tag similarity score (0-1)
   * @param {number} trendingScore - Trending score (0-1)
   * @returns {number} Hybrid score (0-1)
   */
  _computeHybridScore(contentScore, tagScore, trendingScore) {
    const { content, tag, trending } = this.weights;
    return (contentScore * content) + (tagScore * tag) + (trendingScore * trending);
  }
  
  /**
   * Get content-based recommendations
   * 
   * @private
   */
  async _getContentRecommendations(contentId, options = {}) {
    if (!this.contentRecommender) {
      return [];
    }
    
    return this.contentRecommender.getRecommendations(contentId, options);
  }
  
  /**
   * Get tag-based recommendations
   * 
   * @private
   */
  async _getTagRecommendations(contentId, options = {}) {
    if (!this.tagRecommender) {
      return [];
    }
    
    return this.tagRecommender.getRecommendations(contentId, options);
  }
  
  /**
   * Get trending recommendations
   * 
   * @private
   */
  async _getTrendingRecommendations(contentId, options = {}) {
    const { limit = 20 } = options;
    
    if (!this.trendingCalculator) {
      return [];
    }
    
    // Get source article's category for filtering
    let category = null;
    if (this.tagRecommender?.tagAdapter) {
      const categoryData = this.tagRecommender.tagAdapter.getCategory(contentId);
      category = categoryData?.category;
    }
    
    const trending = this.trendingCalculator.getTopTrending({
      limit,
      category
    });
    
    return trending
      .filter(t => t.contentId !== contentId)
      .map(t => ({
        contentId: t.contentId,
        score: t.normalized,
        viewCount: t.viewCount,
        title: t.title,
        host: t.host,
        category: t.category
      }));
  }
  
  /**
   * Apply domain diversification
   * 
   * Limits articles from the same domain to prevent recommendation clusters.
   * 
   * @param {Array} recommendations - Recommendations to diversify
   * @returns {Array} Diversified recommendations
   */
  _diversify(recommendations) {
    const domainCounts = new Map();
    const diversified = [];
    
    for (const rec of recommendations) {
      const domain = rec.host || 'unknown';
      const count = domainCounts.get(domain) || 0;
      
      if (count < this.maxPerDomain) {
        diversified.push(rec);
        domainCounts.set(domain, count + 1);
      }
    }
    
    return diversified;
  }
  
  /**
   * Generate human-readable reasons for a recommendation
   * 
   * @param {Object} rec - Recommendation record
   * @returns {Array<string>} Reasons
   */
  _generateReasons(rec) {
    const reasons = [];
    
    if (rec.contentScore && rec.contentScore > 0.5) {
      reasons.push('Similar content');
    }
    
    if (rec.sameCategory) {
      reasons.push(`Same category (${rec.category})`);
    } else if (rec.tagScore && rec.tagScore > 0.3) {
      reasons.push('Related topics');
    }
    
    if (rec.keywordOverlap && rec.keywordOverlap >= 3) {
      reasons.push(`${rec.keywordOverlap} shared keywords`);
    }
    
    if (rec.viewCount && rec.viewCount > 10) {
      reasons.push('Trending');
    }
    
    if (reasons.length === 0) {
      reasons.push('Related article');
    }
    
    return reasons;
  }
  
  /**
   * Handle cold-start: get recommendations for articles with no history
   * 
   * Falls back to category-based or trending articles.
   * 
   * @param {number} contentId - Content ID
   * @param {Object} [options] - Options
   * @returns {Promise<Array>}
   */
  async getColdStartRecommendations(contentId, options = {}) {
    const { limit = 10 } = options;
    
    // Try tag-based first (doesn't need view history)
    if (this.tagRecommender) {
      const tagRecs = await this.tagRecommender.getRecommendations(contentId, { limit });
      
      if (tagRecs.length >= limit / 2) {
        return {
          recommendations: tagRecs.slice(0, limit).map(r => ({
            ...r,
            reasons: this._generateReasons(r)
          })),
          strategy: 'coldstart-tag',
          computedAt: new Date().toISOString(),
          cached: false
        };
      }
    }
    
    // Fall back to trending in same category
    let category = null;
    if (this.tagRecommender?.tagAdapter) {
      const categoryData = this.tagRecommender.tagAdapter.getCategory(contentId);
      category = categoryData?.category;
    }
    
    if (this.trendingCalculator) {
      const trending = this.trendingCalculator.getTopTrending({
        limit,
        category
      });
      
      return {
        recommendations: trending
          .filter(t => t.contentId !== contentId)
          .slice(0, limit)
          .map(t => ({
            contentId: t.contentId,
            score: t.normalized,
            title: t.title,
            host: t.host,
            reasons: ['Popular in category']
          })),
        strategy: 'coldstart-trending',
        computedAt: new Date().toISOString(),
        cached: false
      };
    }
    
    return {
      recommendations: [],
      strategy: 'coldstart-empty',
      computedAt: new Date().toISOString(),
      cached: false
    };
  }
  
  /**
   * Precompute and cache recommendations for an article
   * 
   * @param {number} contentId - Content ID
   * @param {Object} [options] - Options
   * @returns {Promise<{saved: number}>}
   */
  async cacheRecommendations(contentId, options = {}) {
    const { strategy = STRATEGIES.HYBRID, limit = 20 } = options;
    
    if (!this.recommendationAdapter) {
      throw new Error('recommendationAdapter required for caching');
    }
    
    const result = await this.getRecommendations(contentId, {
      strategy,
      limit,
      useCache: false
    });
    
    const toSave = result.recommendations.map(rec => ({
      targetId: rec.contentId,
      score: rec.score,
      reasons: rec.reasons
    }));
    
    return this.recommendationAdapter.saveRecommendations(contentId, toSave, strategy);
  }
  
  /**
   * Batch precompute recommendations for multiple articles
   * 
   * @param {Object} [options] - Options
   * @param {number} [options.batchSize=100] - Articles per batch
   * @param {number} [options.limit] - Max articles to process
   * @param {Function} [options.onProgress] - Progress callback
   * @returns {Promise<{processed: number, durationMs: number}>}
   */
  async batchPrecompute(options = {}) {
    const {
      batchSize = 100,
      limit = null,
      onProgress = null
    } = options;
    
    if (!this.articlesAdapter) {
      throw new Error('articlesAdapter required for batch precomputation');
    }
    
    await this.initialize();
    
    let processed = 0;
    let page = 1;
    const startTime = Date.now();
    
    while (true) {
      const { items: articles } = this.articlesAdapter.listArticles({
        page,
        limit: batchSize
      });
      
      if (articles.length === 0) break;
      
      for (const article of articles) {
        if (limit && processed >= limit) break;
        
        try {
          await this.cacheRecommendations(article.id, { limit: 20 });
          processed++;
          
          if (onProgress && processed % 10 === 0) {
            onProgress({
              processed,
              elapsed: Date.now() - startTime
            });
          }
        } catch (err) {
          this.logger.error(`[RecommendationEngine] Error caching ${article.id}:`, err);
        }
      }
      
      if (limit && processed >= limit) break;
      page++;
    }
    
    return {
      processed,
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
      initialized: this._initialized,
      weights: this.weights,
      maxPerDomain: this.maxPerDomain,
      hasContentRecommender: !!this.contentRecommender,
      hasTagRecommender: !!this.tagRecommender,
      hasTrendingCalculator: !!this.trendingCalculator,
      hasCache: !!this.recommendationAdapter
    };
    
    if (this.recommendationAdapter) {
      stats.cacheStats = this.recommendationAdapter.getStats();
    }
    
    return stats;
  }
}

/**
 * Create a RecommendationEngine with all dependencies from database handle
 * 
 * @param {Object} db - better-sqlite3 database instance
 * @param {Object} [options] - Additional options
 * @returns {RecommendationEngine} Configured engine
 */
function createRecommendationEngine(db, options = {}) {
  const { createRecommendationAdapter } = require('../../../data/db/sqlite/v1/queries/recommendationAdapter');
  const { createArticlesAdapter } = require('../../../data/db/sqlite/v1/queries/articlesAdapter');
  const { createDuplicateDetector } = require('../similarity/DuplicateDetector');
  const { createTagAdapter } = require('../../../data/db/sqlite/v1/queries/tagAdapter');
  
  const recommendationAdapter = createRecommendationAdapter(db);
  const articlesAdapter = createArticlesAdapter(db);
  const duplicateDetector = createDuplicateDetector(db, options);
  const tagAdapter = createTagAdapter(db);
  
  const contentRecommender = new ContentRecommender({
    duplicateDetector,
    ...options
  });
  
  const tagRecommender = new TagRecommender({
    tagAdapter,
    articlesAdapter,
    ...options
  });
  
  const trendingCalculator = new TrendingCalculator({
    recommendationAdapter,
    ...options
  });
  
  return new RecommendationEngine({
    contentRecommender,
    tagRecommender,
    trendingCalculator,
    recommendationAdapter,
    articlesAdapter,
    ...options
  });
}

module.exports = {
  RecommendationEngine,
  createRecommendationEngine,
  DEFAULT_WEIGHTS,
  MAX_PER_DOMAIN,
  STRATEGIES
};
