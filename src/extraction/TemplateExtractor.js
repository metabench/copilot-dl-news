'use strict';

const { JSDOM } = require('jsdom');
const { countWords } = require('../utils/textMetrics');

/**
 * Template Extractor - CSS Selector-based Content Extraction
 * 
 * Uses learned CSS selectors from layout_templates.extraction_config_json
 * to extract article content faster than Readability by targeting known
 * element positions directly.
 * 
 * Extraction Config JSON Schema:
 * {
 *   "version": 1,
 *   "titleSelector": "h1.article-headline",
 *   "titleFallback": ["h1", ".headline", "article h1"],
 *   "bodySelector": "article.content",
 *   "bodyFallback": [".article-body", ".post-content", "main article"],
 *   "dateSelector": "time[datetime]",
 *   "dateFallback": [".publish-date", ".article-date", "meta[property='article:published_time']"],
 *   "dateAttribute": "datetime",
 *   "authorSelector": ".byline a",
 *   "authorFallback": [".author", "[rel='author']", "meta[name='author']"],
 *   "excludeSelectors": [".ad", ".newsletter-signup", ".related-articles"],
 *   "confidence": 0.85,
 *   "trainedAt": "2025-12-26T10:00:00Z",
 *   "trainedFrom": "https://example.com/article/123"
 * }
 * 
 * @module extraction/TemplateExtractor
 */

/**
 * Default extraction config schema version
 */
const SCHEMA_VERSION = 1;

/**
 * Template Extractor class
 */
class TemplateExtractor {
  /**
   * @param {Object} [options]
   * @param {Object} [options.logger] - Logger instance (defaults to console)
   * @param {number} [options.minWordCount=50] - Minimum words for valid extraction
   */
  constructor(options = {}) {
    this.logger = options.logger ?? console;
    this.minWordCount = options.minWordCount ?? 50;
  }

  /**
   * Extract content using a template config
   * 
   * @param {string} html - Raw HTML content
   * @param {Object|string} config - Extraction config object or JSON string
   * @param {Object} [options]
   * @param {string} [options.url] - Source URL for context
   * @returns {ExtractionResult}
   */
  extract(html, config, options = {}) {
    const startTime = Date.now();
    
    if (!html || typeof html !== 'string') {
      return this._errorResult('Invalid HTML input');
    }

    // Parse config if string
    let cfg;
    try {
      cfg = typeof config === 'string' ? JSON.parse(config) : config;
    } catch (err) {
      return this._errorResult(`Invalid config JSON: ${err.message}`);
    }

    if (!cfg || typeof cfg !== 'object') {
      return this._errorResult('Config must be an object');
    }

    try {
      const dom = new JSDOM(html, {
        url: options.url ?? 'https://example.com'
      });
      const document = dom.window.document;

      // Remove excluded elements first
      if (cfg.excludeSelectors && Array.isArray(cfg.excludeSelectors)) {
        this._removeElements(document, cfg.excludeSelectors);
      }

      // Extract each field
      const title = this._extractField(document, cfg.titleSelector, cfg.titleFallback, 'textContent');
      const body = this._extractBody(document, cfg.bodySelector, cfg.bodyFallback);
      const date = this._extractDate(document, cfg.dateSelector, cfg.dateFallback, cfg.dateAttribute);
      const author = this._extractField(document, cfg.authorSelector, cfg.authorFallback, 'textContent');

      // Validate extraction
      const wordCount = countWords(body.text);
      const success = wordCount >= this.minWordCount && title.found;

      return {
        success,
        method: 'template',
        templateVersion: cfg.version ?? SCHEMA_VERSION,
        title: title.value,
        text: body.text,
        html: body.html,
        wordCount,
        publicationDate: date.value,
        author: author.value,
        extractionTimeMs: Date.now() - startTime,
        confidence: cfg.confidence ?? 0.5,
        selectors: {
          title: title.usedSelector,
          body: body.usedSelector,
          date: date.usedSelector,
          author: author.usedSelector
        },
        fallbacksUsed: {
          title: title.usedFallback,
          body: body.usedFallback,
          date: date.usedFallback,
          author: author.usedFallback
        },
        error: success ? null : `Extraction incomplete: ${wordCount} words, title=${!!title.value}`
      };
    } catch (err) {
      return this._errorResult(`Extraction failed: ${err.message}`);
    }
  }

  /**
   * Validate an extraction config
   * 
   * @param {Object|string} config - Config to validate
   * @returns {{valid: boolean, errors: string[], warnings: string[]}}
   */
  validateConfig(config) {
    const errors = [];
    const warnings = [];

    let cfg;
    try {
      cfg = typeof config === 'string' ? JSON.parse(config) : config;
    } catch (err) {
      return { valid: false, errors: [`Invalid JSON: ${err.message}`], warnings: [] };
    }

    if (!cfg || typeof cfg !== 'object') {
      return { valid: false, errors: ['Config must be an object'], warnings: [] };
    }

    // Required fields check
    if (!cfg.titleSelector && (!cfg.titleFallback || cfg.titleFallback.length === 0)) {
      errors.push('At least titleSelector or titleFallback is required');
    }

    if (!cfg.bodySelector && (!cfg.bodyFallback || cfg.bodyFallback.length === 0)) {
      errors.push('At least bodySelector or bodyFallback is required');
    }

    // Optional field warnings
    if (!cfg.dateSelector && (!cfg.dateFallback || cfg.dateFallback.length === 0)) {
      warnings.push('No date selectors defined - date extraction will fail');
    }

    if (!cfg.authorSelector && (!cfg.authorFallback || cfg.authorFallback.length === 0)) {
      warnings.push('No author selectors defined - author extraction will fail');
    }

    // Selector syntax validation
    const selectorFields = ['titleSelector', 'bodySelector', 'dateSelector', 'authorSelector'];
    for (const field of selectorFields) {
      if (cfg[field]) {
        const err = this._validateSelector(cfg[field]);
        if (err) errors.push(`${field}: ${err}`);
      }
    }

    // Fallback array validation
    const fallbackFields = ['titleFallback', 'bodyFallback', 'dateFallback', 'authorFallback', 'excludeSelectors'];
    for (const field of fallbackFields) {
      if (cfg[field]) {
        if (!Array.isArray(cfg[field])) {
          errors.push(`${field} must be an array`);
        } else {
          for (let i = 0; i < cfg[field].length; i++) {
            const err = this._validateSelector(cfg[field][i]);
            if (err) errors.push(`${field}[${i}]: ${err}`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Create a new extraction config from observed selectors
   * 
   * @param {Object} selectors - Observed working selectors
   * @param {Object} [options]
   * @returns {Object} New extraction config
   */
  createConfig(selectors, options = {}) {
    return {
      version: SCHEMA_VERSION,
      titleSelector: selectors.title ?? null,
      titleFallback: selectors.titleFallback ?? ['h1', '.headline', 'article h1', '.article-title'],
      bodySelector: selectors.body ?? null,
      bodyFallback: selectors.bodyFallback ?? ['article', '.article-body', '.post-content', 'main'],
      dateSelector: selectors.date ?? null,
      dateFallback: selectors.dateFallback ?? ['time[datetime]', '.publish-date', 'meta[property="article:published_time"]'],
      dateAttribute: selectors.dateAttribute ?? 'datetime',
      authorSelector: selectors.author ?? null,
      authorFallback: selectors.authorFallback ?? ['.byline', '.author', '[rel="author"]'],
      excludeSelectors: selectors.exclude ?? ['.ad', '.advertisement', '.newsletter-signup', '.related-articles', '.social-share', 'nav', 'header', 'footer'],
      confidence: options.confidence ?? 0.7,
      trainedAt: new Date().toISOString(),
      trainedFrom: options.url ?? null
    };
  }

  /**
   * Merge an existing config with new observations
   * 
   * @param {Object} existingConfig - Current config
   * @param {Object} newSelectors - Newly observed selectors
   * @returns {Object} Merged config
   */
  mergeConfig(existingConfig, newSelectors) {
    const merged = { ...existingConfig };
    
    // Update selectors if new ones work better
    if (newSelectors.title) {
      merged.titleSelector = newSelectors.title;
    }
    if (newSelectors.body) {
      merged.bodySelector = newSelectors.body;
    }
    if (newSelectors.date) {
      merged.dateSelector = newSelectors.date;
    }
    if (newSelectors.author) {
      merged.authorSelector = newSelectors.author;
    }
    
    // Update metadata
    merged.trainedAt = new Date().toISOString();
    if (newSelectors.confidence) {
      // Weighted average with new confidence
      merged.confidence = (merged.confidence * 0.6) + (newSelectors.confidence * 0.4);
    }
    
    return merged;
  }

  // ───────────────────────────────────────────────────────────────
  // Private helpers
  // ───────────────────────────────────────────────────────────────

  /**
   * Extract a single field using selector with fallbacks
   * @private
   */
  _extractField(document, primarySelector, fallbackSelectors, attribute = 'textContent') {
    // Try primary selector first
    if (primarySelector) {
      const el = this._safeQuerySelector(document, primarySelector);
      if (el) {
        const value = this._getAttributeOrContent(el, attribute);
        if (value) {
          return { found: true, value: value.trim(), usedSelector: primarySelector, usedFallback: false };
        }
      }
    }

    // Try fallbacks
    if (fallbackSelectors && Array.isArray(fallbackSelectors)) {
      for (const selector of fallbackSelectors) {
        const el = this._safeQuerySelector(document, selector);
        if (el) {
          const value = this._getAttributeOrContent(el, attribute);
          if (value) {
            return { found: true, value: value.trim(), usedSelector: selector, usedFallback: true };
          }
        }
      }
    }

    return { found: false, value: null, usedSelector: null, usedFallback: false };
  }

  /**
   * Extract body content (returns both text and HTML)
   * @private
   */
  _extractBody(document, primarySelector, fallbackSelectors) {
    // Try primary selector first
    if (primarySelector) {
      const el = this._safeQuerySelector(document, primarySelector);
      if (el) {
        const text = this._getCleanText(el);
        if (text && countWords(text) >= 20) {
          return { 
            found: true, 
            text, 
            html: el.innerHTML, 
            usedSelector: primarySelector, 
            usedFallback: false 
          };
        }
      }
    }

    // Try fallbacks
    if (fallbackSelectors && Array.isArray(fallbackSelectors)) {
      for (const selector of fallbackSelectors) {
        const el = this._safeQuerySelector(document, selector);
        if (el) {
          const text = this._getCleanText(el);
          if (text && countWords(text) >= 20) {
            return { 
              found: true, 
              text, 
              html: el.innerHTML, 
              usedSelector: selector, 
              usedFallback: true 
            };
          }
        }
      }
    }

    return { found: false, text: '', html: '', usedSelector: null, usedFallback: false };
  }

  /**
   * Extract date with special handling for datetime attribute and meta tags
   * @private
   */
  _extractDate(document, primarySelector, fallbackSelectors, dateAttribute = 'datetime') {
    // Try primary selector
    if (primarySelector) {
      const el = this._safeQuerySelector(document, primarySelector);
      if (el) {
        const value = this._parseDateFromElement(el, dateAttribute);
        if (value) {
          return { found: true, value, usedSelector: primarySelector, usedFallback: false };
        }
      }
    }

    // Try fallbacks
    if (fallbackSelectors && Array.isArray(fallbackSelectors)) {
      for (const selector of fallbackSelectors) {
        const el = this._safeQuerySelector(document, selector);
        if (el) {
          const value = this._parseDateFromElement(el, dateAttribute);
          if (value) {
            return { found: true, value, usedSelector: selector, usedFallback: true };
          }
        }
      }
    }

    return { found: false, value: null, usedSelector: null, usedFallback: false };
  }

  /**
   * Parse date from element (handles meta tags, time elements, and text content)
   * @private
   */
  _parseDateFromElement(el, preferredAttribute) {
    // Try datetime attribute first
    if (el.hasAttribute && el.hasAttribute('datetime')) {
      const datetime = el.getAttribute('datetime');
      if (datetime) {
        try {
          const date = new Date(datetime);
          if (!isNaN(date.getTime())) return date.toISOString();
        } catch (e) { /* continue */ }
      }
    }

    // Try preferred attribute (for meta tags)
    if (preferredAttribute && el.hasAttribute && el.hasAttribute(preferredAttribute)) {
      const value = el.getAttribute(preferredAttribute);
      if (value) {
        try {
          const date = new Date(value);
          if (!isNaN(date.getTime())) return date.toISOString();
        } catch (e) { /* continue */ }
      }
    }

    // Try content attribute (for meta tags)
    if (el.hasAttribute && el.hasAttribute('content')) {
      const content = el.getAttribute('content');
      if (content) {
        try {
          const date = new Date(content);
          if (!isNaN(date.getTime())) return date.toISOString();
        } catch (e) { /* continue */ }
      }
    }

    // Try text content
    const text = el.textContent?.trim();
    if (text) {
      try {
        const date = new Date(text);
        if (!isNaN(date.getTime())) return date.toISOString();
      } catch (e) { /* continue */ }
    }

    return null;
  }

  /**
   * Safe querySelector that catches selector syntax errors
   * @private
   */
  _safeQuerySelector(document, selector) {
    try {
      return document.querySelector(selector);
    } catch (err) {
      this.logger.warn(`Invalid selector "${selector}": ${err.message}`);
      return null;
    }
  }

  /**
   * Get attribute value or text content
   * @private
   */
  _getAttributeOrContent(el, attribute) {
    if (attribute === 'textContent') {
      return el.textContent?.trim() ?? null;
    }
    if (el.hasAttribute && el.hasAttribute(attribute)) {
      return el.getAttribute(attribute);
    }
    return el.textContent?.trim() ?? null;
  }

  /**
   * Get clean text from element (removes extra whitespace)
   * @private
   */
  _getCleanText(el) {
    const text = el.textContent ?? '';
    return text.replace(/\s+/g, ' ').trim();
  }

  /**
   * Remove elements matching selectors
   * @private
   */
  _removeElements(document, selectors) {
    for (const selector of selectors) {
      try {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => el.remove());
      } catch (err) {
        // Skip invalid selectors
      }
    }
  }

  /**
   * Validate a CSS selector string
   * @private
   */
  _validateSelector(selector) {
    if (typeof selector !== 'string') {
      return 'Selector must be a string';
    }
    if (!selector.trim()) {
      return 'Selector cannot be empty';
    }
    // Basic syntax check - try to use it
    try {
      // Create a minimal document to test the selector
      const dom = new JSDOM('<html><body></body></html>');
      dom.window.document.querySelector(selector);
      return null; // Valid
    } catch (err) {
      return `Invalid CSS selector: ${err.message}`;
    }
  }

  /**
   * Create error result
   * @private
   */
  _errorResult(message) {
    return {
      success: false,
      method: 'template',
      templateVersion: SCHEMA_VERSION,
      title: null,
      text: '',
      html: '',
      wordCount: 0,
      publicationDate: null,
      author: null,
      extractionTimeMs: 0,
      confidence: 0,
      selectors: {},
      fallbacksUsed: {},
      error: message
    };
  }
}

/**
 * @typedef {Object} ExtractionResult
 * @property {boolean} success - Whether extraction met minimum requirements
 * @property {string} method - Always 'template' for this extractor
 * @property {number} templateVersion - Config schema version used
 * @property {string|null} title - Extracted title
 * @property {string} text - Extracted body text
 * @property {string} html - Extracted body HTML
 * @property {number} wordCount - Word count of body text
 * @property {string|null} publicationDate - ISO date string or null
 * @property {string|null} author - Extracted author or null
 * @property {number} extractionTimeMs - Extraction time in milliseconds
 * @property {number} confidence - Config confidence score
 * @property {Object} selectors - Which selectors were actually used
 * @property {Object} fallbacksUsed - Whether fallback selectors were used
 * @property {string|null} error - Error message if extraction failed
 */

module.exports = { TemplateExtractor, SCHEMA_VERSION };
