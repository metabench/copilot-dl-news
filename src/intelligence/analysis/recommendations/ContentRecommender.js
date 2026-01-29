'use strict';

/**
 * ContentRecommender - Content-based article recommendations
 * 
 * Uses SimHash similarity from the Content Similarity Engine (Item 3)
 * to find articles with similar content.
 * 
 * Threshold: Hamming distance ≤5 is considered similar.
 * 
 * @module ContentRecommender
 */

/**
 * Default SimHash threshold (max Hamming distance for "similar")
 */
const DEFAULT_SIMHASH_THRESHOLD = 5;

/**
 * ContentRecommender class
 */
class ContentRecommender {
  /**
   * Create a ContentRecommender
   * 
   * @param {Object} [options] - Configuration
   * @param {Object} [options.duplicateDetector] - DuplicateDetector from similarity engine
   * @param {Object} [options.logger] - Logger instance
   * @param {number} [options.simhashThreshold=5] - Max Hamming distance for similarity
   * @param {number} [options.minSimilarity=0.3] - Minimum Jaccard similarity
   */
  constructor(options = {}) {
    this.duplicateDetector = options.duplicateDetector || null;
    this.logger = options.logger || console;
    this.simhashThreshold = options.simhashThreshold || DEFAULT_SIMHASH_THRESHOLD;
    this.minSimilarity = options.minSimilarity || 0.3;
  }
  
  /**
   * Convert Hamming distance to similarity score (0-1)
   * 
   * For 64-bit SimHash:
   * - Distance 0 = identical = 1.0
   * - Distance 3 = very similar = 0.95
   * - Distance 5 = similar = 0.92
   * - Distance 10 = somewhat similar = 0.84
   * - Distance 32 = unrelated = 0.5
   * 
   * @param {number} distance - Hamming distance (0-64)
   * @returns {number} Similarity score (0-1)
   */
  hammingToSimilarity(distance) {
    // Linear mapping: 0 distance = 1.0, 64 distance = 0
    return Math.max(0, 1 - (distance / 64));
  }
  
  /**
   * Get content-based recommendations for an article
   * 
   * @param {number} contentId - Content ID to find recommendations for
   * @param {Object} [options] - Options
   * @param {number} [options.limit=20] - Maximum recommendations
   * @param {boolean} [options.includeMetadata=true] - Include title/host
   * @returns {Promise<Array<{contentId: number, score: number, distance: number, matchType: string}>>}
   */
  async getRecommendations(contentId, options = {}) {
    const { limit = 20, includeMetadata = true } = options;
    
    if (!this.duplicateDetector) {
      this.logger.warn('[ContentRecommender] No duplicateDetector configured');
      return [];
    }
    
    try {
      // Use the DuplicateDetector's findSimilar method
      const similar = includeMetadata
        ? await this.duplicateDetector.findSimilarWithMetadata(contentId, {
            limit,
            minSimilarity: this.minSimilarity
          })
        : await this.duplicateDetector.findSimilar(contentId, {
            limit,
            minSimilarity: this.minSimilarity
          });
      
      // Transform results to recommendation format
      return similar.map(item => ({
        contentId: item.id,
        score: this.normalizeScore(item.similarity, item.simhashDistance),
        similarity: item.similarity,
        distance: item.simhashDistance,
        matchType: item.matchType,
        title: item.title,
        host: item.host,
        url: item.url
      }));
    } catch (err) {
      this.logger.error('[ContentRecommender] Error getting recommendations:', err);
      return [];
    }
  }
  
  /**
   * Normalize similarity score
   * 
   * Combines Jaccard similarity with Hamming distance bonus
   * 
   * @param {number} jaccardSim - Jaccard similarity from MinHash (0-1)
   * @param {number} hammingDistance - SimHash Hamming distance (0-64)
   * @returns {number} Normalized score (0-1)
   */
  normalizeScore(jaccardSim, hammingDistance) {
    // Use Jaccard similarity as base (already 0-1)
    let score = jaccardSim;
    
    // Boost for very close SimHash matches
    if (hammingDistance !== undefined && hammingDistance <= this.simhashThreshold) {
      const simhashBonus = this.hammingToSimilarity(hammingDistance);
      // Weight: 70% Jaccard, 30% SimHash closeness
      score = (jaccardSim * 0.7) + (simhashBonus * 0.3);
    }
    
    return Math.min(1, Math.max(0, score));
  }
  
  /**
   * Check if a similarity score qualifies as "similar content"
   * 
   * @param {number} score - Normalized similarity score
   * @returns {boolean}
   */
  isSimilar(score) {
    return score >= this.minSimilarity;
  }
  
  /**
   * Get statistics
   * 
   * @returns {Object}
   */
  getStats() {
    const stats = {
      simhashThreshold: this.simhashThreshold,
      minSimilarity: this.minSimilarity,
      hasDetector: !!this.duplicateDetector
    };
    
    if (this.duplicateDetector) {
      stats.detector = this.duplicateDetector.getStats();
    }
    
    return stats;
  }
}

/**
 * Create a ContentRecommender with DuplicateDetector from database handle
 * 
 * @param {Object} db - better-sqlite3 database instance
 * @param {Object} [options] - Additional options
 * @returns {ContentRecommender} Configured recommender
 */
function createContentRecommender(db, options = {}) {
  const { createDuplicateDetector } = require('../similarity/DuplicateDetector');
  
  const duplicateDetector = createDuplicateDetector(db, options);
  
  return new ContentRecommender({
    duplicateDetector,
    ...options
  });
}

module.exports = {
  ContentRecommender,
  createContentRecommender,
  DEFAULT_SIMHASH_THRESHOLD
};
