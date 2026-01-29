'use strict';

const { BooleanClassifierBase } = require('./BooleanClassifierBase');

/**
 * Base class for HTML/DOM-based boolean classifiers.
 * 
 * HTML classifiers require a parsed DOM (Cheerio $ object) and optionally raw HTML.
 * They are more expensive to run than URL classifiers and should be batched when possible.
 * 
 * Input shape: { $: CheerioAPI, html?: string }
 * 
 * @extends BooleanClassifierBase
 */
class HtmlClassifier extends BooleanClassifierBase {
  /**
   * @param {Object} options - Options passed to BooleanClassifierBase
   */
  constructor(options = {}) {
    super({
      ...options,
      category: 'content'
    });
    
    /** @type {'expensive'} */
    this.cost = 'expensive';
  }

  /**
   * Validate the HTML input.
   * 
   * @protected
   * @param {Object} input
   * @param {CheerioAPI} input.$ - Cheerio instance
   * @param {string} [input.html] - Raw HTML string
   * @returns {{ $: CheerioAPI, html: string } | null}
   */
  parseInput(input) {
    if (!input || typeof input.$ !== 'function') {
      return null;
    }

    return {
      $: input.$,
      html: input.html || ''
    };
  }

  /**
   * Count elements matching a selector.
   * 
   * @protected
   * @param {CheerioAPI} $ - Cheerio instance
   * @param {string} selector - CSS selector
   * @returns {number}
   */
  countElements($, selector) {
    try {
      return $(selector).length;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Check if an element exists.
   * 
   * @protected
   * @param {CheerioAPI} $ - Cheerio instance
   * @param {string} selector - CSS selector
   * @returns {boolean}
   */
  hasElement($, selector) {
    return this.countElements($, selector) > 0;
  }

  /**
   * Get text content from an element.
   * 
   * @protected
   * @param {CheerioAPI} $ - Cheerio instance
   * @param {string} selector - CSS selector
   * @returns {string}
   */
  getText($, selector) {
    try {
      return $(selector).text().trim();
    } catch (error) {
      return '';
    }
  }

  /**
   * Get an attribute value from the first matching element.
   * 
   * @protected
   * @param {CheerioAPI} $ - Cheerio instance
   * @param {string} selector - CSS selector
   * @param {string} attr - Attribute name
   * @returns {string | null}
   */
  getAttr($, selector, attr) {
    try {
      const value = $(selector).first().attr(attr);
      return value || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get meta tag content by name or property.
   * 
   * @protected
   * @param {CheerioAPI} $ - Cheerio instance
   * @param {string} nameOrProperty - Meta name or property value
   * @returns {string | null}
   */
  getMetaContent($, nameOrProperty) {
    const byName = this.getAttr($, `meta[name="${nameOrProperty}"]`, 'content');
    if (byName) return byName;
    
    const byProperty = this.getAttr($, `meta[property="${nameOrProperty}"]`, 'content');
    return byProperty;
  }

  /**
   * Calculate text density (text length / total content length).
   * 
   * @protected
   * @param {CheerioAPI} $ - Cheerio instance
   * @param {string} [selector='body'] - Container selector
   * @returns {number} - Ratio between 0 and 1
   */
  getTextDensity($, selector = 'body') {
    try {
      const container = $(selector);
      const text = container.text().replace(/\s+/g, ' ').trim();
      const html = container.html() || '';
      
      if (html.length === 0) return 0;
      return Math.min(1, text.length / html.length);
    } catch (error) {
      return 0;
    }
  }
}

module.exports = { HtmlClassifier };
