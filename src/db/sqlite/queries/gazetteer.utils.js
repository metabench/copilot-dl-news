'use strict';

/**
 * Gazetteer Utilities
 * 
 * Shared utility functions for gazetteer operations.
 * Extracted to avoid circular dependencies between modules.
 */

/**
 * Normalize a place name for matching and deduplication
 * - Converts to lowercase
 * - Removes diacritics
 * - Replaces spaces/hyphens with consistent separator
 * 
 * @param {string} name - Place name to normalize
 * @returns {string} Normalized name
 */
function normalizeName(name) {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z0-9]+/g, '-')    // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '');       // Remove leading/trailing hyphens
}

module.exports = {
  normalizeName
};