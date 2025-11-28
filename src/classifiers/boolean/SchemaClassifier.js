'use strict';

const { BooleanClassifierBase } = require('./BooleanClassifierBase');

/**
 * Base class for Schema.org/structured data boolean classifiers.
 * 
 * Schema classifiers operate on extracted structured data (JSON-LD, Microdata, RDFa).
 * They expect pre-parsed schema objects, not raw HTML.
 * 
 * Input shape: { schema: object } or { schema: object[] }
 * 
 * @extends BooleanClassifierBase
 */
class SchemaClassifier extends BooleanClassifierBase {
  /**
   * @param {Object} options - Options passed to BooleanClassifierBase
   */
  constructor(options = {}) {
    super({
      ...options,
      category: 'schema'
    });
    
    /** @type {'cheap'} */
    this.cost = 'cheap';
  }

  /**
   * Normalize schema input to an array of schema objects.
   * 
   * @protected
   * @param {Object} input
   * @param {Object|Object[]} input.schema - Schema object(s)
   * @returns {{ schemas: Object[] } | null}
   */
  parseInput(input) {
    if (!input || !input.schema) {
      return null;
    }

    const schemas = Array.isArray(input.schema) ? input.schema : [input.schema];
    const validSchemas = schemas.filter(s => s && typeof s === 'object');
    
    if (validSchemas.length === 0) {
      return null;
    }

    return { schemas: validSchemas };
  }

  /**
   * Get the @type value(s) from a schema object.
   * 
   * @protected
   * @param {Object} schema - Schema object
   * @returns {string[]}
   */
  getTypes(schema) {
    if (!schema) return [];
    
    const type = schema['@type'] || schema.type;
    if (!type) return [];
    
    return Array.isArray(type) ? type : [type];
  }

  /**
   * Check if schema has a specific type.
   * 
   * @protected
   * @param {Object} schema - Schema object
   * @param {string|string[]} targetTypes - Type(s) to check for
   * @returns {boolean}
   */
  hasType(schema, targetTypes) {
    const types = this.getTypes(schema);
    const targets = Array.isArray(targetTypes) ? targetTypes : [targetTypes];
    
    return types.some(t => 
      targets.some(target => 
        t.toLowerCase() === target.toLowerCase() ||
        t.toLowerCase().endsWith('/' + target.toLowerCase())
      )
    );
  }

  /**
   * Check if schema has a specific property.
   * 
   * @protected
   * @param {Object} schema - Schema object
   * @param {string} property - Property name
   * @returns {boolean}
   */
  hasProperty(schema, property) {
    if (!schema || typeof schema !== 'object') return false;
    return property in schema && schema[property] != null;
  }

  /**
   * Get a property value from schema.
   * 
   * @protected
   * @param {Object} schema - Schema object
   * @param {string} property - Property name
   * @returns {any}
   */
  getProperty(schema, property) {
    if (!schema || typeof schema !== 'object') return null;
    return schema[property] ?? null;
  }

  /**
   * Find schema objects matching a type across all schemas.
   * 
   * @protected
   * @param {Object[]} schemas - Array of schema objects
   * @param {string|string[]} targetTypes - Type(s) to find
   * @returns {Object[]}
   */
  findByType(schemas, targetTypes) {
    const results = [];
    
    const search = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      
      if (this.hasType(obj, targetTypes)) {
        results.push(obj);
      }
      
      // Search nested objects
      for (const value of Object.values(obj)) {
        if (Array.isArray(value)) {
          value.forEach(search);
        } else if (value && typeof value === 'object') {
          search(value);
        }
      }
    };
    
    schemas.forEach(search);
    return results;
  }

  /**
   * Article types recognized by Schema.org.
   * @type {string[]}
   */
  static ARTICLE_TYPES = [
    'Article',
    'NewsArticle',
    'BlogPosting',
    'TechArticle',
    'ScholarlyArticle',
    'SocialMediaPosting',
    'Report',
    'AnalysisNewsArticle',
    'AskPublicNewsArticle',
    'BackgroundNewsArticle',
    'OpinionNewsArticle',
    'ReportageNewsArticle',
    'ReviewNewsArticle'
  ];
}

module.exports = { SchemaClassifier };
