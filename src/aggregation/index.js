'use strict';

/**
 * Multi-Source Aggregation Module
 * 
 * Aggregates coverage of the same story from multiple sources,
 * showing different perspectives and fact variations.
 * 
 * Components:
 * - StoryMatcher: Cross-source story matching using SimHash + entities
 * - PerspectiveAnalyzer: Analyze tone/focus/entity differences
 * - FactExtractor: Extract quotes/stats/dates/claims
 * - CoverageMap: Generate coverage visualization data
 * 
 * @module aggregation
 */

const { StoryMatcher, MAX_HAMMING_DISTANCE, MIN_SHARED_ENTITIES, MAX_TIME_DIFF_HOURS } = require('./StoryMatcher');
const { PerspectiveAnalyzer, TONE_THRESHOLDS } = require('./PerspectiveAnalyzer');
const { FactExtractor, PATTERNS } = require('./FactExtractor');
const { CoverageMap } = require('./CoverageMap');

/**
 * Create a fully configured aggregation service
 * 
 * @param {Object} options - Configuration
 * @param {Object} options.topicAdapter - Topic database adapter
 * @param {Object} options.similarityAdapter - Similarity adapter
 * @param {Object} options.tagAdapter - Tag adapter
 * @param {Object} options.articlesAdapter - Articles adapter
 * @param {Object} [options.sentimentAdapter] - Sentiment adapter
 * @param {Object} [options.logger] - Logger instance
 * @returns {Object} Aggregation service with all components
 */
function createAggregationService(options = {}) {
  const {
    topicAdapter,
    similarityAdapter,
    tagAdapter,
    articlesAdapter,
    sentimentAdapter,
    logger = console
  } = options;
  
  // Create component instances
  const storyMatcher = new StoryMatcher({
    topicAdapter,
    similarityAdapter,
    tagAdapter,
    articlesAdapter,
    logger
  });
  
  const perspectiveAnalyzer = new PerspectiveAnalyzer({
    tagAdapter,
    articlesAdapter,
    logger
  });
  
  const factExtractor = new FactExtractor({ logger });
  
  const coverageMap = new CoverageMap({
    topicAdapter,
    articlesAdapter,
    perspectiveAnalyzer,
    factExtractor,
    logger
  });
  
  return {
    storyMatcher,
    perspectiveAnalyzer,
    factExtractor,
    coverageMap,
    
    /**
     * Match an article to stories and get coverage if matched
     * 
     * @param {Object} article - Article to process
     * @returns {Object} Match result with optional coverage
     */
    async processArticle(article) {
      const matchResult = await storyMatcher.matchArticle(article);
      
      if (matchResult.matched) {
        // Add to cluster
        storyMatcher.addToCluster(matchResult.clusterId, article.id);
        
        // Optionally get updated coverage
        const coverage = await coverageMap.generateCoverageMap(matchResult.clusterId);
        
        return {
          ...matchResult,
          coverage
        };
      }
      
      return matchResult;
    },
    
    /**
     * Get full story coverage analysis
     * 
     * @param {number} storyId - Story cluster ID
     * @returns {Object} Full coverage analysis
     */
    async getStoryCoverage(storyId) {
      return coverageMap.getFullCoverageAnalysis(storyId);
    },
    
    /**
     * Find which story an article belongs to
     * 
     * @param {number} contentId - Article content ID
     * @returns {Object|null} Story info
     */
    getArticleStory(contentId) {
      return coverageMap.getArticleStory(contentId);
    },
    
    /**
     * Get aggregation statistics
     * @returns {Object}
     */
    getStats() {
      return {
        storyMatcher: storyMatcher.getStats(),
        perspectiveAnalyzer: perspectiveAnalyzer.getStats(),
        factExtractor: factExtractor.getStats(),
        coverageMap: coverageMap.getStats()
      };
    }
  };
}

module.exports = {
  // Classes
  StoryMatcher,
  PerspectiveAnalyzer,
  FactExtractor,
  CoverageMap,
  
  // Factory
  createAggregationService,
  
  // Constants
  MAX_HAMMING_DISTANCE,
  MIN_SHARED_ENTITIES,
  MAX_TIME_DIFF_HOURS,
  TONE_THRESHOLDS,
  PATTERNS
};
