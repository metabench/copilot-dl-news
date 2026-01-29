'use strict';

/**
 * TaggingService - Content Tagging Orchestration
 * 
 * Orchestrates the full tagging pipeline:
 * 1. Keyword extraction (TF-IDF)
 * 2. Category classification (rule-based)
 * 3. Entity recognition (PERSON, ORG, GPE)
 * 
 * Supports both single-article processing and batch operations.
 * 
 * @module TaggingService
 */

const { KeywordExtractor } = require('./KeywordExtractor');
const { CategoryClassifier } = require('./CategoryClassifier');
const { EntityRecognizer } = require('./EntityRecognizer');

/**
 * TaggingService class for content tagging orchestration
 */
class TaggingService {
  /**
   * Create a TaggingService
   * 
   * @param {Object} [options] - Configuration
   * @param {Object} [options.tagAdapter] - Database adapter for persistence
   * @param {Object} [options.keywordExtractor] - Custom keyword extractor
   * @param {Object} [options.categoryClassifier] - Custom category classifier
   * @param {Object} [options.entityRecognizer] - Custom entity recognizer
   * @param {Object} [options.logger] - Logger instance
   * @param {number} [options.topKeywords=10] - Number of keywords to extract
   */
  constructor(options = {}) {
    this.tagAdapter = options.tagAdapter || null;
    this.logger = options.logger || console;
    this.topKeywords = options.topKeywords || 10;
    
    // Initialize extractors
    this.keywordExtractor = options.keywordExtractor || new KeywordExtractor({
      topN: this.topKeywords,
      tagAdapter: this.tagAdapter
    });
    
    this.categoryClassifier = options.categoryClassifier || new CategoryClassifier();
    
    this.entityRecognizer = options.entityRecognizer || new EntityRecognizer();
    
    this._initialized = false;
  }
  
  /**
   * Initialize the service (load corpus statistics)
   * 
   * @returns {Promise<{termsLoaded: number}>}
   */
  async initialize() {
    if (this._initialized) {
      return { termsLoaded: this.keywordExtractor.documentFrequencies.size };
    }
    
    let termsLoaded = 0;
    
    // Load document frequencies from database
    if (this.tagAdapter) {
      try {
        termsLoaded = await this.keywordExtractor.loadFromDatabase();
        this.logger.log(`[TaggingService] Loaded ${termsLoaded} terms from database`);
      } catch (err) {
        this.logger.warn('[TaggingService] Could not load document frequencies:', err.message);
      }
    }
    
    this._initialized = true;
    return { termsLoaded };
  }
  
  /**
   * Tag a single article
   * 
   * @param {Object} article - Article data
   * @param {number} article.contentId - Content ID
   * @param {string} article.bodyText - Article body text
   * @param {string} [article.title] - Article title
   * @param {Object} [options] - Options
   * @param {boolean} [options.persist=true] - Save to database
   * @param {boolean} [options.includeOffsets=false] - Include entity offsets
   * @returns {Promise<{contentId: number, keywords: Array, category: Object, entities: Array}>}
   */
  async tagArticle(article, options = {}) {
    const { persist = true, includeOffsets = false } = options;
    const { contentId, bodyText, title = '' } = article;
    
    if (!bodyText || bodyText.length < 50) {
      return {
        contentId,
        keywords: [],
        category: { category: 'Uncategorized', confidence: 0 },
        entities: [],
        skipped: true,
        reason: 'Text too short'
      };
    }
    
    // 1. Extract keywords
    const keywords = this.keywordExtractor.extract(bodyText, { topN: this.topKeywords });
    
    // 2. Classify category
    const categoryResult = this.categoryClassifier.classify(bodyText, { title });
    
    // 3. Recognize entities
    const entities = this.entityRecognizer.recognize(bodyText, { includeOffsets });
    
    // 4. Persist to database if requested
    if (persist && this.tagAdapter) {
      this.tagAdapter.saveKeywords(contentId, keywords);
      this.tagAdapter.saveCategory({
        contentId,
        category: categoryResult.category,
        confidence: categoryResult.confidence,
        secondaryCategory: categoryResult.secondaryCategory,
        secondaryConfidence: categoryResult.secondaryConfidence
      });
      this.tagAdapter.saveEntities(contentId, entities);
      
      // Update document frequencies with unique terms from this article
      const uniqueTerms = new Set(keywords.map(k => k.keyword));
      if (uniqueTerms.size > 0) {
        this.tagAdapter.incrementDocumentFrequencies([...uniqueTerms]);
      }
    }
    
    return {
      contentId,
      keywords,
      category: {
        category: categoryResult.category,
        confidence: categoryResult.confidence,
        secondaryCategory: categoryResult.secondaryCategory,
        secondaryConfidence: categoryResult.secondaryConfidence
      },
      entities: entities.map(e => ({
        text: e.text,
        type: e.type,
        confidence: e.confidence,
        ...(includeOffsets && e.start !== undefined && { start: e.start, end: e.end })
      }))
    };
  }
  
  /**
   * Batch process articles for tagging
   * 
   * @param {Object} [options] - Options
   * @param {number} [options.batchSize=100] - Articles per batch
   * @param {number} [options.limit] - Maximum articles to process
   * @param {Function} [options.onProgress] - Progress callback
   * @returns {Promise<{processed: number, skipped: number, categories: Object}>}
   */
  async batchProcess(options = {}) {
    const {
      batchSize = 100,
      limit = null,
      onProgress = null
    } = options;
    
    if (!this.tagAdapter) {
      throw new Error('tagAdapter required for batch processing');
    }
    
    // Ensure initialized
    await this.initialize();
    
    let processed = 0;
    let skipped = 0;
    const categoryDistribution = {};
    let offset = 0;
    
    const startTime = Date.now();
    
    while (true) {
      // Get articles without tags
      const articles = this.tagAdapter.getArticlesWithoutTags({
        limit: batchSize,
        offset: 0 // Always start from 0 since we're removing tagged articles
      });
      
      if (articles.length === 0) break;
      
      for (const article of articles) {
        if (limit && processed >= limit) break;
        
        try {
          const result = await this.tagArticle({
            contentId: article.contentId,
            bodyText: article.bodyText,
            title: article.title
          });
          
          if (result.skipped) {
            skipped++;
          } else {
            processed++;
            
            // Track category distribution
            const cat = result.category.category;
            categoryDistribution[cat] = (categoryDistribution[cat] || 0) + 1;
          }
          
          if (onProgress && (processed + skipped) % 50 === 0) {
            onProgress({
              processed,
              skipped,
              elapsed: Date.now() - startTime,
              categoryDistribution
            });
          }
        } catch (err) {
          this.logger.error(`[TaggingService] Error tagging ${article.contentId}:`, err);
          skipped++;
        }
      }
      
      if (limit && processed >= limit) break;
      offset += batchSize;
    }
    
    // Save updated document frequencies
    if (this.tagAdapter) {
      await this.keywordExtractor.saveToDatabase();
    }
    
    return {
      processed,
      skipped,
      categoryDistribution,
      durationMs: Date.now() - startTime
    };
  }
  
  /**
   * Get tags for an article (from database)
   * 
   * @param {number} contentId - Content ID
   * @returns {Object|null}
   */
  getArticleTags(contentId) {
    if (!this.tagAdapter) {
      return null;
    }
    
    return this.tagAdapter.getArticleTags(contentId);
  }
  
  /**
   * Re-tag an article (updates existing tags)
   * 
   * @param {Object} article - Article data
   * @returns {Promise<Object>}
   */
  async retagArticle(article) {
    // Delete existing tags first
    if (this.tagAdapter) {
      this.tagAdapter.deleteAllTags(article.contentId);
    }
    
    // Re-tag
    return this.tagArticle(article, { persist: true });
  }
  
  /**
   * Add known locations to entity recognizer
   * 
   * @param {string[]} locations - Location names
   */
  addKnownLocations(locations) {
    this.entityRecognizer.addKnownLocations(locations);
  }
  
  /**
   * Add known organizations to entity recognizer
   * 
   * @param {string[]} orgs - Organization names
   */
  addKnownOrganizations(orgs) {
    this.entityRecognizer.addKnownOrganizations(orgs);
  }
  
  /**
   * Get service statistics
   * 
   * @returns {Object}
   */
  getStats() {
    const stats = {
      initialized: this._initialized,
      topKeywords: this.topKeywords,
      keywordExtractor: this.keywordExtractor.getStats(),
      categoryClassifier: this.categoryClassifier.getStats(),
      entityRecognizer: this.entityRecognizer.getStats()
    };
    
    if (this.tagAdapter) {
      stats.database = this.tagAdapter.getStats();
    }
    
    return stats;
  }
}

/**
 * Create a TaggingService with adapter from database handle
 * 
 * @param {Object} db - better-sqlite3 database instance
 * @param {Object} [options] - Additional options
 * @returns {TaggingService} Configured service
 */
function createTaggingService(db, options = {}) {
  const { createTagAdapter } = require('../../../data/db/sqlite/v1/queries/tagAdapter');
  
  const tagAdapter = createTagAdapter(db);
  
  return new TaggingService({
    tagAdapter,
    ...options
  });
}

module.exports = {
  TaggingService,
  createTaggingService
};
