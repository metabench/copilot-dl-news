/**
 * @fileoverview Data transformation pipeline utilities using lang-tools patterns.
 * Provides single-pass alternatives to verbose .map().filter() chains.
 * @module utils/pipelines
 */

const { each, is_defined } = require('lang-tools');

/**
 * Maps array elements through a function and filters out falsy values in a single pass.
 * More efficient than chaining .map().filter() for large arrays.
 * 
 * @param {Array} array - Input array to transform
 * @param {Function} [mapFn] - Optional mapping function. If omitted, filters truthy values.
 * @returns {Array} - Array containing only truthy mapped values
 * 
 * @example
 * const qids = compact(bindings, b => extractQid(b.country?.value));
 * // Instead of: bindings.map(b => extractQid(b.country?.value)).filter(Boolean)
 * 
 * @example
 * const validItems = compact(items); // Filters out null/undefined/false/''
 */
function compact(array, mapFn) {
  const results = [];
  each(array, item => {
    const mapped = mapFn ? mapFn(item) : item;
    if (mapped != null && mapped !== false && mapped !== '') {
      results.push(mapped);
    }
  });
  return results;
}

/**
 * Extracts a property from each object in an array, filtering out undefined/null values.
 * 
 * @param {Array<Object>} array - Array of objects
 * @param {string} key - Property name to extract
 * @returns {Array} - Array of property values (excluding undefined/null)
 * 
 * @example
 * const names = pluck(places, 'name');
 * // Instead of: places.map(p => p.name).filter(n => n != null)
 */
function pluck(array, key) {
  const results = [];
  each(array, item => {
    if (item != null && item[key] != null) {
      results.push(item[key]);
    }
  });
  return results;
}

/**
 * Composes multiple transformation functions into a single pipeline.
 * Each function receives the result of the previous function.
 * 
 * @param {...Function} fns - Functions to compose (left to right)
 * @returns {Function} - Composed function
 * 
 * @example
 * const process = pipeline(
 *   items => compact(items, x => x?.value),
 *   values => values.filter(v => v.length > 0),
 *   values => values.sort()
 * );
 * const result = process(rawData);
 */
function pipeline(...fns) {
  return (input) => {
    let result = input;
    each(fns, fn => {
      result = fn(result);
    });
    return result;
  };
}

module.exports = {
  compact,
  pluck,
  pipeline
};
