'use strict';

/**
 * @fileoverview Stage 2: Content Signals Classification
 * 
 * Classifies pages by analyzing HTML content structure without URL patterns.
 * Part of the Classification Cascade architecture.
 * 
 * Signals analyzed:
 * - Word count
 * - Link density (ratio of link text to total text)
 * - Paragraph count
 * - Heading structure (h2, h3 counts)
 * - Schema.org signals (article types, article body)
 * - Navigation link indicators
 * 
 * @example
 * const { Stage2ContentClassifier } = require('./Stage2ContentClassifier');
 * const classifier = new Stage2ContentClassifier();
 * const result = classifier.classify(htmlString);
 * // { classification: 'article', confidence: 0.85, reason: 'high-word-count+schema', signals: {...} }
 */

const cheerio = require('cheerio');

/**
 * @typedef {Object} ContentSignals
 * @property {number|null} wordCount - Total word count
 * @property {number|null} linkDensity - Ratio of link text to total text (0-1)
 * @property {number|null} paragraphCount - Number of <p> elements
 * @property {number|null} h2Count - Number of <h2> elements
 * @property {number|null} h3Count - Number of <h3> elements
 * @property {number|null} linkCount - Number of <a> elements
 * @property {number|null} navLinksCount - Navigation links (if detectable)
 * @property {Object|null} schema - Schema.org signals
 */

/**
 * @typedef {Object} ClassificationResult
 * @property {string} classification - 'article' | 'hub' | 'nav' | 'unknown'
 * @property {number} confidence - Confidence score 0.0-1.0
 * @property {string} reason - Human-readable reason
 * @property {ContentSignals} signals - Extracted content signals
 */

/**
 * Default thresholds for classification
 */
const DEFAULT_THRESHOLDS = {
  // Article indicators
  minArticleWordCount: 180,
  highArticleWordCount: 350,
  maxArticleLinkDensity: 0.2,
  minArticleParagraphs: 4,
  
  // Hub/Nav indicators
  minNavLinkDensity: 0.35,
  minNavLinkCount: 50,
  highNavLinkCount: 100,
  
  // Schema score thresholds
  strongSchemaScore: 6,
  mediumSchemaScore: 3.5,
  weakSchemaScore: 0.5,
};

class Stage2ContentClassifier {
  /**
   * @param {Object} options
   * @param {Object} [options.thresholds] - Override default thresholds
   */
  constructor(options = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...options.thresholds };
  }

  /**
   * Extract signals from HTML without classifying
   * @param {string} html - HTML content
   * @returns {ContentSignals}
   */
  extractSignals(html) {
    if (!html || typeof html !== 'string') {
      return this._emptySignals();
    }

    const $ = cheerio.load(html);
    
    // Get body text
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
    const wordCount = this._countWords(bodyText);
    
    // Link density
    let linkTextLength = 0;
    $('a').each((_, el) => {
      const text = $(el).text().trim();
      linkTextLength += text.length;
    });
    const totalTextLength = bodyText.length || 1;
    const linkDensity = Math.min(1, Math.max(0, linkTextLength / totalTextLength));
    
    // Element counts
    const paragraphCount = $('p').length;
    const h2Count = $('h2').length;
    const h3Count = $('h3').length;
    const linkCount = $('a').length;
    
    // Try to detect nav-specific links
    const navLinksCount = this._countNavLinks($);
    
    // Schema.org signals
    const schema = this._extractSchemaSignals($, html);
    
    return {
      wordCount,
      linkDensity,
      paragraphCount,
      h2Count,
      h3Count,
      linkCount,
      navLinksCount,
      schema
    };
  }

  /**
   * Classify HTML content
   * @param {string} html - HTML content
   * @param {string} [url] - URL (for context, not pattern matching)
   * @param {Object} [metadata] - Additional metadata (navLinksCount, etc.)
   * @returns {ClassificationResult}
   */
  classify(html, url = null, metadata = {}) {
    const signals = this.extractSignals(html);
    
    // Merge any metadata signals
    if (typeof metadata.navLinksCount === 'number') {
      signals.navLinksCount = metadata.navLinksCount;
    }
    if (typeof metadata.wordCount === 'number' && signals.wordCount === null) {
      signals.wordCount = metadata.wordCount;
    }
    
    // Score calculation
    const scoring = this._computeScores(signals);
    
    // Determine classification
    const classification = this._determineClassification(scoring);
    
    return {
      classification: classification.type,
      confidence: classification.confidence,
      reason: classification.reason,
      signals
    };
  }

  /**
   * Classify using precomputed signals (skips HTML parsing).
   *
   * Useful when signals are already available from other pipelines (e.g. DB-backed
   * content analysis rows) and you want Stage 2 scoring/threshold logic.
   *
   * @param {ContentSignals} signals - Precomputed content signals
   * @param {string|null} [url] - URL (context only)
   * @param {Object} [metadata] - Optional overrides (e.g., navLinksCount, wordCount)
   * @returns {ClassificationResult}
   */
  classifyFromSignals(signals, url = null, metadata = {}) {
    const mergedSignals = { ...this._emptySignals(), ...(signals || {}) };

    if (typeof metadata.navLinksCount === 'number') {
      mergedSignals.navLinksCount = metadata.navLinksCount;
    }
    if (typeof metadata.wordCount === 'number' && mergedSignals.wordCount === null) {
      mergedSignals.wordCount = metadata.wordCount;
    }

    const scoring = this._computeScores(mergedSignals);
    const classification = this._determineClassification(scoring);

    return {
      classification: classification.type,
      confidence: classification.confidence,
      reason: classification.reason,
      signals: mergedSignals
    };
  }

  /**
   * Compute positive/negative scores from signals
   * @private
   */
  _computeScores(signals) {
    const t = this.thresholds;
    const reasons = [];
    const rejections = [];
    let positives = 0;
    let negatives = 0;
    
    // Word count signals
    if (typeof signals.wordCount === 'number') {
      if (signals.wordCount >= t.highArticleWordCount) {
        positives += 2;
        reasons.push(`word-count:high(${signals.wordCount})`);
      } else if (signals.wordCount >= t.minArticleWordCount) {
        positives += 1;
        reasons.push(`word-count:medium(${signals.wordCount})`);
      } else {
        negatives += 2;
        rejections.push(`word-count:low(${signals.wordCount})`);
      }
    } else {
      negatives += 1;
      rejections.push('word-count:unavailable');
    }
    
    // Link density signals
    if (typeof signals.linkDensity === 'number') {
      if (signals.linkDensity <= t.maxArticleLinkDensity) {
        positives += 1;
        reasons.push(`link-density:low(${signals.linkDensity.toFixed(2)})`);
      } else if (signals.linkDensity >= t.minNavLinkDensity) {
        negatives += 1;
        rejections.push(`link-density:high(${signals.linkDensity.toFixed(2)})`);
      }
    }
    
    // Paragraph count
    if (typeof signals.paragraphCount === 'number') {
      if (signals.paragraphCount >= t.minArticleParagraphs) {
        positives += 1;
        reasons.push(`paragraphs:${signals.paragraphCount}`);
      } else if (signals.paragraphCount <= 1) {
        negatives += 1;
        rejections.push(`paragraphs:${signals.paragraphCount}`);
      }
    }
    
    // Navigation link count
    if (typeof signals.navLinksCount === 'number' || typeof signals.linkCount === 'number') {
      const linkCount = signals.navLinksCount ?? signals.linkCount;
      if (linkCount >= t.highNavLinkCount) {
        negatives += 3;
        rejections.push(`nav-links:very-high(${linkCount})`);
      } else if (linkCount >= t.minNavLinkCount) {
        negatives += 1;
        rejections.push(`nav-links:high(${linkCount})`);
      }
    }
    
    // Schema.org signals
    if (signals.schema) {
      const schemaScore = typeof signals.schema.score === 'number' ? signals.schema.score : 0;
      
      if (schemaScore >= t.strongSchemaScore) {
        positives += 3;
        reasons.push(`schema:strong(${schemaScore.toFixed(1)})`);
      } else if (schemaScore >= t.mediumSchemaScore) {
        positives += 2;
        reasons.push(`schema:medium(${schemaScore.toFixed(1)})`);
      } else if (schemaScore > t.weakSchemaScore) {
        positives += 1;
        reasons.push(`schema:weak(${schemaScore.toFixed(1)})`);
      } else if (signals.schema.hasStructuredData && !signals.schema.hasArticleType) {
        negatives += 1;
        rejections.push('schema:no-article-type');
      }
      
      if (!signals.schema.hasArticleBody && signals.schema.hasArticleType && schemaScore < 3) {
        negatives += 1;
        rejections.push('schema:missing-body');
      }
    }
    
    return { positives, negatives, reasons, rejections };
  }

  /**
   * Determine final classification from scores
   * @private
   */
  _determineClassification(scoring) {
    const { positives, negatives, reasons, rejections } = scoring;
    const score = positives - negatives;
    
    // Calculate confidence
    const total = Math.max(1, positives + negatives);
    const confidence = Math.max(0, Math.min(1, positives / total));
    
    // Determine type
    let type;
    if (score > 0) {
      type = 'article';
    } else if (negatives >= 3 && positives <= 1) {
      type = 'nav';
    } else if (score < -1) {
      type = 'hub';
    } else {
      type = 'unknown';
    }
    
    // Build reason string
    const reasonStr = reasons.length > 0 
      ? reasons.slice(0, 3).join('+')
      : (rejections.length > 0 ? rejections.slice(0, 2).join('+') : 'no-signals');
    
    return { type, confidence, reason: reasonStr };
  }

  /**
   * Count navigation-like links
   * @private
   */
  _countNavLinks($) {
    let count = 0;
    
    // Count links in nav elements
    $('nav a, header a, footer a, [role="navigation"] a').each(() => count++);
    
    // If no explicit nav, estimate from total links
    if (count === 0) {
      count = $('a').length;
    }
    
    return count;
  }

  /**
   * Extract schema.org signals from HTML
   * @private
   */
  _extractSchemaSignals($, html) {
    const signals = {
      hasStructuredData: false,
      hasArticleType: false,
      hasArticleBody: false,
      score: 0,
      types: [],
      sources: []
    };
    
    try {
      // Check JSON-LD scripts
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const content = $(el).html();
          if (!content) return;
          
          const data = JSON.parse(content);
          signals.hasStructuredData = true;
          signals.sources.push('json-ld');
          
          const types = this._extractSchemaTypes(data);
          signals.types.push(...types);
          
          if (this._isArticleType(types)) {
            signals.hasArticleType = true;
            signals.score += 3;
          }
          
          if (this._hasArticleBody(data)) {
            signals.hasArticleBody = true;
            signals.score += 2;
          }
          
          // Additional signals
          if (data.author || data.creator) signals.score += 1;
          if (data.datePublished || data.dateCreated) signals.score += 1;
          if (data.headline || data.name) signals.score += 0.5;
        } catch (_) {
          // Invalid JSON - skip
        }
      });
      
      // Check OpenGraph
      const ogType = $('meta[property="og:type"]').attr('content');
      if (ogType) {
        signals.hasStructuredData = true;
        signals.sources.push('opengraph');
        if (ogType === 'article') {
          signals.hasArticleType = true;
          signals.score += 1.5;
        }
      }
      
      // Check microdata
      const itemtypes = [];
      $('[itemtype]').each((_, el) => {
        const type = $(el).attr('itemtype');
        if (type) {
          itemtypes.push(type);
          signals.hasStructuredData = true;
        }
      });
      if (itemtypes.length > 0) {
        signals.sources.push('microdata');
        if (itemtypes.some(t => /Article|NewsArticle|BlogPosting/i.test(t))) {
          signals.hasArticleType = true;
          signals.score += 2;
        }
      }
      
    } catch (err) {
      // Schema extraction failed - return partial signals
    }
    
    return signals;
  }

  /**
   * Extract @type values from schema data
   * @private
   */
  _extractSchemaTypes(data) {
    const types = [];
    
    const extract = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      
      if (Array.isArray(obj)) {
        obj.forEach(extract);
        return;
      }
      
      if (obj['@type']) {
        const t = obj['@type'];
        if (Array.isArray(t)) {
          types.push(...t);
        } else {
          types.push(t);
        }
      }
      
      // Recurse into @graph
      if (obj['@graph']) {
        extract(obj['@graph']);
      }
    };
    
    extract(data);
    return types;
  }

  /**
   * Check if types include article types
   * @private
   */
  _isArticleType(types) {
    const articleTypes = ['Article', 'NewsArticle', 'BlogPosting', 'TechArticle', 
                          'ScholarlyArticle', 'Report', 'Review', 'OpinionNewsArticle'];
    return types.some(t => articleTypes.includes(t));
  }

  /**
   * Check if schema data has article body
   * @private
   */
  _hasArticleBody(data) {
    const check = (obj) => {
      if (!obj || typeof obj !== 'object') return false;
      if (Array.isArray(obj)) return obj.some(check);
      if (obj.articleBody) return true;
      if (obj['@graph']) return check(obj['@graph']);
      return false;
    };
    return check(data);
  }

  /**
   * Count words in text
   * @private
   */
  _countWords(text) {
    if (!text || typeof text !== 'string') return 0;
    const words = text.trim().split(/\s+/).filter(w => w.length > 0);
    return words.length;
  }

  /**
   * Return empty signals structure
   * @private
   */
  _emptySignals() {
    return {
      wordCount: null,
      linkDensity: null,
      paragraphCount: null,
      h2Count: null,
      h3Count: null,
      linkCount: null,
      navLinksCount: null,
      schema: null
    };
  }
}

module.exports = { Stage2ContentClassifier };
