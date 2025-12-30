'use strict';

/**
 * Search Adapter - FTS5 Full-Text Search Operations
 * 
 * Provides database operations for full-text search across articles using
 * SQLite FTS5 with BM25 ranking. Supports:
 *   - Full-text search with BM25 ranking
 *   - Author-specific search
 *   - Faceted filtering (domain, date range, author)
 *   - Search result highlighting
 *   - Index management (rebuild, optimize)
 */

/**
 * BM25 weights for different fields
 * Higher weight = more important in ranking
 */
const BM25_WEIGHTS = {
  title: 10.0,     // Title matches are most important
  body_text: 5.0,  // Body text is secondary
  byline: 2.0,     // Byline is useful for author searches
  authors: 1.0     // Author names (JSON array)
};

/**
 * Create search adapter queries and operations
 * @param {Database} db - better-sqlite3 database instance
 * @returns {Object} Search adapter methods
 */
function createSearchAdapter(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('createSearchAdapter requires a better-sqlite3 database handle');
  }

  // Prepared statements for common operations
  const stmts = {
    // Full-text search with BM25 ranking
    search: db.prepare(`
      SELECT 
        ca.id,
        ca.content_id,
        ca.title,
        ca.body_text,
        ca.byline,
        ca.authors,
        ca.date,
        ca.section,
        ca.word_count,
        ca.classification,
        ca.analyzed_at,
        u.url,
        u.host,
        bm25(articles_fts, ${BM25_WEIGHTS.title}, ${BM25_WEIGHTS.body_text}, ${BM25_WEIGHTS.byline}, ${BM25_WEIGHTS.authors}) AS rank
      FROM articles_fts
      JOIN content_analysis ca ON articles_fts.rowid = ca.id
      JOIN content_storage cs ON ca.content_id = cs.id
      JOIN http_responses hr ON cs.http_response_id = hr.id
      JOIN urls u ON hr.url_id = u.id
      WHERE articles_fts MATCH ?
      ORDER BY rank
      LIMIT ?
      OFFSET ?
    `),

    // Search with domain filter
    searchByDomain: db.prepare(`
      SELECT 
        ca.id,
        ca.content_id,
        ca.title,
        ca.body_text,
        ca.byline,
        ca.authors,
        ca.date,
        ca.section,
        ca.word_count,
        ca.classification,
        ca.analyzed_at,
        u.url,
        u.host,
        bm25(articles_fts, ${BM25_WEIGHTS.title}, ${BM25_WEIGHTS.body_text}, ${BM25_WEIGHTS.byline}, ${BM25_WEIGHTS.authors}) AS rank
      FROM articles_fts
      JOIN content_analysis ca ON articles_fts.rowid = ca.id
      JOIN content_storage cs ON ca.content_id = cs.id
      JOIN http_responses hr ON cs.http_response_id = hr.id
      JOIN urls u ON hr.url_id = u.id
      WHERE articles_fts MATCH ?
        AND u.host = ?
      ORDER BY rank
      LIMIT ?
      OFFSET ?
    `),

    // Search with date range filter
    searchByDateRange: db.prepare(`
      SELECT 
        ca.id,
        ca.content_id,
        ca.title,
        ca.body_text,
        ca.byline,
        ca.authors,
        ca.date,
        ca.section,
        ca.word_count,
        ca.classification,
        ca.analyzed_at,
        u.url,
        u.host,
        bm25(articles_fts, ${BM25_WEIGHTS.title}, ${BM25_WEIGHTS.body_text}, ${BM25_WEIGHTS.byline}, ${BM25_WEIGHTS.authors}) AS rank
      FROM articles_fts
      JOIN content_analysis ca ON articles_fts.rowid = ca.id
      JOIN content_storage cs ON ca.content_id = cs.id
      JOIN http_responses hr ON cs.http_response_id = hr.id
      JOIN urls u ON hr.url_id = u.id
      WHERE articles_fts MATCH ?
        AND ca.date >= ?
        AND ca.date <= ?
      ORDER BY rank
      LIMIT ?
      OFFSET ?
    `),

    // Count total matches (for pagination)
    countMatches: db.prepare(`
      SELECT COUNT(*) AS total
      FROM articles_fts
      WHERE articles_fts MATCH ?
    `),

    // Get highlighted snippets
    getHighlightedSnippet: db.prepare(`
      SELECT 
        highlight(articles_fts, 0, '<mark>', '</mark>') AS title_highlight,
        snippet(articles_fts, 1, '<mark>', '</mark>', '...', 64) AS body_snippet,
        highlight(articles_fts, 2, '<mark>', '</mark>') AS byline_highlight,
        highlight(articles_fts, 3, '<mark>', '</mark>') AS authors_highlight
      FROM articles_fts
      WHERE articles_fts MATCH ?
        AND rowid = ?
    `),

    // Get article by ID for highlighting
    getArticleById: db.prepare(`
      SELECT 
        ca.id,
        ca.content_id,
        ca.title,
        ca.body_text,
        ca.byline,
        ca.authors,
        ca.date,
        ca.section,
        ca.word_count,
        u.url,
        u.host
      FROM content_analysis ca
      JOIN content_storage cs ON ca.content_id = cs.id
      JOIN http_responses hr ON cs.http_response_id = hr.id
      JOIN urls u ON hr.url_id = u.id
      WHERE ca.id = ?
    `),

    // Get domain facets for search results
    getDomainFacets: db.prepare(`
      SELECT 
        u.host,
        COUNT(*) AS count
      FROM articles_fts
      JOIN content_analysis ca ON articles_fts.rowid = ca.id
      JOIN content_storage cs ON ca.content_id = cs.id
      JOIN http_responses hr ON cs.http_response_id = hr.id
      JOIN urls u ON hr.url_id = u.id
      WHERE articles_fts MATCH ?
      GROUP BY u.host
      ORDER BY count DESC
      LIMIT ?
    `),

    // Get author facets for search results
    getAuthorFacets: db.prepare(`
      SELECT 
        ca.byline,
        COUNT(*) AS count
      FROM articles_fts
      JOIN content_analysis ca ON articles_fts.rowid = ca.id
      WHERE articles_fts MATCH ?
        AND ca.byline IS NOT NULL
      GROUP BY ca.byline
      ORDER BY count DESC
      LIMIT ?
    `),

    // Get date range for search results
    getDateRange: db.prepare(`
      SELECT 
        MIN(ca.date) AS min_date,
        MAX(ca.date) AS max_date,
        COUNT(*) AS count
      FROM articles_fts
      JOIN content_analysis ca ON articles_fts.rowid = ca.id
      WHERE articles_fts MATCH ?
        AND ca.date IS NOT NULL
    `),

    // Update article with body_text, byline, authors
    updateArticleText: db.prepare(`
      UPDATE content_analysis
      SET body_text = ?,
          byline = ?,
          authors = ?
      WHERE id = ?
    `),

    // Get articles needing text backfill
    getArticlesNeedingBackfill: db.prepare(`
      SELECT 
        ca.id,
        ca.content_id,
        ca.analysis_json
      FROM content_analysis ca
      WHERE ca.body_text IS NULL
        AND ca.analysis_json IS NOT NULL
      LIMIT ?
    `),

    // Get FTS index statistics
    getFtsStats: db.prepare(`
      SELECT * FROM articles_fts_config
    `)
  };

  return {
    /**
     * Perform full-text search
     * @param {string} query - FTS5 MATCH query
     * @param {Object} options - Search options
     * @returns {Object} Search results with pagination info
     */
    search(query, { limit = 20, offset = 0, domain = null, startDate = null, endDate = null } = {}) {
      if (!query || typeof query !== 'string') {
        throw new Error('Search query is required');
      }

      // Escape special FTS5 characters if needed
      const safeQuery = sanitizeFtsQuery(query);

      let results;
      if (domain) {
        results = stmts.searchByDomain.all(safeQuery, domain, limit, offset);
      } else if (startDate && endDate) {
        results = stmts.searchByDateRange.all(safeQuery, startDate, endDate, limit, offset);
      } else {
        results = stmts.search.all(safeQuery, limit, offset);
      }

      // Get total count for pagination
      const totalRow = stmts.countMatches.get(safeQuery);
      const total = totalRow?.total || 0;

      return {
        results: results.map(row => ({
          ...row,
          authors: parseAuthorsJson(row.authors)
        })),
        total,
        limit,
        offset,
        hasMore: offset + results.length < total
      };
    },

    /**
     * Search specifically by author name
     * @param {string} authorName - Author name to search
     * @param {Object} options - Search options
     * @returns {Object} Search results
     */
    searchByAuthor(authorName, options = {}) {
      // Use FTS5 column filter for author-specific search
      const authorQuery = `authors:"${escapeQuotes(authorName)}" OR byline:"${escapeQuotes(authorName)}"`;
      return this.search(authorQuery, options);
    },

    /**
     * Get highlighted snippets for a search result
     * @param {string} query - Original search query
     * @param {number} articleId - Article ID
     * @returns {Object|null} Highlighted snippets
     */
    getHighlights(query, articleId) {
      const safeQuery = sanitizeFtsQuery(query);
      try {
        return stmts.getHighlightedSnippet.get(safeQuery, articleId);
      } catch (err) {
        // FTS5 highlight may fail if query doesn't match this specific article
        return null;
      }
    },

    /**
     * Get search result facets
     * @param {string} query - FTS5 MATCH query
     * @param {Object} options - Facet options
     * @returns {Object} Facets for domains, authors, date range
     */
    getFacets(query, { domainLimit = 10, authorLimit = 10 } = {}) {
      const safeQuery = sanitizeFtsQuery(query);
      
      const domains = stmts.getDomainFacets.all(safeQuery, domainLimit);
      const authors = stmts.getAuthorFacets.all(safeQuery, authorLimit);
      const dateRange = stmts.getDateRange.get(safeQuery);

      return {
        domains,
        authors,
        dateRange: dateRange || { min_date: null, max_date: null, count: 0 }
      };
    },

    /**
     * Get article by ID
     * @param {number} id - Article ID
     * @returns {Object|null} Article data
     */
    getArticleById(id) {
      const row = stmts.getArticleById.get(id);
      if (!row) return null;
      return {
        ...row,
        authors: parseAuthorsJson(row.authors)
      };
    },

    /**
     * Update article text fields (for backfill)
     * @param {number} id - Article ID
     * @param {Object} data - Update data
     * @returns {boolean} Success
     */
    updateArticleText(id, { body_text, byline, authors }) {
      const authorsJson = authors ? JSON.stringify(authors) : null;
      const result = stmts.updateArticleText.run(body_text, byline, authorsJson, id);
      return result.changes > 0;
    },

    /**
     * Get articles needing text backfill
     * @param {number} limit - Max articles to return
     * @returns {Array} Articles needing backfill
     */
    getArticlesNeedingBackfill(limit = 1000) {
      return stmts.getArticlesNeedingBackfill.all(limit);
    },

    /**
     * Rebuild the FTS index
     * @returns {void}
     */
    rebuildIndex() {
      db.exec(`INSERT INTO articles_fts(articles_fts) VALUES('rebuild')`);
    },

    /**
     * Optimize the FTS index
     * @returns {void}
     */
    optimizeIndex() {
      db.exec(`INSERT INTO articles_fts(articles_fts) VALUES('optimize')`);
    },

    /**
     * Get FTS index configuration
     * @returns {Array} Config rows
     */
    getIndexConfig() {
      try {
        return stmts.getFtsStats.all();
      } catch (_) {
        return [];
      }
    }
  };
}

/**
 * Sanitize FTS5 query to prevent syntax errors
 * @param {string} query - Raw query
 * @returns {string} Sanitized query
 */
function sanitizeFtsQuery(query) {
  if (!query) return '';
  
  // Trim and normalize whitespace
  let sanitized = query.trim().replace(/\s+/g, ' ');
  
  // Handle common user query patterns
  // Convert author:name to FTS5 column syntax
  sanitized = sanitized.replace(/\bauthor:(\S+)/gi, 'authors:$1 OR byline:$1');
  
  // Convert title:term to FTS5 column syntax  
  sanitized = sanitized.replace(/\btitle:(\S+)/gi, 'title:$1');
  
  // Escape unbalanced quotes
  const quoteCount = (sanitized.match(/"/g) || []).length;
  if (quoteCount % 2 !== 0) {
    sanitized = sanitized.replace(/"/g, '');
  }
  
  return sanitized;
}

/**
 * Escape quotes in a string for FTS5
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeQuotes(str) {
  if (!str) return '';
  return str.replace(/"/g, '""');
}

/**
 * Parse authors JSON array
 * @param {string|null} authorsJson - JSON string of authors
 * @returns {Array} Parsed authors array
 */
function parseAuthorsJson(authorsJson) {
  if (!authorsJson) return [];
  try {
    const parsed = JSON.parse(authorsJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

module.exports = {
  createSearchAdapter,
  sanitizeFtsQuery,
  BM25_WEIGHTS
};
