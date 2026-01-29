/**
 * HubNormalizer - URL normalization and HTML processing utilities
 *
 * Extracted from HubValidator to handle URL normalization, HTML text extraction,
 * and utility functions for hub validation.
 */

class HubNormalizer {
  /**
   * Normalize a hub URL to its front page (remove pagination, query params)
   * @param {string} url - Original URL
   * @returns {string} - Normalized URL
   */
  normalizeHubUrl(url) {
    try {
      const urlObj = new URL(url);
      // Remove query parameters (page, etc)
      urlObj.search = '';
      // Remove hash
      urlObj.hash = '';
      return urlObj.href;
    } catch (error) {
      return url;
    }
  }

  /**
   * Extract title from HTML
   * @param {string} html - HTML content
   * @returns {string} - Extracted title
   */
  extractTitle(html) {
    const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return match ? match[1].trim() : '';
  }

  /**
   * Extract text from HTML (simple version)
   * @param {string} html - HTML content
   * @returns {string} - Extracted text
   */
  extractText(html) {
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 1000);
  }

  /**
   * Check if URL contains a date pattern (indicates article, not hub)
   * @param {string} url - URL to check
   * @returns {boolean} - True if URL contains date pattern
   */
  isDatedArticle(url) {
    // Match patterns like /2025/oct/14/ or /2025/10/14/
    return /\/\d{4}\/[a-z]{3}\/\d{1,2}\//i.test(url) ||
           /\/\d{4}\/\d{1,2}\/\d{1,2}\//i.test(url);
  }

  /**
   * Check if URL appears to be paginated
   * @param {string} url - URL to check
   * @returns {boolean} - True if URL contains pagination indicators
   */
  isPaginated(url) {
    // Match patterns like /page/2/, ?page=2, /p/2/, etc.
    return /\/page\/\d+\//i.test(url) ||
           /\?page=\d+/i.test(url) ||
           /\/p\/\d+\//i.test(url) ||
           /\/page\d+\//i.test(url);
  }

  /**
   * Convert buffer or other input to string safely
   * @param {*} input - Input to convert
   * @returns {string|null} - String representation or null
   */
  bufferToString(input) {
    if (input == null) return null;
    if (typeof input === 'string') return input;
    if (Buffer.isBuffer(input)) return input.toString('utf8');
    return String(input);
  }

  /**
   * Count links in HTML content
   * @param {string} html - HTML content
   * @returns {number} - Number of links found
   */
  countLinks(html) {
    if (!html) return 0;
    return (String(html).match(/<a\b[^>]*href/gi) || []).length;
  }

  /**
   * Convert value to lowercase safely
   * @param {*} value - Value to convert
   * @returns {string} - Lowercase string
   */
  toLower(value) {
    return typeof value === 'string' ? value.toLowerCase() : '';
  }
}

module.exports = { HubNormalizer };