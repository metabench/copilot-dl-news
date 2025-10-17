/**
 * slugify.js - Text normalization and slugification utilities
 * 
 * Provides functions for converting text to URL-friendly slugs and
 * normalizing text for case-insensitive matching.
 */

/**
 * Normalize name by removing accents, converting to lowercase, and trimming
 * @param {string} s - Text to normalize
 * @returns {string} Normalized text
 */
function normName(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Convert text to URL-friendly slug
 * Removes accents, converts to lowercase, replaces spaces/special chars with hyphens
 * 
 * Examples:
 *   "Sri Lanka" -> "sri-lanka"
 *   "New York" -> "new-york"
 *   "São Paulo" -> "sao-paulo"
 * 
 * @param {string} s - Text to slugify
 * @returns {string} URL-friendly slug
 */
function slugify(s) {
  return normName(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Normalize text for case-insensitive matching
 * Removes all spaces, hyphens, and special characters for comparison
 * 
 * This is used to match different representations of the same place:
 *   "Sri Lanka" -> "srilanka"
 *   "sri-lanka" -> "srilanka"
 *   "srilanka" -> "srilanka"
 * 
 * Use this when comparing slugs against gazetteer names to handle
 * cases where URLs have concatenated names (e.g., "srilanka" vs "sri-lanka")
 * 
 * @param {string} s - Text to normalize
 * @returns {string} Normalized text with no spaces or hyphens
 */
function normalizeForMatching(s) {
  return normName(s).replace(/[^a-z0-9]/g, '');
}

module.exports = {
  normName,
  slugify,
  normalizeForMatching
};
