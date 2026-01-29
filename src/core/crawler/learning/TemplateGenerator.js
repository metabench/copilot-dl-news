'use strict';

/**
 * TemplateGenerator - Creates extraction rules from sample pages
 * 
 * Analyzes DOM structure across multiple sample pages to find
 * common selectors and patterns that can be used for content extraction.
 * 
 * @module TemplateGenerator
 * @example
 * const generator = new TemplateGenerator({ logger: console });
 * const template = generator.generate(samples);
 * console.log(template.selectors);
 */

const { JSDOM } = require('jsdom');

/**
 * @typedef {Object} Sample
 * @property {string} html - HTML content of the page
 * @property {string} url - URL of the sample page
 * @property {Object} [expected] - Expected extraction results for validation
 * @property {string} [expected.title] - Expected title
 * @property {string} [expected.content] - Expected content
 * @property {string} [expected.date] - Expected date
 * @property {string} [expected.author] - Expected author
 */

/**
 * @typedef {Object} Template
 * @property {string} domain - Domain this template applies to
 * @property {Object} selectors - CSS selectors for extraction
 * @property {string[]} selectors.title - Title selectors in priority order
 * @property {string[]} selectors.content - Content selectors in priority order
 * @property {string[]} selectors.date - Date selectors in priority order
 * @property {string[]} selectors.author - Author selectors in priority order
 * @property {number} confidence - Overall confidence score (0-1)
 * @property {number} sampleCount - Number of samples used
 * @property {string} createdAt - ISO timestamp
 * @property {Object} [metadata] - Additional metadata
 */

/**
 * Common title selectors to search for
 */
const TITLE_CANDIDATES = [
  'h1',
  'article h1',
  '.article-title',
  '.post-title',
  '.entry-title',
  '[itemprop="headline"]',
  '.headline',
  'header h1',
  '.story-title',
  '.article__title',
  'meta[property="og:title"]',
  'title'
];

/**
 * Common content selectors to search for
 */
const CONTENT_CANDIDATES = [
  'article',
  '.article-body',
  '.article-content',
  '.post-content',
  '.entry-content',
  '[itemprop="articleBody"]',
  '.story-body',
  '.article__body',
  '.content-body',
  'main article',
  '.post-body',
  '#article-body'
];

/**
 * Common date selectors to search for
 */
const DATE_CANDIDATES = [
  'time[datetime]',
  '[itemprop="datePublished"]',
  '.published-date',
  '.article-date',
  '.post-date',
  '.entry-date',
  'meta[property="article:published_time"]',
  '.date',
  '.timestamp',
  '.byline time'
];

/**
 * Common author selectors to search for
 */
const AUTHOR_CANDIDATES = [
  '[itemprop="author"]',
  '.author',
  '.byline',
  '.article-author',
  '.post-author',
  'meta[name="author"]',
  '[rel="author"]',
  '.author-name',
  '.writer'
];

class TemplateGenerator {
  /**
   * @param {Object} opts
   * @param {Object} [opts.logger] - Logger instance
   * @param {Object} [opts.candidateSelectors] - Custom candidate selectors
   */
  constructor(opts = {}) {
    this.logger = opts.logger || console;
    this.candidateSelectors = {
      title: opts.candidateSelectors?.title || TITLE_CANDIDATES,
      content: opts.candidateSelectors?.content || CONTENT_CANDIDATES,
      date: opts.candidateSelectors?.date || DATE_CANDIDATES,
      author: opts.candidateSelectors?.author || AUTHOR_CANDIDATES
    };
  }

  /**
   * Generate a template from sample pages
   * 
   * @param {Sample[]} samples - Array of sample pages
   * @param {Object} [opts] - Generation options
   * @param {string} [opts.domain] - Domain name (extracted from first URL if not provided)
   * @returns {Template} Generated template
   */
  generate(samples, opts = {}) {
    if (!samples || samples.length === 0) {
      throw new Error('generate requires at least one sample');
    }

    const domain = opts.domain || this._extractDomain(samples[0].url);
    const parsedSamples = samples.map(s => this._parseSample(s));

    // Find common selectors for each field
    const titleSelectors = this.findCommonSelectors(parsedSamples, 'title', this.candidateSelectors.title);
    const contentSelectors = this.findCommonSelectors(parsedSamples, 'content', this.candidateSelectors.content);
    const dateSelectors = this.findCommonSelectors(parsedSamples, 'date', this.candidateSelectors.date);
    const authorSelectors = this.findCommonSelectors(parsedSamples, 'author', this.candidateSelectors.author);

    const template = {
      domain,
      selectors: {
        title: titleSelectors.selectors,
        content: contentSelectors.selectors,
        date: dateSelectors.selectors,
        author: authorSelectors.selectors
      },
      confidence: this._calculateOverallConfidence({
        title: titleSelectors.confidence,
        content: contentSelectors.confidence,
        date: dateSelectors.confidence,
        author: authorSelectors.confidence
      }),
      sampleCount: samples.length,
      createdAt: new Date().toISOString(),
      metadata: {
        fieldConfidences: {
          title: titleSelectors.confidence,
          content: contentSelectors.confidence,
          date: dateSelectors.confidence,
          author: authorSelectors.confidence
        }
      }
    };

    this.logger.info?.(`[TemplateGenerator] Generated template for ${domain} with confidence ${(template.confidence * 100).toFixed(1)}%`);

    return template;
  }

  /**
   * Find common selectors across multiple pages
   * 
   * @param {Object[]} parsedSamples - Parsed sample documents
   * @param {string} field - Field name (title, content, date, author)
   * @param {string[]} candidates - Candidate selectors to try
   * @returns {{ selectors: string[], confidence: number }}
   */
  findCommonSelectors(parsedSamples, field, candidates) {
    const selectorScores = new Map();

    for (const candidate of candidates) {
      let matchCount = 0;
      let totalScore = 0;

      for (const sample of parsedSamples) {
        const result = this._evaluateSelector(sample, candidate, field);
        if (result.found) {
          matchCount++;
          totalScore += result.score;
        }
      }

      if (matchCount > 0) {
        const consistency = matchCount / parsedSamples.length;
        const avgScore = totalScore / matchCount;
        const overallScore = consistency * avgScore;
        
        selectorScores.set(candidate, {
          matchCount,
          consistency,
          avgScore,
          overallScore
        });
      }
    }

    // Sort by overall score and select top selectors
    const sortedSelectors = Array.from(selectorScores.entries())
      .sort((a, b) => b[1].overallScore - a[1].overallScore)
      .slice(0, 3) // Keep top 3 selectors
      .map(([selector]) => selector);

    // Calculate confidence based on best selector
    const bestScore = sortedSelectors.length > 0
      ? selectorScores.get(sortedSelectors[0]).overallScore
      : 0;

    return {
      selectors: sortedSelectors,
      confidence: Math.min(bestScore, 1)
    };
  }

  /**
   * Score a template against sample pages
   * 
   * @param {Template} template - Template to score
   * @param {Sample[]} samples - Samples to test against
   * @returns {number} Accuracy score (0-1)
   */
  scoreTemplate(template, samples) {
    if (!template || !samples || samples.length === 0) {
      return 0;
    }

    const parsedSamples = samples.map(s => this._parseSample(s));
    const fields = ['title', 'content', 'date', 'author'];
    let totalScore = 0;
    let fieldCount = 0;

    for (const field of fields) {
      const selectors = template.selectors[field] || [];
      if (selectors.length === 0) continue;

      let fieldScore = 0;
      for (const sample of parsedSamples) {
        const expected = sample.expected?.[field];
        const extracted = this._extractWithSelectors(sample.doc, selectors, field);
        
        if (expected && extracted) {
          // Compare extracted vs expected
          const similarity = this._calculateSimilarity(extracted, expected);
          fieldScore += similarity;
        } else if (extracted) {
          // No expected value but we found something - partial credit
          fieldScore += 0.5;
        }
      }

      totalScore += fieldScore / parsedSamples.length;
      fieldCount++;
    }

    return fieldCount > 0 ? totalScore / fieldCount : 0;
  }

  /**
   * Parse a sample into a DOM document
   * @private
   */
  _parseSample(sample) {
    const dom = new JSDOM(sample.html, { url: sample.url });
    return {
      doc: dom.window.document,
      url: sample.url,
      expected: sample.expected || {}
    };
  }

  /**
   * Evaluate a selector against a sample
   * @private
   */
  _evaluateSelector(sample, selector, field) {
    const doc = sample.doc;
    
    try {
      // Handle meta tag selectors
      if (selector.startsWith('meta[')) {
        const meta = doc.querySelector(selector);
        if (meta) {
          const content = meta.getAttribute('content');
          if (content && content.trim().length > 0) {
            return { found: true, score: this._scoreContent(content, field) };
          }
        }
        return { found: false, score: 0 };
      }

      const elements = doc.querySelectorAll(selector);
      if (elements.length === 0) {
        return { found: false, score: 0 };
      }

      // For content fields, prefer the element with the most text
      const bestElement = Array.from(elements)
        .map(el => ({ el, textLength: (el.textContent || '').trim().length }))
        .sort((a, b) => b.textLength - a.textLength)[0];

      if (!bestElement || bestElement.textLength === 0) {
        return { found: false, score: 0 };
      }

      const score = this._scoreContent(bestElement.el.textContent || '', field);
      return { found: true, score };
    } catch (err) {
      this.logger.warn?.(`[TemplateGenerator] Selector error: ${selector} - ${err.message}`);
      return { found: false, score: 0 };
    }
  }

  /**
   * Score content quality for a field
   * @private
   */
  _scoreContent(content, field) {
    const text = (content || '').trim();
    if (!text) return 0;

    switch (field) {
      case 'title':
        // Good titles: 10-200 chars, not too short or too long
        const titleLen = text.length;
        if (titleLen < 5) return 0.2;
        if (titleLen > 300) return 0.3;
        if (titleLen >= 20 && titleLen <= 150) return 1;
        return 0.7;

      case 'content':
        // Good content: 100+ chars, multiple sentences
        const contentLen = text.length;
        if (contentLen < 50) return 0.2;
        if (contentLen < 200) return 0.5;
        if (contentLen >= 500) return 1;
        return 0.8;

      case 'date':
        // Try to detect date-like content
        const datePatterns = [
          /\d{4}-\d{2}-\d{2}/,
          /\d{1,2}\/\d{1,2}\/\d{2,4}/,
          /\w+ \d{1,2},? \d{4}/,
          /\d{1,2} \w+ \d{4}/
        ];
        for (const pattern of datePatterns) {
          if (pattern.test(text)) return 1;
        }
        return 0.3;

      case 'author':
        // Good author: reasonable name length
        const authorLen = text.length;
        if (authorLen < 2) return 0.2;
        if (authorLen > 100) return 0.3;
        if (authorLen >= 3 && authorLen <= 50) return 1;
        return 0.6;

      default:
        return text.length > 0 ? 0.5 : 0;
    }
  }

  /**
   * Extract content using a list of selectors
   * @private
   */
  _extractWithSelectors(doc, selectors, field) {
    for (const selector of selectors) {
      try {
        if (selector.startsWith('meta[')) {
          const meta = doc.querySelector(selector);
          if (meta) {
            const content = meta.getAttribute('content');
            if (content && content.trim()) return content.trim();
          }
          continue;
        }

        const el = doc.querySelector(selector);
        if (el) {
          const text = (el.textContent || '').trim();
          if (text) return text;
        }
      } catch (err) {
        // Skip invalid selectors
      }
    }
    return null;
  }

  /**
   * Calculate text similarity (0-1)
   * @private
   */
  _calculateSimilarity(a, b) {
    if (!a || !b) return 0;
    
    const normalize = s => s.toLowerCase().trim().replace(/\s+/g, ' ');
    const normA = normalize(a);
    const normB = normalize(b);
    
    if (normA === normB) return 1;
    if (normA.includes(normB) || normB.includes(normA)) return 0.9;
    
    // Simple Jaccard-like similarity on words
    const wordsA = new Set(normA.split(' '));
    const wordsB = new Set(normB.split(' '));
    const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);
    
    return intersection.size / union.size;
  }

  /**
   * Calculate overall confidence from field confidences
   * @private
   */
  _calculateOverallConfidence(fieldConfidences) {
    // Weight title and content more heavily
    const weights = { title: 0.3, content: 0.4, date: 0.15, author: 0.15 };
    let weightedSum = 0;
    let totalWeight = 0;

    for (const [field, confidence] of Object.entries(fieldConfidences)) {
      const weight = weights[field] || 0.1;
      weightedSum += confidence * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  /**
   * Extract domain from URL
   * @private
   */
  _extractDomain(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname;
    } catch (err) {
      return 'unknown';
    }
  }
}

module.exports = { TemplateGenerator, TITLE_CANDIDATES, CONTENT_CANDIDATES, DATE_CANDIDATES, AUTHOR_CANDIDATES };
