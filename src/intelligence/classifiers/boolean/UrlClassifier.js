'use strict';

const { BooleanClassifierBase } = require('./BooleanClassifierBase');

/**
 * Base class for URL-based boolean classifiers.
 * 
 * URL classifiers operate on URL strings only - no DOM access required.
 * They are cheap to run and can be executed early in the classification pipeline.
 * 
 * Input shape: { url: string } or { url: string, parsedUrl: URL }
 * 
 * @extends BooleanClassifierBase
 */
class UrlClassifier extends BooleanClassifierBase {
  /**
   * @param {Object} options - Options passed to BooleanClassifierBase
   */
  constructor(options = {}) {
    super({
      ...options,
      category: 'url'
    });
    
    /** @type {'cheap'} */
    this.cost = 'cheap';
  }

  /**
   * Parse and normalize the URL input.
   * 
   * @protected
   * @param {Object} input
   * @param {string} input.url - The URL string
   * @param {URL} [input.parsedUrl] - Pre-parsed URL object (optional optimization)
   * @returns {{ url: string, parsedUrl: URL, segments: string[], path: string, host: string } | null}
   */
  parseInput(input) {
    if (!input || typeof input.url !== 'string') {
      return null;
    }

    try {
      const parsedUrl = input.parsedUrl instanceof URL 
        ? input.parsedUrl 
        : new URL(input.url);
      
      const path = parsedUrl.pathname || '/';
      const segments = path.split('/').filter(Boolean);
      const host = parsedUrl.hostname.toLowerCase();

      return {
        url: input.url,
        parsedUrl,
        segments,
        path,
        host,
        query: parsedUrl.search,
        hash: parsedUrl.hash
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Get path segments as lowercase slugs.
   * 
   * @protected
   * @param {string[]} segments - Raw path segments
   * @returns {string[]}
   */
  normalizeSegments(segments) {
    return segments.map(s => s.toLowerCase().replace(/[^a-z0-9-]/g, '-'));
  }

  /**
   * Check if path matches a pattern.
   * 
   * @protected
   * @param {string} path - URL path
   * @param {RegExp|string} pattern - Pattern to match
   * @returns {boolean}
   */
  pathMatches(path, pattern) {
    if (pattern instanceof RegExp) {
      return pattern.test(path);
    }
    return path.toLowerCase().includes(pattern.toLowerCase());
  }

  /**
   * Check if any segment matches a pattern.
   * 
   * @protected
   * @param {string[]} segments - Path segments
   * @param {RegExp|string} pattern - Pattern to match
   * @returns {{ matched: boolean, segment: string | null, index: number }}
   */
  segmentMatches(segments, pattern) {
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const matches = pattern instanceof RegExp 
        ? pattern.test(segment)
        : segment.toLowerCase().includes(pattern.toLowerCase());
      
      if (matches) {
        return { matched: true, segment, index: i };
      }
    }
    return { matched: false, segment: null, index: -1 };
  }
}

module.exports = { UrlClassifier };
