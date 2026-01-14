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

/**
 * Generate multiple URL slug variants for a name.
 * Used for hub discovery to try different URL formatting strategies.
 * 
 * Returns array of { slug, strategy } objects:
 *   - hyphenated: "state-of-palestine" (most common)
 *   - compact: "stateofpalestine" (no separators)
 *   - underscored: "state_of_palestine" (less common)
 * 
 * @param {string} name - Place name to slugify
 * @returns {Array<{slug: string, strategy: string}>}
 */
function generateSlugVariants(name) {
  if (!name) return [];
  
  const variants = [];
  const seenSlugs = new Set();
  const normalized = normName(name);
  
  // Strategy 1: Standard hyphenated (most common)
  const hyphenated = normalized
    .replace(/[^a-z0-9\s]/g, '')    // Remove special chars (keep spaces)
    .replace(/\s+/g, '-')           // Spaces to hyphens
    .replace(/-+/g, '-')            // Collapse multiple hyphens
    .replace(/^-|-$/g, '');         // Trim hyphens
  
  if (hyphenated && !seenSlugs.has(hyphenated)) {
    seenSlugs.add(hyphenated);
    variants.push({ slug: hyphenated, strategy: 'hyphenated' });
  }
  
  // Strategy 2: Compact (no separators)
  const compact = normalized.replace(/[^a-z0-9]/g, '');
  if (compact && !seenSlugs.has(compact)) {
    seenSlugs.add(compact);
    variants.push({ slug: compact, strategy: 'compact' });
  }
  
  // Strategy 3: Underscored (less common but exists)
  const underscored = normalized
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  
  if (underscored && !seenSlugs.has(underscored)) {
    seenSlugs.add(underscored);
    variants.push({ slug: underscored, strategy: 'underscored' });
  }
  
  return variants;
}

module.exports = {
  normName,
  slugify,
  normalizeForMatching,
  generateSlugVariants
};
