'use strict';

/**
 * OperationSchemaRegistry - Central registry for crawl operation schemas.
 * 
 * Provides:
 * - Schema lookup by operation name
 * - Schema validation for option values
 * - Listing all available schemas
 * - Category filtering
 */

const basicArticleCrawlSchema = require('./basicArticleCrawl.schema');
const siteExplorerSchema = require('./siteExplorer.schema');
const ensureCountryHubsSchema = require('./ensureCountryHubs.schema');
const exploreCountryHubsSchema = require('./exploreCountryHubs.schema');
const guessPlaceHubsSchema = require('./guessPlaceHubs.schema');
const findTopicHubsSchema = require('./findTopicHubs.schema');
const findPlaceAndTopicHubsSchema = require('./findPlaceAndTopicHubs.schema');
const crawlCountryHubHistorySchema = require('./crawlCountryHubHistory.schema');
const crawlCountryHubsHistorySchema = require('./crawlCountryHubsHistory.schema');
const sitemapDiscoverySchema = require('./sitemapDiscovery.schema');
const sitemapOnlySchema = require('./sitemapOnly.schema');

/**
 * Map of operation name → schema definition
 */
const schemas = new Map([
  ['basicArticleCrawl', basicArticleCrawlSchema],
  ['siteExplorer', siteExplorerSchema],
  ['ensureCountryHubs', ensureCountryHubsSchema],
  ['exploreCountryHubs', exploreCountryHubsSchema],
  ['guessPlaceHubs', guessPlaceHubsSchema],
  ['findTopicHubs', findTopicHubsSchema],
  ['findPlaceAndTopicHubs', findPlaceAndTopicHubsSchema],
  ['crawlCountryHubHistory', crawlCountryHubHistorySchema],
  ['crawlCountryHubsHistory', crawlCountryHubsHistorySchema],
  ['sitemapDiscovery', sitemapDiscoverySchema],
  ['sitemapOnly', sitemapOnlySchema]
]);

/**
 * Category metadata for grouping operations in UI
 */
const categories = {
  'article-crawl': {
    label: 'Article Crawling',
    description: 'General purpose content collection',
    icon: '📰',
    order: 1
  },
  'discovery': {
    label: 'Site Discovery',
    description: 'Explore and map website structure',
    icon: '🗺️',
    order: 2
  },
  'hub-management': {
    label: 'Hub Management',
    description: 'Verify and explore known hub pages',
    icon: '🌍',
    order: 3
  },
  'hub-discovery': {
    label: 'Hub Discovery',
    description: 'Find new place and topic hubs',
    icon: '🎯',
    order: 4
  },
  'content-refresh': {
    label: 'Content Refresh',
    description: 'Update historical content',
    icon: '📜',
    order: 5
  }
};

/**
 * Validate a single option value against its schema definition.
 * 
 * @param {Object} optionSchema - The option's schema definition
 * @param {*} value - The value to validate
 * @returns {{ valid: boolean, error?: string }}
 */
function validateOptionValue(optionSchema, value) {
  if (value === undefined || value === null) {
    // Undefined/null is okay - will use default
    return { valid: true };
  }

  switch (optionSchema.type) {
    case 'number': {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        return { valid: false, error: 'Must be a number' };
      }
      if (optionSchema.min !== undefined && value < optionSchema.min) {
        return { valid: false, error: `Must be at least ${optionSchema.min}` };
      }
      if (optionSchema.max !== undefined && value > optionSchema.max) {
        return { valid: false, error: `Must be at most ${optionSchema.max}` };
      }
      return { valid: true };
    }

    case 'boolean': {
      if (typeof value !== 'boolean') {
        return { valid: false, error: 'Must be true or false' };
      }
      return { valid: true };
    }

    case 'enum': {
      const validValues = optionSchema.options.map(o => o.value);
      if (!validValues.includes(value)) {
        return { valid: false, error: `Must be one of: ${validValues.join(', ')}` };
      }
      return { valid: true };
    }

    case 'string': {
      if (typeof value !== 'string') {
        return { valid: false, error: 'Must be a string' };
      }
      if (optionSchema.minLength && value.length < optionSchema.minLength) {
        return { valid: false, error: `Must be at least ${optionSchema.minLength} characters` };
      }
      if (optionSchema.maxLength && value.length > optionSchema.maxLength) {
        return { valid: false, error: `Must be at most ${optionSchema.maxLength} characters` };
      }
      return { valid: true };
    }

    case 'array': {
      if (!Array.isArray(value)) {
        return { valid: false, error: 'Must be an array' };
      }
      // Validate each item if itemType is enum
      if (optionSchema.itemType === 'enum') {
        const validValues = optionSchema.options.map(o => o.value);
        for (const item of value) {
          if (!validValues.includes(item)) {
            return { valid: false, error: `Array items must be one of: ${validValues.join(', ')}` };
          }
        }
      }
      return { valid: true };
    }

    default:
      return { valid: true };
  }
}

/**
 * OperationSchemaRegistry API
 */
const OperationSchemaRegistry = {
  /**
   * Get schema for a specific operation.
   * @param {string} operationName 
   * @returns {Object|null}
   */
  getSchema(operationName) {
    return schemas.get(operationName) || null;
  },

  /**
   * Check if an operation has a schema.
   * @param {string} operationName 
   * @returns {boolean}
   */
  hasSchema(operationName) {
    return schemas.has(operationName);
  },

  /**
   * List all available schemas.
   * @returns {Object[]} Array of schema summaries
   */
  listSchemas() {
    return Array.from(schemas.values()).map(schema => ({
      operation: schema.operation,
      label: schema.label,
      description: schema.description,
      category: schema.category,
      icon: schema.icon
    }));
  },

  /**
   * List schemas grouped by category.
   * @returns {Object} Map of category → schemas
   */
  listByCategory() {
    const result = {};
    
    // Initialize categories in order
    for (const [key, meta] of Object.entries(categories)) {
      result[key] = {
        ...meta,
        operations: []
      };
    }

    // Populate with schemas
    for (const schema of schemas.values()) {
      const cat = schema.category || 'other';
      if (!result[cat]) {
        result[cat] = {
          label: cat,
          description: '',
          icon: '❓',
          order: 99,
          operations: []
        };
      }
      result[cat].operations.push({
        operation: schema.operation,
        label: schema.label,
        description: schema.description,
        icon: schema.icon
      });
    }

    return result;
  },

  /**
   * Get all operation names.
   * @returns {string[]}
   */
  getOperationNames() {
    return Array.from(schemas.keys());
  },

  /**
   * Get category metadata.
   * @param {string} categoryKey 
   * @returns {Object|null}
   */
  getCategory(categoryKey) {
    return categories[categoryKey] || null;
  },

  /**
   * Get all categories.
   * @returns {Object}
   */
  getCategories() {
    return { ...categories };
  },

  /**
   * Validate options for an operation.
   * @param {string} operationName 
   * @param {Object} options - Options to validate
   * @returns {{ valid: boolean, errors: Object }}
   */
  validateOptions(operationName, options = {}) {
    const schema = schemas.get(operationName);
    if (!schema) {
      return { valid: false, errors: { _operation: 'Unknown operation' } };
    }

    const errors = {};
    let valid = true;

    for (const [optionName, optionSchema] of Object.entries(schema.options)) {
      const value = options[optionName];
      const result = validateOptionValue(optionSchema, value);
      if (!result.valid) {
        errors[optionName] = result.error;
        valid = false;
      }
    }

    // Check for unknown options (warning, not error)
    const warnings = {};
    for (const key of Object.keys(options)) {
      if (!schema.options[key]) {
        warnings[key] = 'Unknown option (will be passed through)';
      }
    }

    return { valid, errors, warnings };
  },

  /**
   * Get default values for an operation.
   * @param {string} operationName 
   * @returns {Object} Map of option name → default value
   */
  getDefaults(operationName) {
    const schema = schemas.get(operationName);
    if (!schema) return {};

    const defaults = {};
    for (const [optionName, optionSchema] of Object.entries(schema.options)) {
      if (optionSchema.default !== undefined) {
        defaults[optionName] = optionSchema.default;
      }
    }
    return defaults;
  },

  /**
   * Get options grouped by category for UI rendering.
   * @param {string} operationName 
   * @returns {Object} Map of category → options
   */
  getOptionsByCategory(operationName) {
    const schema = schemas.get(operationName);
    if (!schema) return {};

    const result = {};
    for (const [optionName, optionSchema] of Object.entries(schema.options)) {
      const cat = optionSchema.category || 'other';
      if (!result[cat]) {
        result[cat] = [];
      }
      result[cat].push({
        name: optionName,
        ...optionSchema
      });
    }
    return result;
  },

  /**
   * Get non-advanced options only (for simple UI view).
   * @param {string} operationName 
   * @returns {Object} Filtered options schema
   */
  getBasicOptions(operationName) {
    const schema = schemas.get(operationName);
    if (!schema) return {};

    const result = {};
    for (const [optionName, optionSchema] of Object.entries(schema.options)) {
      if (!optionSchema.advanced) {
        result[optionName] = optionSchema;
      }
    }
    return result;
  }
};

module.exports = {
  OperationSchemaRegistry,
  validateOptionValue,
  categories
};
