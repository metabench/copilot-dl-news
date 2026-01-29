'use strict';

/**
 * DuplicateDetector - Main service for content similarity and duplicate detection
 * 
 * Orchestrates SimHash and MinHash computations, maintains LSH index,
 * and provides API for finding similar articles.
 * 
 * Features:
 * - Compute fingerprints for new articles
 * - Fast similarity search using LSH
 * - Duplicate detection using SimHash
 * - Batch processing for initial indexing
 * - Database persistence via similarityAdapter
 * 
 * @module DuplicateDetector
 */

const SimHasher = require('./SimHasher');
const MinHasher = require('./MinHasher');
const { SimilarityIndex } = require('./SimilarityIndex');

// Minimum word count to compute fingerprints (short text produces noise)
const MIN_WORD_COUNT = 50;

/**
 * DuplicateDetector service
 */
class DuplicateDetector {
  /**
   * Create a DuplicateDetector
   * 
   * @param {Object} options - Configuration
   * @param {Object} options.similarityAdapter - Database adapter for fingerprints
   * @param {Object} [options.articlesAdapter] - Adapter for fetching article content
   * @param {Object} [options.logger] - Logger instance
   * @param {number} [options.minWordCount=50] - Minimum words for fingerprinting
   * @param {number} [options.simhashThreshold=3] - Max Hamming distance for near-duplicate
   * @param {number} [options.minSimilarity=0.5] - Min Jaccard for similar articles
   */
  constructor(options = {}) {
    this.similarityAdapter = options.similarityAdapter;
    this.articlesAdapter = options.articlesAdapter || null;
    this.logger = options.logger || console;
    
    this.minWordCount = options.minWordCount || MIN_WORD_COUNT;
    this.simhashThreshold = options.simhashThreshold || 3;
    this.minSimilarity = options.minSimilarity || 0.5;
    
    // In-memory LSH index (can be lazy-loaded from DB)
    this.index = new SimilarityIndex({
      simhashThreshold: this.simhashThreshold
    });
    
    this._initialized = false;
  }
  
  /**
   * Initialize the index from database
   * Loads existing fingerprints into memory for fast querying
   * 
   * @param {Object} [options] - Options
   * @param {number} [options.limit] - Max fingerprints to load
   * @returns {Promise<number>} Number of fingerprints loaded
   */
  async initialize(options = {}) {
    if (this._initialized) {
      return this.index.size;
    }
    
    if (!this.similarityAdapter) {
      this._initialized = true;
      return 0;
    }
    
    const limit = options.limit || 100000;
    const startTime = Date.now();
    
    try {
      const fingerprints = this.similarityAdapter.getAllFingerprints({ limit });
      
      for (const fp of fingerprints) {
        this.index.add(fp.contentId, fp.simhash, fp.minhash);
      }
      
      this._initialized = true;
      const duration = Date.now() - startTime;
      
      this.logger.log(`[DuplicateDetector] Loaded ${fingerprints.length} fingerprints in ${duration}ms`);
      
      return fingerprints.length;
    } catch (err) {
      this.logger.error('[DuplicateDetector] Error initializing:', err);
      throw err;
    }
  }
  
  /**
   * Compute fingerprints for text content
   * 
   * @param {string} text - Article body text
   * @returns {{simhash: Buffer, minhash: Buffer, wordCount: number, isShort: boolean}}
   */
  computeFingerprints(text) {
    const tokens = SimHasher.tokenize(text);
    const wordCount = tokens.length;
    const isShort = wordCount < this.minWordCount;
    
    // Always compute SimHash (even for short text)
    const simhash = SimHasher.compute(text);
    
    // Only compute MinHash for longer text (shingles need context)
    const minhash = isShort ? null : MinHasher.compute(text);
    
    return {
      simhash,
      minhash,
      wordCount,
      isShort
    };
  }
  
  /**
   * Process a new article - compute fingerprints and add to index
   * 
   * @param {number} contentId - Content storage ID
   * @param {string} bodyText - Article body text
   * @param {Object} [options] - Options
   * @param {boolean} [options.persist=true] - Save to database
   * @returns {{contentId: number, fingerprints: Object, duplicates: Array}}
   */
  async processArticle(contentId, bodyText, options = {}) {
    const { persist = true } = options;
    
    // Compute fingerprints
    const fingerprints = this.computeFingerprints(bodyText);
    
    // Check for duplicates before adding
    const duplicates = this.index.findDuplicates(fingerprints.simhash, {
      threshold: this.simhashThreshold
    });
    
    // Add to index
    this.index.add(contentId, fingerprints.simhash, fingerprints.minhash);
    
    // Persist to database
    if (persist && this.similarityAdapter) {
      this.similarityAdapter.saveFingerprint({
        contentId,
        simhash: fingerprints.simhash,
        minhash: fingerprints.minhash,
        wordCount: fingerprints.wordCount
      });
    }
    
    return {
      contentId,
      fingerprints: {
        wordCount: fingerprints.wordCount,
        isShort: fingerprints.isShort,
        simhash: SimHasher.toHexString(fingerprints.simhash)
      },
      duplicates
    };
  }
  
  /**
   * Find similar articles for a given article
   * 
   * @param {number} contentId - Content ID to find similar articles for
   * @param {Object} [options] - Options
   * @param {number} [options.limit=10] - Maximum results
   * @param {number} [options.minSimilarity] - Minimum similarity threshold
   * @returns {Array<{id: number, similarity: number, matchType: string}>}
   */
  async findSimilar(contentId, options = {}) {
    const limit = options.limit || 10;
    const minSimilarity = options.minSimilarity || this.minSimilarity;
    
    // Get fingerprint from index or database
    let fp = this.index.get(contentId);
    
    if (!fp && this.similarityAdapter) {
      const dbFp = this.similarityAdapter.getFingerprint(contentId);
      if (dbFp) {
        fp = { simhash: dbFp.simhash, minhash: dbFp.minhash };
        // Add to index for future queries
        this.index.add(contentId, fp.simhash, fp.minhash);
      }
    }
    
    if (!fp) {
      // No fingerprint exists - try to compute from article
      if (this.articlesAdapter) {
        const article = this.articlesAdapter.getArticleById(contentId);
        if (article && article.bodyText) {
          const result = await this.processArticle(contentId, article.bodyText);
          fp = this.index.get(contentId);
        }
      }
      
      if (!fp) {
        return [];
      }
    }
    
    // Query the index
    const results = this.index.query(fp.simhash, fp.minhash, {
      limit,
      minSimilarity,
      excludeId: contentId
    });
    
    return results.map(r => ({
      id: r.contentId,
      similarity: r.similarity,
      simhashDistance: r.simhashDistance,
      matchType: r.matchType
    }));
  }
  
  /**
   * Find similar articles with enriched metadata (for API responses)
   * 
   * @param {number} contentId - Content ID
   * @param {Object} [options] - Options
   * @returns {Promise<Array<{id, title, host, similarity, matchType}>>}
   */
  async findSimilarWithMetadata(contentId, options = {}) {
    const similar = await this.findSimilar(contentId, options);
    
    if (similar.length === 0 || !this.articlesAdapter) {
      return similar;
    }
    
    // Enrich with article metadata
    const enriched = [];
    for (const item of similar) {
      const article = this.articlesAdapter.getArticleById(item.id);
      if (article) {
        enriched.push({
          id: item.id,
          title: article.title,
          host: article.host,
          url: article.url,
          similarity: Math.round(item.similarity * 100) / 100,
          simhashDistance: item.simhashDistance,
          matchType: item.matchType
        });
      } else {
        enriched.push(item);
      }
    }
    
    return enriched;
  }
  
  /**
   * Batch process articles for initial fingerprinting
   * 
   * @param {Object} [options] - Options
   * @param {number} [options.batchSize=1000] - Articles per batch
   * @param {number} [options.limit] - Maximum articles to process
   * @param {Function} [options.onProgress] - Progress callback
   * @returns {Promise<{processed: number, skipped: number, duplicates: number}>}
   */
  async batchProcess(options = {}) {
    const {
      batchSize = 1000,
      limit = null,
      onProgress = null
    } = options;
    
    if (!this.similarityAdapter) {
      throw new Error('similarityAdapter required for batch processing');
    }
    
    let processed = 0;
    let skipped = 0;
    let duplicatesFound = 0;
    let offset = 0;
    
    const startTime = Date.now();
    
    while (true) {
      // Get articles without fingerprints
      const articles = this.similarityAdapter.getArticlesWithoutFingerprints({
        limit: batchSize,
        offset
      });
      
      if (articles.length === 0) break;
      
      for (const article of articles) {
        if (limit && processed >= limit) break;
        
        if (!article.bodyText || article.bodyText.length < 100) {
          skipped++;
          continue;
        }
        
        try {
          const result = await this.processArticle(article.contentId, article.bodyText);
          processed++;
          
          if (result.duplicates.length > 0) {
            duplicatesFound++;
          }
          
          if (onProgress && processed % 100 === 0) {
            onProgress({
              processed,
              skipped,
              duplicatesFound,
              elapsed: Date.now() - startTime
            });
          }
        } catch (err) {
          this.logger.error(`[DuplicateDetector] Error processing ${article.contentId}:`, err);
          skipped++;
        }
      }
      
      if (limit && processed >= limit) break;
      offset += batchSize;
    }
    
    return {
      processed,
      skipped,
      duplicatesFound,
      durationMs: Date.now() - startTime
    };
  }
  
  /**
   * Get statistics about the detector
   * 
   * @returns {Object} Statistics
   */
  getStats() {
    const indexStats = this.index.getStats();
    
    return {
      initialized: this._initialized,
      minWordCount: this.minWordCount,
      simhashThreshold: this.simhashThreshold,
      minSimilarity: this.minSimilarity,
      ...indexStats
    };
  }
}

/**
 * Create a DuplicateDetector with adapters from database handle
 * 
 * @param {Object} db - better-sqlite3 database instance
 * @param {Object} [options] - Additional options
 * @returns {DuplicateDetector} Configured detector
 */
function createDuplicateDetector(db, options = {}) {
  // Import adapters dynamically to avoid circular deps
  const { createSimilarityAdapter } = require('../../../data/db/sqlite/v1/queries/similarityAdapter');
  const { createArticlesAdapter } = require('../../../data/db/sqlite/v1/queries/articlesAdapter');
  
  const similarityAdapter = createSimilarityAdapter(db);
  const articlesAdapter = createArticlesAdapter(db);
  
  return new DuplicateDetector({
    similarityAdapter,
    articlesAdapter,
    ...options
  });
}

module.exports = {
  DuplicateDetector,
  createDuplicateDetector,
  MIN_WORD_COUNT
};
