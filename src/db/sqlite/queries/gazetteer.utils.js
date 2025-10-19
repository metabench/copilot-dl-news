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
 * - Removes diacritics from Latin scripts
 * - Handles non-Latin scripts (Arabic, Chinese, Cyrillic, etc.) by preserving meaningful characters
 * - Replaces spaces/hyphens with consistent separator
 *
 * @param {string} name - Place name to normalize
 * @returns {string} Normalized name
 */
function normalizeName(name) {
  if (!name) return '';

  let normalized = String(name).toLowerCase();

  // For Latin scripts: decompose and remove diacritics
  if (/[\u0041-\u007A\u00C0-\u024F]/.test(normalized)) {
    normalized = normalized
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''); // Remove combining diacritical marks
  }

  // Replace non-alphanumeric characters (except meaningful Unicode letters) with hyphens
  // Keep: Latin letters, digits, and Unicode letters from other scripts
  normalized = normalized.replace(/[^\p{L}\p{N}]+/gu, '-');

  // Remove leading/trailing hyphens
  normalized = normalized.replace(/^-+|-+$/g, '');

  return normalized;
}

module.exports = {
  normalizeName
};