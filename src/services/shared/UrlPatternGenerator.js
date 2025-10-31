/**
 * UrlPatternGenerator - Utility for generating and formatting URL patterns
 *
 * Provides common URL generation logic used across prediction strategies.
 * Handles pattern formatting, URL validation, and normalization.
 */

class UrlPatternGenerator {
  /**
   * Generate URL from pattern template and metadata
   * @param {string} pattern - Pattern with placeholders like {slug}, {code}
   * @param {Object} metadata - Metadata object with placeholder values
   * @param {string} domain - Target domain
   * @returns {string|null} Generated URL or null if invalid
   */
  static generateUrl(pattern, metadata, domain) {
    if (!pattern || !domain) return null;

    const baseUrl = `https://${domain}`;
    const formatted = this.formatPattern(pattern, metadata);

    try {
      return new URL(formatted, baseUrl).href;
    } catch (err) {
      return null;
    }
  }

  /**
   * Format a pattern by replacing placeholders with metadata values
   * @param {string} pattern - Pattern with placeholders
   * @param {Object} metadata - Metadata object
   * @returns {string} Formatted pattern
   */
  static formatPattern(pattern, metadata) {
    if (!pattern || !metadata) return pattern;

    let formatted = pattern;
    for (const [key, value] of Object.entries(metadata)) {
      const placeholder = `{${key}}`;
      if (formatted.includes(placeholder)) {
        formatted = formatted.replace(new RegExp(placeholder, 'g'), value || '');
      }
    }
    return formatted;
  }

  /**
   * Extract patterns from existing URLs by finding common structures
   * @param {Array<string>} urls - Array of URLs to analyze
   * @param {string} domain - Domain to filter by
   * @param {Object} metadata - Metadata for pattern extraction
   * @returns {Array<string>} Extracted patterns
   */
  static extractPatternsFromUrls(urls, domain, metadata = {}) {
    const patterns = new Set();

    for (const url of urls) {
      try {
        const urlObj = new URL(url);
        if (urlObj.hostname !== domain) continue;

        const path = urlObj.pathname;
        const pattern = this.extractPatternFromPath(path, metadata);
        if (pattern) {
          patterns.add(pattern);
        }
      } catch (err) {
        // Skip invalid URLs
      }
    }

    return Array.from(patterns);
  }

  /**
   * Extract pattern from URL path by replacing metadata values with placeholders
   * @param {string} path - URL path
   * @param {Object} metadata - Metadata for placeholder replacement
   * @returns {string|null} Extracted pattern or null
   */
  static extractPatternFromPath(path, metadata) {
    if (!path || !metadata) return null;

    let pattern = path;
    let hasReplacements = false;

    // Sort keys by length descending to avoid partial replacements
    const sortedKeys = Object.keys(metadata).sort((a, b) => b.length - a.length);

    for (const key of sortedKeys) {
      const value = metadata[key];
      if (value && typeof value === 'string' && value.length > 2) {
        const regex = new RegExp(this.escapeRegex(value), 'g');
        if (regex.test(pattern)) {
          pattern = pattern.replace(regex, `{${key}}`);
          hasReplacements = true;
        }
      }
    }

    return hasReplacements ? pattern : null;
  }

  /**
   * Validate and normalize a URL
   * @param {string} url - URL to validate
   * @returns {string|null} Normalized URL or null if invalid
   */
  static normalizeUrl(url) {
    if (!url) return null;

    try {
      const urlObj = new URL(url);
      // Remove query parameters and hash
      urlObj.search = '';
      urlObj.hash = '';
      return urlObj.href;
    } catch (err) {
      return null;
    }
  }

  /**
   * Check if URL belongs to domain
   * @param {string} url - URL to check
   * @param {string} domain - Expected domain
   * @returns {boolean} True if URL belongs to domain
   */
  static isUrlForDomain(url, domain) {
    if (!url || !domain) return false;

    try {
      const urlObj = new URL(url);
      return urlObj.hostname === domain || urlObj.hostname === `www.${domain}`;
    } catch (err) {
      return false;
    }
  }

  /**
   * Escape special regex characters
   * @param {string} string - String to escape
   * @returns {string} Escaped string
   */
  static escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Create prediction object with standardized structure
   * @param {string} url - Generated URL
   * @param {number} confidence - Confidence score
   * @param {string} strategy - Prediction strategy name
   * @param {string} pattern - Pattern used
   * @param {Object} entity - Entity being predicted for
   * @param {string} domain - Target domain
   * @returns {Object} Standardized prediction object
   */
  static createPrediction(url, confidence, strategy, pattern, entity, domain) {
    return {
      url,
      confidence,
      strategy,
      pattern,
      entity,
      domain
    };
  }
}

module.exports = { UrlPatternGenerator };