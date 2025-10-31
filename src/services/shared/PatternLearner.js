/**
 * PatternLearner - Pattern extraction and learning utilities
 *
 * Provides algorithms for extracting URL patterns from existing verified URLs.
 * Supports different mapping types (country, place-place, place-topic).
 */

class PatternLearner {
  /**
   * @param {object} options
   * @param {Console} [options.logger=console] - Logger instance
   */
  constructor({ logger = console } = {}) {
    this.logger = logger;
  }

  /**
   * Extract common pattern from two URLs based on mapping type
   * @param {string} url1 - First URL
   * @param {string} url2 - Second URL
   * @param {string} mappingType - Type of mapping ('country-hub', 'place-place-hub', etc.)
   * @returns {string|null} Common pattern or null
   */
  extractPatternFromUrls(url1, url2, mappingType = 'country-hub') {
    try {
      switch (mappingType) {
        case 'country-hub':
          return this._extractCountryPattern(url1, url2);
        case 'place-place-hub':
          return this._extractHierarchicalPattern(url1, url2);
        case 'place-topic-hub':
          return this._extractCombinationPattern(url1, url2);
        default:
          return this._extractCountryPattern(url1, url2);
      }
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract country hub pattern from two URLs
   * @param {string} url1 - First URL
   * @param {string} url2 - Second URL
   * @returns {string|null} Country pattern or null
   */
  _extractCountryPattern(url1, url2) {
    const path1 = new URL(url1).pathname;
    const path2 = new URL(url2).pathname;

    const segments1 = path1.split('/').filter(s => s);
    const segments2 = path2.split('/').filter(s => s);

    if (segments1.length !== segments2.length) {
      return null;
    }

    const pattern = [];
    for (let i = 0; i < segments1.length; i++) {
      if (segments1[i] === segments2[i]) {
        pattern.push(segments1[i]);
      } else {
        // Check if both look like country identifiers
        if (this._isCountryIdentifier(segments1[i]) && this._isCountryIdentifier(segments2[i])) {
          pattern.push('{slug}');
        } else {
          return null; // Not a consistent pattern
        }
      }
    }

    return '/' + pattern.join('/');
  }

  /**
   * Extract hierarchical place-place pattern from two URLs
   * @param {string} url1 - First URL
   * @param {string} url2 - Second URL
   * @returns {string|null} Hierarchical pattern or null
   */
  _extractHierarchicalPattern(url1, url2) {
    const path1 = new URL(url1).pathname;
    const path2 = new URL(url2).pathname;

    const segments1 = path1.split('/').filter(s => s);
    const segments2 = path2.split('/').filter(s => s);

    // Must have at least 2 segments for hierarchical pattern
    if (segments1.length < 2 || segments2.length < 2) {
      return null;
    }

    // Look for parent/child pattern where first segment is same and second differs
    if (segments1.length === segments2.length && segments1[0] === segments2[0]) {
      const pattern = [`/${segments1[0]}`, '{parentSlug}', '{childSlug}'];
      return pattern.join('/');
    }

    // Look for /world/parent/child pattern
    if (segments1.length >= 3 && segments2.length >= 3 &&
        segments1[0] === segments2[0] && segments1[1] === segments2[1] &&
        segments1[0] === 'world') {
      return '/world/{parentSlug}/{childSlug}';
    }

    return null;
  }

  /**
   * Extract place-topic combination pattern from two URLs
   * @param {string} url1 - First URL
   * @param {string} url2 - Second URL
   * @returns {string|null} Combination pattern or null
   */
  _extractCombinationPattern(url1, url2) {
    // For place-topic, look for patterns like /place/topic or /topic/place
    const path1 = new URL(url1).pathname;
    const path2 = new URL(url2).pathname;

    const segments1 = path1.split('/').filter(s => s);
    const segments2 = path2.split('/').filter(s => s);

    if (segments1.length !== segments2.length || segments1.length < 2) {
      return null;
    }

    // Look for place/topic or topic/place patterns
    if (segments1.length === 2) {
      // Check if both segments are identifiers in both URLs
      if (this._isIdentifier(segments1[0]) && this._isIdentifier(segments1[1]) &&
          this._isIdentifier(segments2[0]) && this._isIdentifier(segments2[1])) {
        return '/{placeSlug}/{topicSlug}';
      }
    }

    return null;
  }

  /**
   * Check if a string looks like a country identifier (slug or code)
   * @param {string} str - String to check
   * @returns {boolean} True if looks like country identifier
   */
  _isCountryIdentifier(str) {
    // Country codes are 2-3 letters
    if (/^[a-z]{2,3}$/i.test(str)) {
      return true;
    }

    // Country slugs are lowercase with hyphens
    if (/^[a-z]+(-[a-z]+)*$/.test(str)) {
      return true;
    }

    return false;
  }

  /**
   * Check if a string looks like any identifier (slug, code, etc.)
   * @param {string} str - String to check
   * @returns {boolean} True if looks like identifier
   */
  _isIdentifier(str) {
    // Allow alphanumeric, hyphens, underscores
    return /^[a-zA-Z0-9_-]+$/.test(str);
  }
}

module.exports = { PatternLearner };