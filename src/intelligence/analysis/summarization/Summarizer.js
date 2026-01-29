'use strict';

/**
 * Summarizer - Main summarization service
 * 
 * Orchestrates extractive summarization using TextRank algorithm
 * with multiple length options and format outputs.
 * 
 * Length options:
 * - brief: 1 sentence (~25 words)
 * - short: 3 sentences (~75 words)
 * - full: ~150 words (paragraph)
 * - bullets: 5 key points as bullet list
 * 
 * @module Summarizer
 */

const { tokenize: tokenizeSentences, countWords } = require('./SentenceTokenizer');
const { TextRank } = require('./TextRank');

// Default configuration
const DEFAULT_CONFIG = {
  brief: {
    sentenceCount: 1,
    targetWords: 25
  },
  short: {
    sentenceCount: 3,
    targetWords: 75
  },
  full: {
    sentenceCount: null, // Determined by target words
    targetWords: 150
  },
  bullets: {
    sentenceCount: 5,
    targetWords: null
  }
};

// Minimum sentences required for meaningful summarization
const MIN_SENTENCES_FOR_SUMMARIZATION = 3;

/**
 * Summarizer class for extractive summarization
 */
class Summarizer {
  /**
   * Create a Summarizer instance
   * @param {Object} [options] - Configuration options
   * @param {Object} [options.summaryAdapter] - Database adapter for caching
   * @param {Object} [options.articlesAdapter] - Articles adapter for content
   * @param {Object} [options.logger] - Logger instance
   * @param {Object} [options.config] - Length configuration overrides
   */
  constructor(options = {}) {
    this.summaryAdapter = options.summaryAdapter || null;
    this.articlesAdapter = options.articlesAdapter || null;
    this.logger = options.logger || console;
    this.config = { ...DEFAULT_CONFIG, ...options.config };
    this.textRank = new TextRank();
  }
  
  /**
   * Generate summary for text
   * 
   * @param {string} text - Article text to summarize
   * @param {Object} [options] - Options
   * @param {string} [options.length='short'] - Length type (brief|short|full|bullets)
   * @returns {Object} Summary result
   */
  summarize(text, options = {}) {
    const lengthType = options.length || 'short';
    
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return this._emptyResult(lengthType);
    }
    
    // Tokenize into sentences
    const sentences = tokenizeSentences(text);
    
    if (sentences.length === 0) {
      return this._emptyResult(lengthType);
    }
    
    // If text is too short, return the whole thing
    if (sentences.length < MIN_SENTENCES_FOR_SUMMARIZATION) {
      return this._buildResult(
        sentences.map(s => s.text),
        lengthType,
        'direct'
      );
    }
    
    // Get sentence texts
    const sentenceTexts = sentences.map(s => s.text);
    
    // Rank sentences using TextRank
    const ranked = this.textRank.rank(sentenceTexts);
    
    // Select sentences based on length type
    let selectedSentences;
    
    if (lengthType === 'bullets') {
      selectedSentences = this._selectForBullets(ranked);
    } else if (lengthType === 'full') {
      selectedSentences = this._selectByWordCount(ranked, this.config.full.targetWords);
    } else {
      const count = this.config[lengthType]?.sentenceCount || 3;
      selectedSentences = this.textRank.selectTop(ranked, count);
    }
    
    // Build result
    return this._buildResult(
      selectedSentences.map(s => s.text),
      lengthType,
      'textrank'
    );
  }
  
  /**
   * Generate summary for an article by ID (with caching)
   * 
   * @param {number} contentId - Article content ID
   * @param {Object} [options] - Options
   * @param {string} [options.length='short'] - Length type
   * @param {boolean} [options.regenerate=false] - Force regeneration
   * @returns {Promise<Object>} Summary result with cache info
   */
  async summarizeArticle(contentId, options = {}) {
    const lengthType = options.length || 'short';
    
    // Check cache first
    if (this.summaryAdapter && !options.regenerate) {
      const cached = this.summaryAdapter.getSummary(contentId, lengthType);
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
      throw new Error('Articles adapter required for summarizeArticle()');
    }
    
    const article = this.articlesAdapter.getArticle(contentId);
    if (!article) {
      throw new Error(`Article not found: ${contentId}`);
    }
    
    const text = article.bodyText || article.body_text || '';
    
    // Generate summary
    const summary = this.summarize(text, { length: lengthType });
    
    // Save to cache
    if (this.summaryAdapter) {
      this.summaryAdapter.saveSummary({
        contentId,
        lengthType,
        summaryText: summary.summary,
        method: summary.method,
        sentenceCount: summary.sentenceCount,
        wordCount: summary.wordCount
      });
    }
    
    return {
      ...summary,
      cached: false,
      articleId: contentId,
      generatedAt: new Date().toISOString()
    };
  }
  
  /**
   * Generate bullet point summary
   * 
   * @param {string} text - Article text
   * @returns {Object} Bullet summary result
   */
  summarizeBullets(text) {
    const result = this.summarize(text, { length: 'bullets' });
    return {
      ...result,
      bullets: result.summary.split('\n').filter(b => b.trim().length > 0)
    };
  }
  
  /**
   * Select sentences for bullet points
   * @private
   */
  _selectForBullets(rankedSentences) {
    const count = this.config.bullets.sentenceCount || 5;
    return this.textRank.selectTop(rankedSentences, count);
  }
  
  /**
   * Select sentences by target word count
   * @private
   */
  _selectByWordCount(rankedSentences, targetWords) {
    const selected = [];
    let totalWords = 0;
    
    // Sort by score to pick best sentences first
    const sorted = [...rankedSentences].sort((a, b) => b.score - a.score);
    
    for (const sentence of sorted) {
      const words = countWords(sentence.text);
      
      if (totalWords + words <= targetWords * 1.2) { // Allow 20% overage
        selected.push(sentence);
        totalWords += words;
      }
      
      // Stop if we've exceeded target
      if (totalWords >= targetWords) {
        break;
      }
    }
    
    // Sort by original order
    selected.sort((a, b) => a.index - b.index);
    
    return selected;
  }
  
  /**
   * Build summary result object
   * @private
   */
  _buildResult(sentences, lengthType, method) {
    let summaryText;
    
    if (lengthType === 'bullets') {
      // Format as bullet points
      summaryText = sentences.map(s => `• ${s}`).join('\n');
    } else {
      // Join sentences with space
      summaryText = sentences.join(' ');
    }
    
    const wordCount = countWords(summaryText.replace(/•/g, ''));
    
    return {
      summary: summaryText,
      length: lengthType,
      sentenceCount: sentences.length,
      wordCount,
      method
    };
  }
  
  /**
   * Build empty result
   * @private
   */
  _emptyResult(lengthType) {
    return {
      summary: '',
      length: lengthType,
      sentenceCount: 0,
      wordCount: 0,
      method: 'none',
      error: 'No text to summarize'
    };
  }
  
  /**
   * Batch summarize multiple articles
   * 
   * @param {number[]} contentIds - Array of content IDs
   * @param {Object} [options] - Options
   * @returns {Promise<Object[]>} Array of summary results
   */
  async batchSummarize(contentIds, options = {}) {
    const results = [];
    
    for (const contentId of contentIds) {
      try {
        const summary = await this.summarizeArticle(contentId, options);
        results.push(summary);
      } catch (err) {
        this.logger.error(`[Summarizer] Failed to summarize ${contentId}:`, err.message);
        results.push({
          articleId: contentId,
          error: err.message,
          summary: '',
          length: options.length || 'short'
        });
      }
    }
    
    return results;
  }
  
  /**
   * Invalidate cached summary (e.g., when article is updated)
   * 
   * @param {number} contentId - Article content ID
   * @param {string} [lengthType] - Specific length type or null for all
   * @returns {{deleted: number}}
   */
  invalidateCache(contentId, lengthType = null) {
    if (!this.summaryAdapter) {
      return { deleted: 0 };
    }
    
    return this.summaryAdapter.deleteSummaries(contentId, lengthType);
  }
  
  /**
   * Get statistics
   * @returns {Object}
   */
  getStats() {
    const stats = {
      config: this.config,
      hasAdapter: !!this.summaryAdapter,
      hasArticlesAdapter: !!this.articlesAdapter
    };
    
    if (this.summaryAdapter) {
      stats.cacheStats = this.summaryAdapter.getStats();
    }
    
    return stats;
  }
}

module.exports = {
  Summarizer,
  DEFAULT_CONFIG,
  MIN_SENTENCES_FOR_SUMMARIZATION
};
