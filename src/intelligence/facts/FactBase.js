'use strict';

/**
 * FactBase - Abstract base class for all Fact extractors
 * 
 * A Fact is an objective boolean observation about a URL or its content.
 * Facts answer "Does it have X?" - they are verifiable, reproducible, and store TRUE/FALSE.
 * 
 * Key Principles:
 * - Facts are OBJECTIVE: "URL contains /2024/01/15/" is a fact
 * - Facts are NEUTRAL: They observe structure without judging it as good/bad
 * - Classifications are SUBJECTIVE: "This is a news article" is a classification
 * - Facts have no weights - pure boolean
 * - Facts are computed once, stored in DB, reused across classification iterations
 * 
 * Categories:
 * - url: Facts from URL string only (cheapest)
 * - document: Facts from HTML/DOM (requires parsing)
 * - schema: Facts from JSON-LD/Microdata
 * - meta: Facts from <meta> tags
 * - response: Facts from HTTP response
 * - page: Facts about page structure
 * 
 * Lifecycle:
 * 1. extract(input) - Compute the fact for given input
 * 2. Store TRUE/FALSE in url_facts table
 * 3. Classification engine queries facts to make decisions
 * 
 * @example
 * class HasDateSegment extends UrlFact {
 *   constructor() {
 *     super({
 *       name: 'url.hasDateSegment',
 *       description: 'URL path contains a date pattern like /2024/01/15/',
 *       category: 'url'
 *     });
 *   }
 *   
 *   extract(input) {
 *     const url = this.normalizeUrl(input);
 *     const hasDate = /\/\d{4}\/\d{2}\/\d{2}\//.test(url.pathname);
 *     return this.createFact(hasDate, {
 *       pattern: hasDate ? url.pathname.match(/\/\d{4}\/\d{2}\/\d{2}\//)?.[0] : null
 *     });
 *   }
 * }
 */
class FactBase {
  /**
   * @param {Object} options - Fact configuration
   * @param {string} options.name - Unique fact identifier (e.g., 'url.hasDateSegment')
   * @param {string} options.description - Human-readable description
   * @param {string} options.category - Category: 'url', 'document', 'schema', 'meta', 'response', 'page'
   * @param {string[]} [options.requires] - Input requirements: ['url'], ['url', 'html'], etc.
   * @param {number} [options.version=1] - Fact version for schema evolution
   */
  constructor(options = {}) {
    if (new.target === FactBase) {
      throw new Error('FactBase is abstract and cannot be instantiated directly');
    }
    
    const { name, description, category, requires = ['url'], version = 1 } = options;
    
    if (!name) throw new Error('Fact must have a name');
    if (!description) throw new Error('Fact must have a description');
    if (!category) throw new Error('Fact must have a category');
    
    /** @type {string} Unique identifier (e.g., 'url.hasDateSegment') */
    this.name = name;
    
    /** @type {string} Human-readable description */
    this.description = description;
    
    /** @type {string} Fact category */
    this.category = category;
    
    /** @type {string[]} Required inputs */
    this.requires = requires;
    
    /** @type {number} Schema version */
    this.version = version;
  }
  
  /**
   * Extract the fact from input data
   * 
   * @abstract
   * @param {Object} input - Input data (varies by fact type)
   * @returns {FactResult} The extracted fact
   */
  extract(input) {
    throw new Error('Subclasses must implement extract()');
  }
  
  /**
   * Create a standardized fact result
   * 
   * @protected
   * @param {boolean} value - TRUE if the fact holds, FALSE otherwise
   * @param {Object} [evidence] - Supporting evidence/metadata
   * @returns {FactResult}
   */
  createFact(value, evidence = {}) {
    return {
      name: this.name,
      value: Boolean(value),
      evidence,
      extractedAt: new Date().toISOString(),
      version: this.version
    };
  }
  
  /**
   * Get metadata about this fact for registration
   * 
   * @returns {FactMetadata}
   */
  getMetadata() {
    return {
      name: this.name,
      description: this.description,
      category: this.category,
      requires: this.requires,
      version: this.version
    };
  }
  
  /**
   * Check if this fact can be extracted from the available input
   * 
   * @param {Object} availableData - Object with keys indicating available data types
   * @returns {boolean}
   */
  canExtract(availableData) {
    return this.requires.every(req => availableData[req] !== undefined);
  }
}

/**
 * @typedef {Object} FactResult
 * @property {string} name - Fact identifier
 * @property {boolean} value - TRUE or FALSE
 * @property {Object} evidence - Supporting evidence
 * @property {string} extractedAt - ISO timestamp
 * @property {number} version - Fact version
 */

/**
 * @typedef {Object} FactMetadata
 * @property {string} name - Fact identifier
 * @property {string} description - Human-readable description
 * @property {string} category - Fact category
 * @property {string[]} requires - Required inputs
 * @property {number} version - Schema version
 */

module.exports = { FactBase };
