/**
 * @fileoverview Schema-driven options builder for configuration validation.
 * Eliminates repetitive typeof guards in constructors.
 * @module utils/optionsBuilder
 */

const { tof, is_defined } = require('lang-tools');

/**
 * Builds an options object from input using a schema definition.
 * Each schema property specifies type and default value (static or function).
 * 
 * @param {Object} input - Raw input options object
 * @param {Object} schema - Schema defining expected options
 * @returns {Object} - Validated options object
 * 
 * @example
 * const schema = {
 *   rateLimitMs: { type: 'number', default: (opts) => opts.slowMode ? 1000 : 0 },
 *   maxConcurrency: { type: 'number', default: 5 },
 *   debug: { type: 'boolean', default: false }
 * };
 * 
 * const options = buildOptions(userInput, schema);
 * // Replaces 35 lines of:
 * // this.rateLimitMs = typeof options.rateLimitMs === 'number' 
 * //   ? options.rateLimitMs 
 * //   : (this.slowMode ? 1000 : 0);
 */
function buildOptions(input, schema) {
  const result = {};
  
  for (const [key, spec] of Object.entries(schema)) {
    const value = input[key];
    
    // Handle array type specially (tof returns 'array' for arrays)
    if (spec.type === 'array') {
      if (value != null && tof(value) === 'array') {
        result[key] = spec.processor ? spec.processor(value) : value;
      } else if (tof(spec.default) === 'function') {
        result[key] = spec.default(input);
      } else {
        result[key] = spec.default;
      }
      continue;
    }
    
    // Use provided value if it matches expected type and is not null/undefined
    if (value != null && tof(value) === spec.type) {
      // Apply validator if provided
      if (spec.validator && !spec.validator(value)) {
        // Fall through to default if validation fails
        if (tof(spec.default) === 'function') {
          result[key] = spec.default(input);
        } else {
          result[key] = spec.default;
        }
      } else {
        // Apply processor if provided
        result[key] = spec.processor ? spec.processor(value) : value;
      }
    } 
    // Otherwise use default (function or static value)
    else if (tof(spec.default) === 'function') {
      result[key] = spec.default(input);
    } 
    else {
      result[key] = spec.default;
    }
  }
  
  return result;
}

/**
 * Creates a schema validator that throws on invalid values.
 * Useful for strict configuration validation.
 * 
 * @param {Object} input - Raw input options object
 * @param {Object} schema - Schema with type and required flags
 * @param {string} [context='options'] - Context name for error messages
 * @returns {Object} - Validated options object
 * @throws {TypeError} - If required option is missing or has wrong type
 * 
 * @example
 * const schema = {
 *   port: { type: 'number', required: true },
 *   host: { type: 'string', default: 'localhost' }
 * };
 * 
 * const config = buildOptionsStrict(input, schema, 'server config');
 */
function buildOptionsStrict(input, schema, context = 'options') {
  const result = {};
  
  for (const [key, spec] of Object.entries(schema)) {
    const value = input[key];
    
    // Check if required
    if (spec.required && value == null) {
      throw new TypeError(`${context}: missing required option '${key}'`);
    }
    
    // Validate type if value provided (not null/undefined)
    if (value != null) {
      if (tof(value) !== spec.type) {
        throw new TypeError(
          `${context}: option '${key}' must be ${spec.type}, got ${tof(value)}`
        );
      }
      result[key] = value;
    }
    // Use default if not required
    else if (!spec.required) {
      if (tof(spec.default) === 'function') {
        result[key] = spec.default(input);
      } else {
        result[key] = spec.default;
      }
    }
  }
  
  return result;
}

module.exports = {
  buildOptions,
  buildOptionsStrict
};
