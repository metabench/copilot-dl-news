/**
 * @fileoverview Object helper utilities for nullish coalescing and deep access.
 * @module utils/objectHelpers
 */

const { is_defined, tof } = require('lang-tools');

/**
 * Returns the first defined (non-null, non-undefined) value from arguments.
 * Replaces verbose ?? chains.
 * 
 * @param {...*} values - Values to check
 * @returns {*} - First defined value, or undefined if all are null/undefined
 * 
 * @example
 * const count = firstDefined(seeded.unique, seeded.requested, seeded.count);
 * // Instead of: seeded.unique ?? seeded.requested ?? seeded.count
 */
function firstDefined(...values) {
  for (const val of values) {
    if (val != null) return val;
  }
  return undefined;
}

/**
 * Extracts a numeric value from object properties with fallback chain.
 * 
 * @param {Object} obj - Object to search
 * @param {string|Array<string>} keys - Property name(s) to check
 * @param {number} [fallback=0] - Default value if no numeric property found
 * @returns {number} - First numeric value found, or fallback
 * 
 * @example
 * const processed = numberOr(progressInfo, ['processed', 'updated', 'analysed'], 0);
 * // Instead of: Number(progressInfo.processed ?? progressInfo.updated ?? progressInfo.analysed ?? 0)
 */
function numberOr(obj, keys, fallback = 0) {
  if (tof(keys) === 'string') keys = [keys];
  for (const key of keys) {
    const val = obj?.[key];
    if (val != null && tof(val) === 'number') return val;
  }
  return fallback;
}

/**
 * Extracts a string value from object properties with fallback chain.
 * 
 * @param {Object} obj - Object to search
 * @param {string|Array<string>} keys - Property name(s) to check
 * @param {string} [fallback=''] - Default value if no string property found
 * @returns {string} - First string value found, or fallback
 * 
 * @example
 * const name = stringOr(place, ['label', 'name', 'title'], 'Unknown');
 */
function stringOr(obj, keys, fallback = '') {
  if (tof(keys) === 'string') keys = [keys];
  for (const key of keys) {
    const val = obj?.[key];
    if (val != null && tof(val) === 'string' && val !== '') return val;
  }
  return fallback;
}

/**
 * Safely retrieves a deeply nested property using a path string or array.
 * 
 * @param {Object} obj - Object to traverse
 * @param {string|Array<string>} path - Dot-separated path or array of keys
 * @param {*} [fallback] - Value to return if path doesn't exist
 * @returns {*} - Value at path, or fallback
 * 
 * @example
 * const value = getDeep(data, 'user.profile.name', 'Anonymous');
 * // Instead of: data?.user?.profile?.name ?? 'Anonymous'
 */
function getDeep(obj, path, fallback) {
  if (obj == null) return fallback;
  
  const keys = tof(path) === 'string' ? path.split('.') : path;
  
  // Handle empty path
  if (!keys || keys.length === 0 || (keys.length === 1 && keys[0] === '')) {
    return obj;
  }
  
  let current = obj;
  
  for (const key of keys) {
    if (current == null) {
      return fallback;
    }
    
    // Handle arrays and objects
    const isArray = Array.isArray(current);
    const isObject = tof(current) === 'object';
    
    if (!isArray && !isObject) {
      return fallback;
    }
    
    // For arrays, convert string indices to numbers
    const actualKey = isArray ? parseInt(key, 10) : key;
    current = current[actualKey];
  }
  
  return current != null ? current : fallback;
}

module.exports = {
  firstDefined,
  numberOr,
  stringOr,
  getDeep
};
