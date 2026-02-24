'use strict';

/**
 * SentimentAnalyzer - Article Sentiment Analysis
 * 
 * Thin adapter over news-db-pure-analysis/sentiment for core analysis.
 * Preserves class-based API with DB adapters, caching, and entity sentiment.
 * 
 * Core sentiment analysis (negation, intensifiers, but-clauses, breakdown)
 * is delegated to pure functions. Orchestration (DB lookup, caching, entity
 * sentiment) remains local.
 * 
 * @module SentimentAnalyzer
 */

const { analyzeSentiment } = require('news-db-pure-analysis');
const { EntitySentiment } = require('./EntitySentiment');

// Default configuration
const DEFAULT_CONFIG = {
  negationWindow: 3,
  intensifierWindow: 2,
  negationMultiplier: -0.8,
  butClauseWeightBefore: 0.4,
  butClauseWeightAfter: 0.6,
  minSentimentWords: 3,
  lowCoverageConfidencePenalty: 0.5
};

/**
 * SentimentAnalyzer class for article-level sentiment analysis
 */
class SentimentAnalyzer {
  /**
   * @param {Object} [options] - Configuration options
   * @param {Object} [options.sentimentAdapter] - Database adapter for caching
   * @param {Object} [options.articlesAdapter] - Articles adapter for content
   * @param {Object} [options.tagAdapter] - Tag adapter for entity lookup
   * @param {Object} [options.logger] - Logger instance
   * @param {Object} [options.config] - Configuration overrides
   */
  constructor(options = {}) {
    this.sentimentAdapter = options.sentimentAdapter || null;
    this.articlesAdapter = options.articlesAdapter || null;
    this.tagAdapter = options.tagAdapter || null;
    this.logger = options.logger || console;
    this.config = { ...DEFAULT_CONFIG, ...options.config };

    // Initialize entity sentiment analyzer (stays local — uses DB lookups)
    this.entitySentiment = new EntitySentiment({
      config: this.config
    });
  }

  /**
   * Analyze sentiment of text.
   * Delegates core analysis to news-db-pure-analysis/sentiment.
   * 
   * @param {string} text - Text to analyze
   * @param {Object} [options] - Options
   * @param {boolean} [options.includeDetails=false] - Include word-level details
   * @returns {Object} Sentiment analysis result
   */
  analyze(text, options = {}) {
    const { includeDetails = false } = options;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return this._emptyResult();
    }

    // Delegate to pure function
    // Signature: analyzeSentiment(text, lexicon?, config?)
    // Pass undefined for lexicon to use the default AFINN lexicon
    const pure = analyzeSentiment(text, undefined, {
      negationWindow: this.config.negationWindow,
      butWeight: this.config.butClauseWeightAfter
    });

    // Map pure result to local API contract
    const result = {
      overallScore: Math.round(pure.normalizedScore * 1000) / 1000,
      confidence: Math.round(pure.confidence * 1000) / 1000,
      breakdown: pure.breakdown,
      sentenceCount: pure.sentenceCount,
      sentimentWordCount: pure.sentimentWords,
      method: 'lexicon'
    };

    return result;
  }

  /**
   * Analyze sentiment for an article object directly (without DB lookup)
   * 
   * @param {Object} article - Article object with title and content
   * @param {Object} [options] - Options
   * @param {boolean} [options.includeEntities=false] - Include entity sentiment
   * @returns {Object} Sentiment analysis with title, body, and combined scores
   */
  analyzeArticleObject(article, options = {}) {
    const { includeEntities = false } = options;

    const title = article.title || '';
    const content = article.content || article.bodyText || article.body_text || '';

    // Analyze title and body separately
    const titleResult = this.analyze(title);
    const bodyResult = this.analyze(content);

    // Combine with title weight (titles more important - 0.3 weight)
    const titleWeight = 0.3;
    const bodyWeight = 0.7;

    let combinedScore = 0;
    let combinedConfidence = 0;

    if (title && content) {
      combinedScore = (titleResult.overallScore * titleWeight) + (bodyResult.overallScore * bodyWeight);
      combinedConfidence = (titleResult.confidence * titleWeight) + (bodyResult.confidence * bodyWeight);
    } else if (title) {
      combinedScore = titleResult.overallScore;
      combinedConfidence = titleResult.confidence;
    } else {
      combinedScore = bodyResult.overallScore;
      combinedConfidence = bodyResult.confidence;
    }

    const combinedBreakdown = {
      positive: (titleResult.breakdown.positive * titleWeight) + (bodyResult.breakdown.positive * bodyWeight),
      negative: (titleResult.breakdown.negative * titleWeight) + (bodyResult.breakdown.negative * bodyWeight),
      neutral: (titleResult.breakdown.neutral * titleWeight) + (bodyResult.breakdown.neutral * bodyWeight)
    };

    const result = {
      title: titleResult,
      body: bodyResult,
      combined: {
        overallScore: combinedScore,
        confidence: combinedConfidence,
        breakdown: combinedBreakdown
      }
    };

    if (includeEntities) {
      const entityResults = this.entitySentiment.analyzeTextForEntities
        ? this.entitySentiment.analyzeTextForEntities(content)
        : [];
      result.entities = entityResults;
    }

    return result;
  }

  /**
   * Analyze sentiment for an article by ID (with caching)
   * 
   * @param {number} contentId - Article content ID
   * @param {Object} [options] - Options
   * @returns {Promise<Object>} Sentiment analysis result
   */
  async analyzeArticle(contentId, options = {}) {
    const { includeEntities = false, regenerate = false } = options;

    // Check cache first
    if (this.sentimentAdapter && !regenerate) {
      const cached = this.sentimentAdapter.getSentiment(contentId);
      if (cached) {
        return {
          ...cached,
          cached: true,
          articleId: contentId
        };
      }
    }

    // Get article text
    if (!this.articlesAdapter) {
      throw new Error('Articles adapter required for analyzeArticle()');
    }

    const article = this.articlesAdapter.getArticleById
      ? this.articlesAdapter.getArticleById(contentId)
      : this.articlesAdapter.getArticle(contentId);

    if (!article) {
      throw new Error(`Article not found: ${contentId}`);
    }

    const text = article.bodyText || article.body_text || article.content || '';

    // Generate sentiment analysis
    const sentiment = this.analyze(text);

    // Optionally analyze entity sentiment
    let entitySentiments = [];
    if (includeEntities && this.tagAdapter) {
      entitySentiments = await this._analyzeEntitySentiment(contentId, text);
    }

    // Save to cache
    if (this.sentimentAdapter) {
      this.sentimentAdapter.saveSentiment({
        contentId,
        overallScore: sentiment.overallScore,
        confidence: sentiment.confidence,
        positivePct: sentiment.breakdown.positive,
        negativePct: sentiment.breakdown.negative,
        entitySentiments: entitySentiments.length > 0 ? entitySentiments : null
      });
    }

    return {
      ...sentiment,
      entitySentiments: includeEntities ? entitySentiments : undefined,
      cached: false,
      articleId: contentId,
      analyzedAt: new Date().toISOString()
    };
  }

  /**
   * Batch analyze multiple articles
   * 
   * @param {number[]} contentIds - Array of content IDs
   * @param {Object} [options] - Options
   * @returns {Promise<Object[]>} Array of sentiment results
   */
  async batchAnalyze(contentIds, options = {}) {
    const results = [];

    for (const contentId of contentIds) {
      try {
        const sentiment = await this.analyzeArticle(contentId, options);
        results.push(sentiment);
      } catch (err) {
        this.logger.error(`[SentimentAnalyzer] Failed to analyze ${contentId}:`, err.message);
        results.push({
          articleId: contentId,
          error: err.message,
          overallScore: 0,
          confidence: 0,
          breakdown: { positive: 0, negative: 0, neutral: 1 }
        });
      }
    }

    return results;
  }

  /**
   * Empty result for missing/empty text
   * @private
   */
  _emptyResult() {
    return {
      overallScore: 0,
      confidence: 0,
      breakdown: { positive: 0, negative: 0, neutral: 1 },
      sentenceCount: 0,
      sentimentWordCount: 0,
      method: 'none',
      error: 'No text to analyze'
    };
  }

  /**
   * Analyze entity-level sentiment (stays local — needs DB adapters)
   * @private
   */
  async _analyzeEntitySentiment(contentId, text) {
    if (!this.tagAdapter) return [];

    try {
      const entities = this.tagAdapter.getEntities(contentId);

      if (!entities || entities.length === 0) {
        return [];
      }

      return this.entitySentiment.analyzeEntities(text, entities);
    } catch (err) {
      this.logger.error(`[SentimentAnalyzer] Entity sentiment failed for ${contentId}:`, err.message);
      return [];
    }
  }

  /**
   * Invalidate cached sentiment
   */
  invalidateCache(contentId) {
    if (!this.sentimentAdapter) {
      return { deleted: 0 };
    }
    return this.sentimentAdapter.deleteSentiment(contentId);
  }

  /**
   * Get analyzer statistics
   */
  getStats() {
    const stats = {
      config: this.config,
      hasAdapter: !!this.sentimentAdapter,
      hasArticlesAdapter: !!this.articlesAdapter,
      hasTagAdapter: !!this.tagAdapter
    };

    if (this.sentimentAdapter) {
      stats.cacheStats = this.sentimentAdapter.getStats();
    }

    return stats;
  }
}

module.exports = {
  SentimentAnalyzer,
  DEFAULT_CONFIG
};
