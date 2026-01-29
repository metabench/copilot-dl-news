'use strict';

/**
 * ContentConfidenceScorer - Computes extraction confidence scores for articles.
 * 
 * Factors considered:
 * - Readability extraction success (title, date, content length)
 * - Metadata completeness (author, section, publication date)
 * - Content structure quality (semantic HTML, word count ratios)
 * - Visual analyzer confidence (if available)
 * 
 * Output: 0.0 to 1.0 score where:
 * - 0.0-0.3: Low confidence (likely extraction failed or wrong content)
 * - 0.3-0.6: Medium confidence (partial extraction, needs review)
 * - 0.6-0.8: Good confidence (usable extraction)
 * - 0.8-1.0: High confidence (reliable extraction)
 */
class ContentConfidenceScorer {
  /**
   * @param {Object} options
   * @param {number} [options.minWordCount=100] - Minimum words for full confidence
   * @param {number} [options.idealWordCount=500] - Ideal word count for articles
   * @param {number} [options.maxWordCount=10000] - Cap for word count (beyond = suspiciously long)
   */
  constructor(options = {}) {
    this.minWordCount = options.minWordCount ?? 100;
    this.idealWordCount = options.idealWordCount ?? 500;
    this.maxWordCount = options.maxWordCount ?? 10000;
  }

  /**
   * Compute confidence score for extracted content.
   * 
   * @param {Object} extraction - Extracted content data
   * @param {string} [extraction.title] - Extracted title
   * @param {string} [extraction.content] - Extracted article content (text)
   * @param {string} [extraction.date] - Extracted publication date
   * @param {string} [extraction.author] - Extracted author
   * @param {string} [extraction.section] - Section/category
   * @param {number} [extraction.wordCount] - Word count
   * @param {Object} [extraction.readability] - Readability.js output
   * @param {Object} [extraction.visualAnalysis] - VisualAnalyzer output
   * @returns {Object} Confidence result
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

    const factors = {};
    let totalWeight = 0;
    let weightedSum = 0;

    // Factor 1: Title presence and quality (weight: 0.15)
    const titleScore = this._scoreTitleQuality(extraction.title);
    factors.title = { score: titleScore, weight: 0.15 };
    weightedSum += titleScore * 0.15;
    totalWeight += 0.15;

    // Factor 2: Content length (weight: 0.25)
    const wordCount = extraction.wordCount ?? this._countWords(extraction.content);
    const lengthScore = this._scoreLengthQuality(wordCount);
    factors.length = { score: lengthScore, weight: 0.25, wordCount };
    weightedSum += lengthScore * 0.25;
    totalWeight += 0.25;

    // Factor 3: Metadata completeness (weight: 0.20)
    const metadataScore = this._scoreMetadataCompleteness(extraction);
    factors.metadata = { score: metadataScore.score, weight: 0.20, ...metadataScore.details };
    weightedSum += metadataScore.score * 0.20;
    totalWeight += 0.20;

    // Factor 4: Readability success indicators (weight: 0.25)
    const readabilityScore = this._scoreReadabilityOutput(extraction.readability);
    factors.readability = { score: readabilityScore.score, weight: 0.25, ...readabilityScore.details };
    weightedSum += readabilityScore.score * 0.25;
    totalWeight += 0.25;

    // Factor 5: Visual analysis confidence (weight: 0.15, optional)
    if (extraction.visualAnalysis) {
      const visualScore = this._scoreVisualAnalysis(extraction.visualAnalysis);
      factors.visual = { score: visualScore, weight: 0.15 };
      weightedSum += visualScore * 0.15;
      totalWeight += 0.15;
    }

    // Normalize if visual analysis wasn't available
    const finalScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

    // Determine level and recommendation
    const level = this._scoreToLevel(finalScore);
    const recommendation = this._getRecommendation(finalScore, factors);

    return {
      score: Math.round(finalScore * 1000) / 1000, // 3 decimal places
      level,
      factors,
      recommendation,
      needsTeacherReview: finalScore < 0.5
    };
  }

  /**
   * Score title quality.
   * @private
   */
  _scoreTitleQuality(title) {
    if (!title || typeof title !== 'string') return 0;
    
    const trimmed = title.trim();
    if (trimmed.length === 0) return 0;
    if (trimmed.length < 10) return 0.3; // Too short
    if (trimmed.length > 200) return 0.5; // Suspiciously long
    
    // Check for common garbage patterns
    const lowerTitle = trimmed.toLowerCase();
    const garbagePatterns = [
      /^untitled/,
      /^page \d+/,
      /^http/,
      /^www\./,
      /^\d+$/,
      /^loading/,
      /^error/,
      /^404/,
      /^null$/
    ];
    
    for (const pattern of garbagePatterns) {
      if (pattern.test(lowerTitle)) return 0.2;
    }
    
    // Good title length and format
    if (trimmed.length >= 20 && trimmed.length <= 150) {
      return 1.0;
    }
    
    return 0.7;
  }

  /**
   * Score content length quality.
   * @private
   */
  _scoreLengthQuality(wordCount) {
    if (!wordCount || wordCount < 10) return 0;
    if (wordCount < this.minWordCount) return 0.3;
    if (wordCount > this.maxWordCount) return 0.5; // Suspiciously long
    
    // Optimal range gets full score
    if (wordCount >= this.idealWordCount) {
      return 1.0;
    }
    
    // Linear interpolation from minWordCount to idealWordCount
    const range = this.idealWordCount - this.minWordCount;
    const progress = (wordCount - this.minWordCount) / range;
    return 0.3 + (0.7 * progress);
  }

  /**
   * Score metadata completeness.
   * @private
   */
  _scoreMetadataCompleteness(extraction) {
    const details = {
      hasDate: false,
      hasAuthor: false,
      hasSection: false
    };
    
    let score = 0;
    
    // Date is most important (40% of metadata score)
    if (extraction.date && this._isValidDate(extraction.date)) {
      details.hasDate = true;
      score += 0.4;
    }
    
    // Author (30% of metadata score)
    if (extraction.author && typeof extraction.author === 'string' && extraction.author.trim().length > 1) {
      details.hasAuthor = true;
      score += 0.3;
    }
    
    // Section (30% of metadata score)
    if (extraction.section && typeof extraction.section === 'string' && extraction.section.trim().length > 0) {
      details.hasSection = true;
      score += 0.3;
    }
    
    return { score, details };
  }

  /**
   * Score Readability.js output quality.
   * @private
   */
  _scoreReadabilityOutput(readability) {
    const details = {
      hasContent: false,
      hasTitle: false,
      hasByline: false,
      hasExcerpt: false
    };
    
    if (!readability) {
      return { score: 0.5, details }; // No Readability data = neutral
    }
    
    let score = 0;
    
    // Content presence (40%)
    if (readability.content && readability.content.length > 100) {
      details.hasContent = true;
      score += 0.4;
    } else if (readability.textContent && readability.textContent.length > 100) {
      details.hasContent = true;
      score += 0.35;
    }
    
    // Title (25%)
    if (readability.title && readability.title.length > 5) {
      details.hasTitle = true;
      score += 0.25;
    }
    
    // Byline (20%)
    if (readability.byline && readability.byline.length > 2) {
      details.hasByline = true;
      score += 0.20;
    }
    
    // Excerpt (15%)
    if (readability.excerpt && readability.excerpt.length > 20) {
      details.hasExcerpt = true;
      score += 0.15;
    }
    
    return { score, details };
  }

  /**
   * Score visual analysis confidence.
   * @private
   */
  _scoreVisualAnalysis(visualAnalysis) {
    if (!visualAnalysis || !visualAnalysis.valid) return 0;
    
    // Use the visual analyzer's own confidence score
    if (typeof visualAnalysis.confidence === 'number') {
      return visualAnalysis.confidence;
    }
    
    // Fallback: compute from components
    let score = 0;
    if (visualAnalysis.hasMainContent) score += 0.5;
    if (visualAnalysis.hasMetadata) score += 0.3;
    if (visualAnalysis.layout?.type !== 'unknown') score += 0.2;
    
    return Math.min(1, score);
  }

  /**
   * Convert numeric score to level string.
   * @private
   */
  _scoreToLevel(score) {
    if (score >= 0.8) return 'high';
    if (score >= 0.6) return 'good';
    if (score >= 0.3) return 'medium';
    return 'low';
  }

  /**
   * Get recommendation based on score and factors.
   * @private
   */
  _getRecommendation(score, factors) {
    if (score >= 0.8) return 'accept';
    if (score >= 0.6) return 'accept-with-caution';
    
    // Check what's missing
    const issues = [];
    if (factors.title?.score < 0.5) issues.push('title');
    if (factors.length?.score < 0.5) issues.push('content-length');
    if (factors.metadata?.score < 0.5) issues.push('metadata');
    if (factors.readability?.score < 0.5) issues.push('readability');
    
    if (score >= 0.3) {
      return `review-needed:${issues.join(',')}`;
    }
    
    return `teacher-required:${issues.join(',')}`;
  }

  /**
   * Check if a date string is valid.
   * @private
   */
  _isValidDate(dateStr) {
    if (!dateStr) return false;
    const parsed = Date.parse(dateStr);
    if (isNaN(parsed)) return false;
    
    const date = new Date(parsed);
    const now = new Date();
    const minDate = new Date('1990-01-01');
    
    // Date should be between 1990 and slightly in the future (allow for timezone issues)
    const maxDate = new Date(now.getTime() + 86400000 * 7); // 7 days from now
    
    return date >= minDate && date <= maxDate;
  }

  /**
   * Count words in text.
   * @private
   */
  _countWords(text) {
    if (!text || typeof text !== 'string') return 0;
    const words = text.trim().split(/\s+/).filter(w => w.length > 0);
    return words.length;
  }

  /**
   * Batch score multiple extractions.
   * 
   * @param {Array<Object>} extractions - Array of extraction objects.
   *   Each object should have `url`, `extraction` (the extracted content),
   *   and optionally `context` (additional scoring context).
   * @returns {Array<Object>} Array of scored results with url attached.
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
   * @param {Array<Object>} scoredItems - Array of scored extraction results.
   * @param {number} [threshold=0.4] - Score threshold below which items are considered low-confidence.
   * @returns {Array<Object>} Low-confidence items sorted by score ascending (worst first).
   */
  getLowConfidenceItems(scoredItems, threshold = 0.4) {
    if (!Array.isArray(scoredItems)) return [];
    return scoredItems
      .filter(item => item.score < threshold)
      .sort((a, b) => a.score - b.score);
  }
}

module.exports = { ContentConfidenceScorer };
