'use strict';

/**
 * FactRegistry - Central registry for all Fact extractors
 * 
 * The registry serves several purposes:
 * 1. Discovers all available facts
 * 2. Groups facts by category and requirements
 * 3. Provides efficient lookup by name
 * 4. Validates fact definitions for DB sync
 * 
 * Facts are registered at module load time. The registry is a singleton.
 * 
 * @example
 * const registry = FactRegistry.getInstance();
 * 
 * // Get all URL facts (cheap to compute)
 * const urlFacts = registry.getByCategory('url');
 * 
 * // Get specific fact by name
 * const dateFact = registry.get('url.hasDateSegment');
 * 
 * // Get facts that can run with available data
 * const runnable = registry.getRunnableFacts({ url: 'https://...' });
 */
class FactRegistry {
  /** @type {FactRegistry|null} */
  static _instance = null;
  
  /**
   * Get singleton instance
   * @returns {FactRegistry}
   */
  static getInstance() {
    if (!FactRegistry._instance) {
      FactRegistry._instance = new FactRegistry();
      FactRegistry._instance._loadBuiltinFacts();
    }
    return FactRegistry._instance;
  }
  
  /**
   * Reset singleton (for testing)
   */
  static reset() {
    FactRegistry._instance = null;
  }
  
  constructor() {
    /** @type {Map<string, import('./FactBase').FactBase>} */
    this._facts = new Map();
    
    /** @type {Map<string, import('./FactBase').FactBase[]>} */
    this._byCategory = new Map();
  }
  
  /**
   * Register a fact instance
   * 
   * @param {import('./FactBase').FactBase} fact - Fact instance to register
   * @throws {Error} If fact with same name already registered
   */
  register(fact) {
    if (this._facts.has(fact.name)) {
      throw new Error(`Fact '${fact.name}' is already registered`);
    }
    
    this._facts.set(fact.name, fact);
    
    // Index by category
    if (!this._byCategory.has(fact.category)) {
      this._byCategory.set(fact.category, []);
    }
    this._byCategory.get(fact.category).push(fact);
  }
  
  /**
   * Get fact by name
   * 
   * @param {string} name - Fact name (e.g., 'url.hasDateSegment')
   * @returns {import('./FactBase').FactBase|undefined}
   */
  get(name) {
    return this._facts.get(name);
  }
  
  /**
   * Check if fact exists
   * 
   * @param {string} name - Fact name
   * @returns {boolean}
   */
  has(name) {
    return this._facts.has(name);
  }
  
  /**
   * Get all facts in a category
   * 
   * @param {string} category - Category name ('url', 'document', 'schema', etc.)
   * @returns {import('./FactBase').FactBase[]}
   */
  getByCategory(category) {
    return this._byCategory.get(category) || [];
  }
  
  /**
   * Get all registered facts
   * 
   * @returns {import('./FactBase').FactBase[]}
   */
  getAll() {
    return Array.from(this._facts.values());
  }
  
  /**
   * Get facts that can run with the available input data
   * 
   * @param {Object} availableData - Object with keys indicating what's available
   * @returns {import('./FactBase').FactBase[]}
   */
  getRunnableFacts(availableData) {
    return this.getAll().filter(fact => fact.canExtract(availableData));
  }
  
  /**
   * Get all fact metadata for DB synchronization
   * 
   * @returns {import('./FactBase').FactMetadata[]}
   */
  getAllMetadata() {
    return this.getAll().map(fact => fact.getMetadata());
  }
  
  /**
   * Get category names
   * 
   * @returns {string[]}
   */
  getCategories() {
    return Array.from(this._byCategory.keys());
  }
  
  /**
   * Get count of registered facts
   * 
   * @returns {number}
   */
  get size() {
    return this._facts.size;
  }
  
  /**
   * Load built-in facts from all fact modules
   * 
   * @private
   */
  _loadBuiltinFacts() {
    // URL facts
    const { createAllUrlFacts } = require('./url');
    for (const fact of createAllUrlFacts()) {
      this.register(fact);
    }
    
    // Document facts - TODO
    // Schema facts - TODO
    // Meta facts - TODO
    // Response facts - TODO
    // Page facts - TODO
  }
}

module.exports = { FactRegistry };
