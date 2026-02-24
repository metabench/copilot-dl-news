'use strict';

/**
 * ContentConfidenceScorer - Computes extraction confidence scores for articles.
 * 
 * Thin adapter over news-db-pure-analysis/content/confidenceScorer.
 * Preserves the class-based API for backward compatibility.
 * 
 * Factors considered:
 * - Title quality, content length, metadata completeness
 * - Readability output quality, visual analysis confidence
 * 
 * Output: 0.0 to 1.0 score.
 */

const {
  scoreConfidence: pureScoreConfidence,
  scoreBatch: pureScoreBatch,
  filterLowConfidence: pureFilterLowConfidence
} = require('news-db-pure-analysis');

class ContentConfidenceScorer {
  /**
   * @param {Object} options
   * @param {number} [options.minWordCount=100]
   * @param {number} [options.idealWordCount=500]
   * @param {number} [options.maxWordCount=10000]
   */
  constructor(options = {}) {
    this.config = {
      minWordCount: options.minWordCount ?? 100,
      idealWordCount: options.idealWordCount ?? 500,
      maxWordCount: options.maxWordCount ?? 10000,
    };
  }

  /**
   * Map local extraction object to pure ExtractionInput.
   * Handles the `date` → `publishDate` field mapping.
   * @private
   */
  _toPureInput(extraction) {
    if (!extraction) return extraction;
    return {
      ...extraction,
      publishDate: extraction.publishDate || extraction.date,
    };
  }

  /**
   * Compute confidence score for extracted content.
   * 
   * @param {Object} extraction - Extracted content data
   * @returns {Object} Confidence result { score, level, factors, recommendation, needsTeacherReview }
   */
  score(extraction) {
    if (!extraction) {
      return {
        score: 0,
        level: 'none',
        factors: {},
        recommendation: 'no-extraction'
      };
    }

    return pureScoreConfidence(this._toPureInput(extraction), this.config);
  }

  /**
   * Batch score multiple extractions.
   * 
   * @param {Array<Object>} extractions - Array of { url, extraction } objects
   * @returns {Array<Object>} Scored results with url attached
   */
  scoreBatch(extractions) {
    if (!Array.isArray(extractions)) return [];
    return extractions.map(item => ({
      url: item.url,
      ...this.score(item.extraction || item)
    }));
  }

  /**
   * Filter items that need re-extraction based on low confidence.
   * 
   * @param {Array<Object>} scoredItems - Array of scored extraction results
   * @param {number} [threshold=0.4] - Score threshold
   * @returns {Array<Object>} Low-confidence items sorted worst-first
   */
  getLowConfidenceItems(scoredItems, threshold = 0.4) {
    if (!Array.isArray(scoredItems)) return [];
    return scoredItems
      .filter(item => item.score < threshold)
      .sort((a, b) => a.score - b.score);
  }
}

module.exports = { ContentConfidenceScorer };
