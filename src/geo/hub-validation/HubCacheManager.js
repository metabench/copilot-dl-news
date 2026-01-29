/**
 * HubCacheManager - Article caching and retrieval logic
 *
 * Extracted from HubValidator to handle cached article retrieval
 * from both legacy articles table and normalized HTTP responses.
 */

class HubCacheManager {
  constructor(db) {
    this.db = db;
  }

  /**
   * Check if we have a cached version of the URL
   * @param {string} url - URL to check
   * @returns {Object|null} - Article record or null
   */
  getCachedArticle(url) {
    const legacy = this._getLegacyArticle(url);
    if (legacy) return legacy;
    const normalized = this._getNormalizedArticle(url);
    if (normalized) return normalized;
    return null;
  }

  /**
   * Get article from legacy articles table
   * @param {string} url - URL to query
   * @returns {Object|null} - Article record or null
   */
  _getLegacyArticle(url) {
    try {
      const row = this.db.prepare(
        'SELECT id, url, title, html, text FROM articles WHERE url = ?'
      ).get(url);
      if (!row) return null;
      return {
        url: row.url,
        title: row.title,
        html: this._bufferToString(row.html || row.text || null),
        text: row.text || null,
        source: 'articles-table'
      };
    } catch (_) {
      return null;
    }
  }

  /**
   * Get article from normalized HTTP responses
   * @param {string} url - URL to query
   * @returns {Object|null} - Article record or null
   */
  _getNormalizedArticle(url) {
    try {
      const row = this.db.prepare(`
        SELECT
          u.url AS url,
          ca.title AS title,
          cs.content_blob AS html,
          ca.word_count AS wordCount,
          ca.nav_links_count AS navLinksCount,
          ca.article_links_count AS articleLinksCount
        FROM urls u
        JOIN http_responses hr ON hr.url_id = u.id
        LEFT JOIN content_storage cs ON cs.http_response_id = hr.id
        LEFT JOIN content_analysis ca ON ca.content_id = cs.id
        WHERE u.url = ? OR u.canonical_url = ?
        ORDER BY hr.fetched_at DESC
        LIMIT 1
      `).get(url, url);
      if (!row) return null;
      return {
        url: row.url,
        title: row.title,
        html: this._bufferToString(row.html),
        wordCount: row.wordCount,
        navLinksCount: row.navLinksCount,
        articleLinksCount: row.articleLinksCount,
        source: 'normalized-http'
      };
    } catch (_) {
      return null;
    }
  }

  /**
   * Convert buffer or other input to string safely
   * @param {*} input - Input to convert
   * @returns {string|null} - String representation or null
   */
  _bufferToString(input) {
    if (input == null) return null;
    if (typeof input === 'string') return input;
    if (Buffer.isBuffer(input)) return input.toString('utf8');
    return String(input);
  }
}

module.exports = { HubCacheManager };