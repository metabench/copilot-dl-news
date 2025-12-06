"use strict";

/**
 * Shared Utilities for Crawl CLI
 * 
 * DRY module containing utilities used across crawl CLI modules.
 * 
 * @module src/cli/crawl/shared
 */

/**
 * Check if value is a plain object (not null, not array)
 * @param {*} value - Value to check
 * @returns {boolean}
 */
function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Merge multiple override objects into one
 * Uses shallow Object.assign for each source
 * @param {...Object} sources - Objects to merge
 * @returns {Object} - Merged result
 */
function mergeOverrideObjects(...sources) {
  const result = {};
  for (const source of sources) {
    if (isPlainObject(source)) {
      Object.assign(result, source);
    }
  }
  return result;
}

/**
 * Extract stats from sequence steps (finds last step with stats)
 * @param {Array} steps - Array of step results
 * @returns {Object|null} - Stats object or null
 */
function extractStatsFromSteps(steps) {
  if (!Array.isArray(steps)) {
    return null;
  }
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const candidate = steps[index];
    if (candidate && candidate.stats && typeof candidate.stats === 'object') {
      const keys = Object.keys(candidate.stats);
      if (keys.length > 0) {
        return candidate.stats;
      }
    }
  }
  return null;
}

/**
 * Pick first non-empty string from values
 * @param {...*} values - Values to check
 * @returns {string|null} - First non-empty string or null
 */
function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

/**
 * Parse comma-separated string into array
 * @param {string|null|undefined} value - Comma-separated string
 * @returns {string[]} - Array of trimmed non-empty values
 */
function parseCommaSeparated(value) {
  if (value === undefined || value === null) {
    return [];
  }
  return String(value)
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Ensure URL has a scheme (protocol)
 * @param {string|null} target - URL or domain
 * @param {string} [fallbackScheme='https'] - Scheme to add if missing
 * @returns {string|null} - Absolute URL or null
 */
function ensureAbsoluteUrl(target, fallbackScheme = 'https') {
  if (!target) {
    return null;
  }
  const trimmed = String(target).trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.includes('://')) {
    return trimmed;
  }
  const scheme = typeof fallbackScheme === 'string' && fallbackScheme ? fallbackScheme : 'https';
  return `${scheme}://${trimmed}`;
}

module.exports = {
  isPlainObject,
  mergeOverrideObjects,
  extractStatsFromSteps,
  pickString,
  parseCommaSeparated,
  ensureAbsoluteUrl
};
