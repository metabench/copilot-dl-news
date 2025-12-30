'use strict';

/**
 * SentimentAnalyzer - Article Sentiment Analysis
 * 
 * Analyzes article sentiment using lexicon-based approach with:
 * - Word-level sentiment from AFINN lexicon
 * - Negation handling (not good → negative)
 * - Intensifier handling (very bad → more negative)
 * - But-clause weighting (good but bad → emphasize "bad")
 * - Sentence-level aggregation
 * - Overall article scoring with confidence
 * 
 * Output:
 * - overallScore: -1.0 to +1.0 normalized sentiment
 * - confidence: 0-1 based on sentiment word coverage
 * - breakdown: { positive: 0.3, negative: 0.1, neutral: 0.6 }
 * 
 * @module SentimentAnalyzer
 */

const { Lexicon } = require('./Lexicon');
const { EntitySentiment } = require('./EntitySentiment');

// Default configuration
const DEFAULT_CONFIG = {
  // Window size for negation/intensifier detection (words before sentiment word)
  negationWindow: 3,
  intensifierWindow: 2,
  
  // Weight multiplier when negation is detected
  negationMultiplier: -0.8,
  
  // Sentence weights for but-clauses (emphasize content after "but")
  butClauseWeightBefore: 0.4,
  butClauseWeightAfter: 0.6,
  
  // Minimum sentiment words for confidence calculation
  minSentimentWords: 3,
  
  // Confidence penalty when few sentiment words found
  lowCoverageConfidencePenalty: 0.5
};

/**
 * SentimentAnalyzer class for article-level sentiment analysis
 */
class SentimentAnalyzer {
  /**
   * Create a SentimentAnalyzer instance
   * @param {Object} [options] - Configuration options
   * @param {Object} [options.sentimentAdapter] - Database adapter for caching
   * @param {Object} [options.articlesAdapter] - Articles adapter for content
   * @param {Object} [options.tagAdapter] - Tag adapter for entity lookup
   * @param {Object} [options.lexicon] - Custom Lexicon instance
   * @param {Object} [options.logger] - Logger instance
   * @param {Object} [options.config] - Configuration overrides
   */
  constructor(options = {}) {
    this.sentimentAdapter = options.sentimentAdapter || null;
    this.articlesAdapter = options.articlesAdapter || null;
    this.tagAdapter = options.tagAdapter || null;
    this.logger = options.logger || console;
    this.config = { ...DEFAULT_CONFIG, ...options.config };
    
    // Initialize lexicon
    this.lexicon = options.lexicon || new Lexicon();
    
    // Initialize entity sentiment analyzer
    this.entitySentiment = new EntitySentiment({
      lexicon: this.lexicon,
      config: this.config
    });
  }
  
  /**
   * Analyze sentiment of text
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
    
    // Tokenize into sentences
    const sentences = this._tokenizeSentences(text);
    
    if (sentences.length === 0) {
      return this._emptyResult();
    }
    
    // Analyze each sentence
    const sentenceResults = sentences.map(sentence => this._analyzeSentence(sentence));
    
    // Aggregate sentence scores with but-clause weighting
    const aggregated = this._aggregateSentences(sentenceResults);
    
    // Calculate breakdown
    const breakdown = this._calculateBreakdown(sentenceResults);
    
    // Calculate confidence based on coverage
    const confidence = this._calculateConfidence(sentenceResults, text);
    
    // Normalize overall score to -1 to +1 range
    const overallScore = this._normalizeScore(aggregated.totalScore, aggregated.wordCount);
    
    const result = {
      overallScore: Math.round(overallScore * 1000) / 1000,
      confidence: Math.round(confidence * 1000) / 1000,
      breakdown,
      sentenceCount: sentences.length,
      sentimentWordCount: aggregated.sentimentWordCount,
      method: 'lexicon'
    };
    
    if (includeDetails) {
      result.sentenceDetails = sentenceResults.map(sr => ({
        text: sr.text.substring(0, 100) + (sr.text.length > 100 ? '...' : ''),
        score: sr.score,
        words: sr.words.map(w => ({ word: w.word, score: w.adjustedScore }))
      }));
    }
    
    return result;
  }
  
  /**
   * Analyze sentiment for an article object directly (without DB lookup)
   * 
   * @param {Object} article - Article object with title and content
   * @param {string} [article.title] - Article title
   * @param {string} [article.content] - Article body text
   * @param {Object} [options] - Options
   * @param {boolean} [options.includeEntities=false] - Include entity-level sentiment
   * @returns {Object} Sentiment analysis with title, body, and combined scores
   */
  analyzeArticleObject(article, options = {}) {
    const { includeEntities = false } = options;
    
    const title = article.title || '';
    const content = article.content || article.bodyText || article.body_text || '';
    
    // Analyze title and body separately
    const titleResult = this.analyze(title);
    const bodyResult = this.analyze(content);
    
    // Combine with title weight (titles are more important - 0.3 weight)
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
    
    // Combined breakdown (weighted average)
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
    
    // Add entity sentiment if requested
    if (includeEntities) {
      // EntitySentiment can analyze entities directly from text
      // Returns array of entity sentiments
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
   * @param {boolean} [options.includeEntities=false] - Include entity-level sentiment
   * @param {boolean} [options.regenerate=false] - Force regeneration
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
   * Tokenize text into sentences
   * @private
   */
  _tokenizeSentences(text) {
    // Simple sentence tokenization (handles common abbreviations)
    const sentences = text
      .replace(/([.!?])\s+/g, '$1|||')
      .split('|||')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    return sentences;
  }
  
  /**
   * Tokenize sentence into words
   * @private
   */
  _tokenizeWords(sentence) {
    // Split on non-word characters, keeping contractions
    return sentence
      .toLowerCase()
      .replace(/[^a-z0-9'-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 0);
  }
  
  /**
   * Analyze a single sentence
   * @private
   */
  _analyzeSentence(sentence) {
    const words = this._tokenizeWords(sentence);
    const sentimentWords = [];
    let totalScore = 0;
    let hasBut = false;
    let butIndex = -1;
    
    // First pass: find sentiment words and but-clauses
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      
      // Check for but-clause
      if (this.lexicon.isButWord(word)) {
        hasBut = true;
        butIndex = i;
        continue;
      }
      
      // Get base score
      const baseScore = this.lexicon.getScore(word);
      if (baseScore === null) continue;
      
      // Check for negation in window before this word
      let adjustedScore = baseScore;
      let negated = false;
      
      for (let j = Math.max(0, i - this.config.negationWindow); j < i; j++) {
        if (this.lexicon.isNegation(words[j])) {
          adjustedScore = baseScore * this.config.negationMultiplier;
          negated = true;
          break;
        }
      }
      
      // Check for intensifier in window before this word
      let intensified = false;
      let intensifier = 1;
      
      if (!negated) {
        for (let j = Math.max(0, i - this.config.intensifierWindow); j < i; j++) {
          const mult = this.lexicon.getIntensifier(words[j]);
          if (mult !== null) {
            intensifier = mult;
            adjustedScore = baseScore * mult;
            intensified = true;
            break;
          }
        }
      }
      
      sentimentWords.push({
        word,
        index: i,
        baseScore,
        adjustedScore,
        negated,
        intensified,
        intensifier
      });
      
      totalScore += adjustedScore;
    }
    
    // Apply but-clause weighting
    if (hasBut && sentimentWords.length > 0) {
      const beforeBut = sentimentWords.filter(w => w.index < butIndex);
      const afterBut = sentimentWords.filter(w => w.index > butIndex);
      
      const beforeScore = beforeBut.reduce((sum, w) => sum + w.adjustedScore, 0);
      const afterScore = afterBut.reduce((sum, w) => sum + w.adjustedScore, 0);
      
      totalScore = (beforeScore * this.config.butClauseWeightBefore) + 
                   (afterScore * this.config.butClauseWeightAfter);
    }
    
    return {
      text: sentence,
      words: sentimentWords,
      score: totalScore,
      wordCount: words.length,
      sentimentWordCount: sentimentWords.length,
      hasBut
    };
  }
  
  /**
   * Aggregate sentence scores
   * @private
   */
  _aggregateSentences(sentenceResults) {
    let totalScore = 0;
    let wordCount = 0;
    let sentimentWordCount = 0;
    
    for (const result of sentenceResults) {
      totalScore += result.score;
      wordCount += result.wordCount;
      sentimentWordCount += result.sentimentWordCount;
    }
    
    return { totalScore, wordCount, sentimentWordCount };
  }
  
  /**
   * Calculate positive/negative/neutral breakdown
   * @private
   */
  _calculateBreakdown(sentenceResults) {
    let positive = 0;
    let negative = 0;
    let neutral = 0;
    
    for (const result of sentenceResults) {
      for (const word of result.words) {
        if (word.adjustedScore > 0) {
          positive++;
        } else if (word.adjustedScore < 0) {
          negative++;
        } else {
          neutral++;
        }
      }
    }
    
    const total = positive + negative + neutral;
    
    if (total === 0) {
      return { positive: 0, negative: 0, neutral: 1 };
    }
    
    return {
      positive: Math.round((positive / total) * 1000) / 1000,
      negative: Math.round((negative / total) * 1000) / 1000,
      neutral: Math.round((neutral / total) * 1000) / 1000
    };
  }
  
  /**
   * Calculate confidence score
   * @private
   */
  _calculateConfidence(sentenceResults, text) {
    const totalWords = text.split(/\s+/).length;
    const sentimentWords = sentenceResults.reduce(
      (sum, r) => sum + r.sentimentWordCount, 
      0
    );
    
    // Coverage: ratio of sentiment words to total words
    const coverage = totalWords > 0 ? sentimentWords / totalWords : 0;
    
    // Base confidence on coverage (typical news articles: 3-10% sentiment words)
    let confidence = Math.min(1, coverage * 15);
    
    // Penalty for very few sentiment words
    if (sentimentWords < this.config.minSentimentWords) {
      confidence *= this.config.lowCoverageConfidencePenalty;
    }
    
    return confidence;
  }
  
  /**
   * Normalize score to -1 to +1 range
   * @private
   */
  _normalizeScore(totalScore, wordCount) {
    if (wordCount === 0) return 0;
    
    // Average score per word, then normalize
    // Max possible score is ~5 (extreme words), typical is 1-2
    const avgScore = totalScore / wordCount;
    
    // Sigmoid-like normalization to keep in -1 to +1
    const normalized = avgScore / (1 + Math.abs(avgScore) * 0.5);
    
    return Math.max(-1, Math.min(1, normalized));
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
   * Analyze entity-level sentiment
   * @private
   */
  async _analyzeEntitySentiment(contentId, text) {
    if (!this.tagAdapter) return [];
    
    try {
      // Get entities from tag adapter
      const entities = this.tagAdapter.getEntities(contentId);
      
      if (!entities || entities.length === 0) {
        return [];
      }
      
      // Analyze sentiment for each entity
      return this.entitySentiment.analyzeEntities(text, entities);
    } catch (err) {
      this.logger.error(`[SentimentAnalyzer] Entity sentiment failed for ${contentId}:`, err.message);
      return [];
    }
  }
  
  /**
   * Invalidate cached sentiment
   * @param {number} contentId - Article content ID
   * @returns {{deleted: number}}
   */
  invalidateCache(contentId) {
    if (!this.sentimentAdapter) {
      return { deleted: 0 };
    }
    
    return this.sentimentAdapter.deleteSentiment(contentId);
  }
  
  /**
   * Get analyzer statistics
   * @returns {Object}
   */
  getStats() {
    const stats = {
      config: this.config,
      lexiconStats: this.lexicon.getStats(),
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
