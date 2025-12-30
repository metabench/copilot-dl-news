'use strict';

/**
 * Articles Database Adapter
 * 
 * Provides read-only access to articles for the REST API.
 * Wraps the articles_view and content_analysis tables.
 * 
 * @module articlesAdapter
 */

/**
 * Create articles adapter
 * @param {import('better-sqlite3').Database} db - better-sqlite3 database instance
 * @returns {Object} Articles adapter methods
 */
function createArticlesAdapter(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('createArticlesAdapter requires a better-sqlite3 database handle');
  }

  // Prepared statements for common queries
  const stmts = {
    // List articles with pagination
    listArticles: db.prepare(`
      SELECT 
        u.id,
        u.url,
        u.host,
        ca.title,
        ca.date,
        ca.section,
        ca.word_count,
        ca.byline,
        ca.authors,
        hr.fetched_at AS crawled_at
      FROM urls u
      INNER JOIN http_responses hr ON hr.url_id = u.id
      INNER JOIN content_storage cs ON cs.http_response_id = hr.id
      INNER JOIN content_analysis ca ON ca.content_id = cs.id
      WHERE hr.http_status = 200
      ORDER BY hr.fetched_at DESC
      LIMIT ? OFFSET ?
    `),

    // Count total articles
    countArticles: db.prepare(`
      SELECT COUNT(*) as total
      FROM urls u
      INNER JOIN http_responses hr ON hr.url_id = u.id
      INNER JOIN content_storage cs ON cs.http_response_id = hr.id
      INNER JOIN content_analysis ca ON ca.content_id = cs.id
      WHERE hr.http_status = 200
    `),

    // Get single article by ID
    getArticleById: db.prepare(`
      SELECT 
        u.id,
        u.url,
        u.host,
        u.canonical_url,
        ca.title,
        ca.date,
        ca.section,
        ca.word_count,
        ca.byline,
        ca.authors,
        ca.language,
        ca.classification,
        ca.body_text,
        hr.fetched_at AS crawled_at,
        hr.http_status,
        hr.content_type,
        hr.ttfb_ms,
        hr.download_ms,
        hr.bytes_downloaded
      FROM urls u
      INNER JOIN http_responses hr ON hr.url_id = u.id
      INNER JOIN content_storage cs ON cs.http_response_id = hr.id
      INNER JOIN content_analysis ca ON ca.content_id = cs.id
      WHERE u.id = ? AND hr.http_status = 200
    `),

    // List articles by domain
    listArticlesByDomain: db.prepare(`
      SELECT 
        u.id,
        u.url,
        u.host,
        ca.title,
        ca.date,
        ca.section,
        ca.word_count,
        hr.fetched_at AS crawled_at
      FROM urls u
      INNER JOIN http_responses hr ON hr.url_id = u.id
      INNER JOIN content_storage cs ON cs.http_response_id = hr.id
      INNER JOIN content_analysis ca ON ca.content_id = cs.id
      WHERE u.host = ? AND hr.http_status = 200
      ORDER BY hr.fetched_at DESC
      LIMIT ? OFFSET ?
    `),

    // Count articles by domain
    countArticlesByDomain: db.prepare(`
      SELECT COUNT(*) as total
      FROM urls u
      INNER JOIN http_responses hr ON hr.url_id = u.id
      INNER JOIN content_storage cs ON cs.http_response_id = hr.id
      INNER JOIN content_analysis ca ON ca.content_id = cs.id
      WHERE u.host = ? AND hr.http_status = 200
    `),

    // List all domains with article counts
    listDomains: db.prepare(`
      SELECT 
        u.host,
        COUNT(*) as article_count,
        MAX(hr.fetched_at) as last_crawled_at,
        MIN(hr.fetched_at) as first_crawled_at
      FROM urls u
      INNER JOIN http_responses hr ON hr.url_id = u.id
      INNER JOIN content_storage cs ON cs.http_response_id = hr.id
      INNER JOIN content_analysis ca ON ca.content_id = cs.id
      WHERE hr.http_status = 200
      GROUP BY u.host
      ORDER BY article_count DESC
      LIMIT ? OFFSET ?
    `),

    // Count domains
    countDomains: db.prepare(`
      SELECT COUNT(DISTINCT u.host) as total
      FROM urls u
      INNER JOIN http_responses hr ON hr.url_id = u.id
      WHERE hr.http_status = 200
    `),

    // Overall stats
    getOverallStats: db.prepare(`
      SELECT 
        COUNT(DISTINCT u.id) as total_articles,
        COUNT(DISTINCT u.host) as total_domains,
        SUM(ca.word_count) as total_words,
        AVG(ca.word_count) as avg_word_count,
        MIN(hr.fetched_at) as oldest_article,
        MAX(hr.fetched_at) as newest_article
      FROM urls u
      INNER JOIN http_responses hr ON hr.url_id = u.id
      INNER JOIN content_storage cs ON cs.http_response_id = hr.id
      INNER JOIN content_analysis ca ON ca.content_id = cs.id
      WHERE hr.http_status = 200
    `),

    // Daily crawl counts
    getDailyCrawlCounts: db.prepare(`
      SELECT 
        date(hr.fetched_at) as date,
        COUNT(*) as article_count,
        COUNT(DISTINCT u.host) as domain_count
      FROM urls u
      INNER JOIN http_responses hr ON hr.url_id = u.id
      INNER JOIN content_storage cs ON cs.http_response_id = hr.id
      WHERE hr.http_status = 200
        AND hr.fetched_at >= date('now', '-' || ? || ' days')
      GROUP BY date(hr.fetched_at)
      ORDER BY date DESC
    `)
  };

  /**
   * Parse authors JSON safely
   */
  function parseAuthors(authorsJson) {
    if (!authorsJson) return [];
    try {
      const parsed = JSON.parse(authorsJson);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /**
   * Normalize an article row
   */
  function normalizeArticle(row) {
    if (!row) return null;
    return {
      id: row.id,
      url: row.url,
      host: row.host,
      canonicalUrl: row.canonical_url || null,
      title: row.title,
      date: row.date,
      section: row.section,
      wordCount: row.word_count,
      byline: row.byline || null,
      authors: parseAuthors(row.authors),
      language: row.language || null,
      classification: row.classification || null,
      bodyText: row.body_text || null,
      crawledAt: row.crawled_at,
      httpStatus: row.http_status,
      contentType: row.content_type,
      ttfbMs: row.ttfb_ms,
      downloadMs: row.download_ms,
      bytesDownloaded: row.bytes_downloaded
    };
  }

  return {
    /**
     * List articles with pagination
     * @param {Object} options - Query options
     * @param {number} [options.page=1] - Page number (1-indexed)
     * @param {number} [options.limit=20] - Items per page (max 100)
     * @returns {Object} Paginated articles
     */
    listArticles({ page = 1, limit = 20 } = {}) {
      const safePage = Math.max(1, parseInt(page, 10) || 1);
      const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
      const offset = (safePage - 1) * safeLimit;

      const rows = stmts.listArticles.all(safeLimit, offset);
      const totalRow = stmts.countArticles.get();
      const total = totalRow?.total || 0;

      return {
        items: rows.map(normalizeArticle),
        total,
        page: safePage,
        limit: safeLimit,
        hasMore: offset + rows.length < total,
        totalPages: Math.ceil(total / safeLimit)
      };
    },

    /**
     * Get single article by ID
     * @param {number} id - Article ID
     * @returns {Object|null} Article data
     */
    getArticleById(id) {
      const row = stmts.getArticleById.get(id);
      return normalizeArticle(row);
    },

    /**
     * List articles by domain
     * @param {string} host - Domain host
     * @param {Object} options - Query options
     * @returns {Object} Paginated articles
     */
    listArticlesByDomain(host, { page = 1, limit = 20 } = {}) {
      const safePage = Math.max(1, parseInt(page, 10) || 1);
      const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
      const offset = (safePage - 1) * safeLimit;

      const rows = stmts.listArticlesByDomain.all(host, safeLimit, offset);
      const totalRow = stmts.countArticlesByDomain.get(host);
      const total = totalRow?.total || 0;

      return {
        items: rows.map(normalizeArticle),
        total,
        page: safePage,
        limit: safeLimit,
        hasMore: offset + rows.length < total,
        host
      };
    },

    /**
     * List all crawled domains
     * @param {Object} options - Query options
     * @returns {Object} Paginated domains
     */
    listDomains({ page = 1, limit = 50 } = {}) {
      const safePage = Math.max(1, parseInt(page, 10) || 1);
      const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
      const offset = (safePage - 1) * safeLimit;

      const rows = stmts.listDomains.all(safeLimit, offset);
      const totalRow = stmts.countDomains.get();
      const total = totalRow?.total || 0;

      return {
        items: rows.map(row => ({
          host: row.host,
          articleCount: row.article_count,
          lastCrawledAt: row.last_crawled_at,
          firstCrawledAt: row.first_crawled_at
        })),
        total,
        page: safePage,
        limit: safeLimit,
        hasMore: offset + rows.length < total
      };
    },

    /**
     * Get overall statistics
     * @returns {Object} Stats
     */
    getStats() {
      const row = stmts.getOverallStats.get();
      if (!row) {
        return {
          totalArticles: 0,
          totalDomains: 0,
          totalWords: 0,
          avgWordCount: 0,
          oldestArticle: null,
          newestArticle: null
        };
      }
      return {
        totalArticles: row.total_articles || 0,
        totalDomains: row.total_domains || 0,
        totalWords: row.total_words || 0,
        avgWordCount: Math.round(row.avg_word_count || 0),
        oldestArticle: row.oldest_article,
        newestArticle: row.newest_article
      };
    },

    /**
     * Get daily crawl counts
     * @param {number} [days=30] - Number of days to look back
     * @returns {Array} Daily counts
     */
    getDailyCrawlCounts(days = 30) {
      const safeDays = Math.min(365, Math.max(1, parseInt(days, 10) || 30));
      const rows = stmts.getDailyCrawlCounts.all(safeDays);
      return rows.map(row => ({
        date: row.date,
        articleCount: row.article_count,
        domainCount: row.domain_count
      }));
    }
  };
}

module.exports = {
  createArticlesAdapter
};
