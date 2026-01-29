'use strict';

/**
 * TagRecommender - Tag-based article recommendations
 * 
 * Uses keywords and categories from the Tagging Service (Item 4)
 * to find articles with similar topics.
 * 
 * Scoring:
 * - Jaccard similarity of keyword sets
 * - Same category = +0.3 boost
 * 
 * @module TagRecommender
 */

/**
 * Category match boost
 */
const CATEGORY_BOOST = 0.3;

/**
 * Minimum keyword overlap to consider
 */
const MIN_KEYWORD_OVERLAP = 1;

/**
 * TagRecommender class
 */
class TagRecommender {
  /**
   * Create a TagRecommender
   * 
   * @param {Object} [options] - Configuration
   * @param {Object} [options.tagAdapter] - Tag database adapter
   * @param {Object} [options.articlesAdapter] - Articles database adapter
   * @param {Object} [options.logger] - Logger instance
   * @param {number} [options.categoryBoost=0.3] - Boost for same category
   * @param {number} [options.minKeywordOverlap=1] - Minimum keywords in common
   */
  constructor(options = {}) {
    this.tagAdapter = options.tagAdapter || null;
    this.articlesAdapter = options.articlesAdapter || null;
    this.logger = options.logger || console;
    this.categoryBoost = options.categoryBoost ?? CATEGORY_BOOST;
    this.minKeywordOverlap = options.minKeywordOverlap || MIN_KEYWORD_OVERLAP;
  }
  
  /**
   * Compute Jaccard similarity between two sets
   * 
   * @param {Set|Array} setA - First set
   * @param {Set|Array} setB - Second set
   * @returns {number} Jaccard similarity (0-1)
   */
  jaccardSimilarity(setA, setB) {
    const a = setA instanceof Set ? setA : new Set(setA);
    const b = setB instanceof Set ? setB : new Set(setB);
    
    if (a.size === 0 && b.size === 0) {
      return 0;
    }
    
    let intersection = 0;
    for (const item of a) {
      if (b.has(item)) {
        intersection++;
      }
    }
    
    const union = a.size + b.size - intersection;
    return union > 0 ? intersection / union : 0;
  }
  
  /**
   * Get tag-based recommendations for an article
   * 
   * @param {number} contentId - Content ID to find recommendations for
   * @param {Object} [options] - Options
   * @param {number} [options.limit=20] - Maximum recommendations
   * @param {boolean} [options.includeMetadata=true] - Include title/host
   * @returns {Promise<Array<{contentId: number, score: number, keywordOverlap: number, sameCategory: boolean}>>}
   */
  async getRecommendations(contentId, options = {}) {
    const { limit = 20, includeMetadata = true } = options;
    
    if (!this.tagAdapter) {
      this.logger.warn('[TagRecommender] No tagAdapter configured');
      return [];
    }
    
    try {
      // Get source article's tags
      const sourceTags = this.tagAdapter.getArticleTags(contentId);
      
      if (!sourceTags) {
        return [];
      }
      
      const sourceKeywords = new Set(
        (sourceTags.keywords || []).map(k => k.keyword.toLowerCase())
      );
      const sourceCategory = sourceTags.category?.category;
      
      // If no keywords and no category, cannot recommend
      if (sourceKeywords.size === 0 && !sourceCategory) {
        return [];
      }
      
      // Find candidate articles
      const candidates = await this._findCandidates(contentId, sourceKeywords, sourceCategory, {
        limit: limit * 3 // Get more candidates for scoring
      });
      
      // Score candidates
      const scored = candidates.map(candidate => {
        const candidateKeywords = new Set(
          (candidate.keywords || []).map(k => k.keyword.toLowerCase())
        );
        
        // Jaccard similarity of keywords
        const keywordSim = this.jaccardSimilarity(sourceKeywords, candidateKeywords);
        
        // Count overlap
        let keywordOverlap = 0;
        for (const kw of sourceKeywords) {
          if (candidateKeywords.has(kw)) {
            keywordOverlap++;
          }
        }
        
        // Category match
        const sameCategory = sourceCategory && candidate.category === sourceCategory;
        const categoryBonus = sameCategory ? this.categoryBoost : 0;
        
        // Final score (capped at 1.0)
        const score = Math.min(1, keywordSim + categoryBonus);
        
        return {
          contentId: candidate.contentId,
          score,
          keywordSimilarity: keywordSim,
          keywordOverlap,
          sameCategory,
          category: candidate.category,
          title: candidate.title,
          host: candidate.host
        };
      });
      
      // Filter and sort
      const filtered = scored
        .filter(item => 
          item.contentId !== contentId &&
          (item.keywordOverlap >= this.minKeywordOverlap || item.sameCategory)
        )
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
      
      return filtered;
    } catch (err) {
      this.logger.error('[TagRecommender] Error getting recommendations:', err);
      return [];
    }
  }
  
  /**
   * Find candidate articles based on shared keywords or category
   * 
   * @private
   */
  async _findCandidates(excludeId, sourceKeywords, sourceCategory, options = {}) {
    const { limit = 100 } = options;
    const candidates = new Map(); // contentId -> candidate data
    
    // Find articles with shared keywords
    if (sourceKeywords.size > 0) {
      const keywordArray = [...sourceKeywords].slice(0, 10); // Top 10 keywords
      
      for (const keyword of keywordArray) {
        const articles = this.tagAdapter.getArticlesByKeyword(keyword, {
          page: 1,
          limit: 20
        });
        
        for (const article of articles) {
          if (article.contentId === excludeId) continue;
          
          if (!candidates.has(article.contentId)) {
            // Get full tags for candidate
            const tags = this.tagAdapter.getArticleTags(article.contentId);
            const category = this.tagAdapter.getCategory(article.contentId);
            
            let host = null;
            let title = article.title;
            
            // Get metadata if adapter available
            if (this.articlesAdapter) {
              const meta = this.articlesAdapter.getArticleById(article.contentId);
              if (meta) {
                host = meta.host;
                title = meta.title;
              }
            }
            
            candidates.set(article.contentId, {
              contentId: article.contentId,
              keywords: tags?.keywords || [],
              category: category?.category,
              title,
              host
            });
          }
        }
      }
    }
    
    // Find articles in same category
    if (sourceCategory && candidates.size < limit) {
      const categoryArticles = this.tagAdapter.getArticlesByCategory(sourceCategory, {
        page: 1,
        limit: limit - candidates.size
      });
      
      for (const article of categoryArticles) {
        if (article.contentId === excludeId) continue;
        
        if (!candidates.has(article.contentId)) {
          const tags = this.tagAdapter.getArticleTags(article.contentId);
          
          let host = null;
          let title = article.title;
          
          if (this.articlesAdapter) {
            const meta = this.articlesAdapter.getArticleById(article.contentId);
            if (meta) {
              host = meta.host;
              title = meta.title;
            }
          }
          
          candidates.set(article.contentId, {
            contentId: article.contentId,
            keywords: tags?.keywords || [],
            category: sourceCategory,
            title,
            host
          });
        }
      }
    }
    
    return [...candidates.values()].slice(0, limit);
  }
  
  /**
   * Get recommendations for articles in a specific category (fallback for cold start)
   * 
   * @param {string} category - Category name
   * @param {Object} [options] - Options
   * @param {number} [options.limit=10] - Maximum recommendations
   * @param {number} [options.excludeId] - Content ID to exclude
   * @returns {Array<Object>}
   */
  getCategoryRecommendations(category, options = {}) {
    const { limit = 10, excludeId = null } = options;
    
    if (!this.tagAdapter) {
      return [];
    }
    
    const articles = this.tagAdapter.getArticlesByCategory(category, {
      page: 1,
      limit: limit + (excludeId ? 1 : 0)
    });
    
    return articles
      .filter(a => a.contentId !== excludeId)
      .slice(0, limit)
      .map(a => ({
        contentId: a.contentId,
        score: a.confidence,
        sameCategory: true,
        category,
        title: a.title
      }));
  }
  
  /**
   * Get statistics
   * 
   * @returns {Object}
   */
  getStats() {
    const stats = {
      categoryBoost: this.categoryBoost,
      minKeywordOverlap: this.minKeywordOverlap,
      hasTagAdapter: !!this.tagAdapter,
      hasArticlesAdapter: !!this.articlesAdapter
    };
    
    if (this.tagAdapter) {
      stats.tagStats = this.tagAdapter.getStats();
    }
    
    return stats;
  }
}

/**
 * Create a TagRecommender with adapters from database handle
 * 
 * @param {Object} db - better-sqlite3 database instance
 * @param {Object} [options] - Additional options
 * @returns {TagRecommender} Configured recommender
 */
function createTagRecommender(db, options = {}) {
  const { createTagAdapter } = require('../../../data/db/sqlite/v1/queries/tagAdapter');
  const { createArticlesAdapter } = require('../../../data/db/sqlite/v1/queries/articlesAdapter');
  
  const tagAdapter = createTagAdapter(db);
  const articlesAdapter = createArticlesAdapter(db);
  
  return new TagRecommender({
    tagAdapter,
    articlesAdapter,
    ...options
  });
}

module.exports = {
  TagRecommender,
  createTagRecommender,
  CATEGORY_BOOST,
  MIN_KEYWORD_OVERLAP
};
