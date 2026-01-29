/**
 * Domain and URL Utilities
 *
 * Utility functions for domain normalization, URL processing, and HTML extraction.
 * Extracted from placeHubGuessing.js to improve modularity.
 */

/**
 * Normalize domain input to {host, scheme, base}
 * @param {string} input - Domain input (with or without scheme)
 * @param {string} scheme - Default scheme if not provided ('https')
 * @returns {Object|null} - Normalized domain object or null if invalid
 */
function normalizeDomain(input, scheme = 'https') {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;

  if (trimmed.includes('://')) {
    const parsed = new URL(trimmed);
    return {
      host: parsed.hostname.toLowerCase(),
      scheme: parsed.protocol.replace(':', ''),
      base: `${parsed.protocol}//${parsed.host}`
    };
  }

  const cleanScheme = scheme === 'http' ? 'http' : 'https';
  return {
    host: trimmed.toLowerCase(),
    scheme: cleanScheme,
    base: `${cleanScheme}://${trimmed.toLowerCase()}`
  };
}

/**
 * Apply scheme to URL
 * @param {string} url - Original URL
 * @param {string} targetScheme - Target scheme to apply
 * @returns {string} - URL with scheme applied
 */
function applyScheme(url, targetScheme) {
  if (!url) return url;
  if (!targetScheme || targetScheme === 'https') return url;
  return url.replace(/^https:\/\//i, `${targetScheme}://`);
}

/**
 * Extract title from HTML
 * @param {string} html - HTML content
 * @returns {string|null} - Extracted title or null
 */
function extractTitle(html) {
  if (!html) return null;
  const match = String(html).match(/<title[^>]*>([^<]*)<\/title>/i);
  if (!match) return null;
  return match[1].trim().replace(/\s+/g, ' ').slice(0, 300);
}

module.exports = {
  normalizeDomain,
  applyScheme,
  extractTitle
};