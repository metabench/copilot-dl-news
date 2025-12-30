'use strict';

/**
 * SearchService - Full-Text Search for Articles
 * 
 * Provides high-level search operations for articles using SQLite FTS5.
 * Features:
 *   - Full-text search with BM25 ranking
 *   - Query parsing (quoted phrases, boolean operators, field filters)
 *   - Author-specific search
 *   - Faceted filtering (domain, date range, author)
 *   - Result highlighting with <mark> tags
 *   - Performance metrics
 */

const { createSearchAdapter, BM25_WEIGHTS } = require('../db/sqlite/v1/queries/searchAdapter');

class SearchService {
  /**
   * Create a SearchService instance
   * @param {Database} db - better-sqlite3 database instance
   * @param {Object} options - Configuration options
   */
  constructor(db, options = {}) {
    if (!db || typeof db.prepare !== 'function') {
      throw new Error('SearchService requires a better-sqlite3 database handle');
    }

    this._db = db;
    this._adapter = createSearchAdapter(db);
    this._options = {
      defaultLimit: options.defaultLimit || 20,
      maxLimit: options.maxLimit || 100,
      highlightTag: options.highlightTag || 'mark',
      snippetLength: options.snippetLength || 64,
      ...options
    };
  }

  /**
   * Perform a full-text search
   * 
   * @param {string} query - Search query (supports FTS5 syntax)
   * @param {Object} options - Search options
   * @param {number} options.limit - Max results (default: 20)
   * @param {number} options.offset - Offset for pagination (default: 0)
   * @param {string} options.domain - Filter by domain
   * @param {string} options.startDate - Filter by start date (ISO format)
   * @param {string} options.endDate - Filter by end date (ISO format)
   * @param {boolean} options.includeHighlights - Include highlighted snippets (default: true)
   * @param {boolean} options.includeFacets - Include facet data (default: false)
   * @returns {Object} Search results
   */
  search(query, options = {}) {
    const startTime = Date.now();

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return this._emptyResult('Empty query');
    }

    const limit = Math.min(options.limit || this._options.defaultLimit, this._options.maxLimit);
    const offset = options.offset || 0;
    const includeHighlights = options.includeHighlights !== false;
    const includeFacets = options.includeFacets === true;

    try {
      // Parse query for any special syntax
      const parsedQuery = this._parseQuery(query);

      // Perform the search
      const searchResult = this._adapter.search(parsedQuery.ftsQuery, {
        limit,
        offset,
        domain: options.domain || parsedQuery.domain,
        startDate: options.startDate,
        endDate: options.endDate
      });

      // Add highlights if requested
      if (includeHighlights && searchResult.results.length > 0) {
        for (const result of searchResult.results) {
          const highlights = this._adapter.getHighlights(parsedQuery.ftsQuery, result.id);
          if (highlights) {
            result.highlights = {
              title: highlights.title_highlight || null,
              body: highlights.body_snippet || null,
              byline: highlights.byline_highlight || null,
              authors: highlights.authors_highlight || null
            };
          }
        }
      }

      // Add facets if requested
      let facets = null;
      if (includeFacets) {
        facets = this._adapter.getFacets(parsedQuery.ftsQuery);
      }

      const duration = Date.now() - startTime;

      return {
        success: true,
        query: query,
        parsedQuery: parsedQuery.ftsQuery,
        results: searchResult.results,
        pagination: {
          total: searchResult.total,
          limit: searchResult.limit,
          offset: searchResult.offset,
          hasMore: searchResult.hasMore,
          page: Math.floor(offset / limit) + 1,
          totalPages: Math.ceil(searchResult.total / limit)
        },
        facets,
        metrics: {
          durationMs: duration,
          resultsReturned: searchResult.results.length
        }
      };
    } catch (err) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        query: query,
        error: err.message,
        results: [],
        pagination: { total: 0, limit, offset, hasMore: false, page: 1, totalPages: 0 },
        facets: null,
        metrics: { durationMs: duration, resultsReturned: 0 }
      };
    }
  }

  /**
   * Search for articles by author name
   * 
   * @param {string} authorName - Author name to search
   * @param {Object} options - Search options
   * @returns {Object} Search results
   */
  searchByAuthor(authorName, options = {}) {
    if (!authorName || typeof authorName !== 'string') {
      return this._emptyResult('Invalid author name');
    }

    const startTime = Date.now();
    const limit = Math.min(options.limit || this._options.defaultLimit, this._options.maxLimit);
    const offset = options.offset || 0;

    try {
      const searchResult = this._adapter.searchByAuthor(authorName, { limit, offset });

      const duration = Date.now() - startTime;

      return {
        success: true,
        query: `author:${authorName}`,
        authorName,
        results: searchResult.results,
        pagination: {
          total: searchResult.total,
          limit: searchResult.limit,
          offset: searchResult.offset,
          hasMore: searchResult.hasMore,
          page: Math.floor(offset / limit) + 1,
          totalPages: Math.ceil(searchResult.total / limit)
        },
        metrics: {
          durationMs: duration,
          resultsReturned: searchResult.results.length
        }
      };
    } catch (err) {
      return {
        success: false,
        query: `author:${authorName}`,
        authorName,
        error: err.message,
        results: [],
        pagination: { total: 0, limit, offset, hasMore: false, page: 1, totalPages: 0 },
        metrics: { durationMs: Date.now() - startTime, resultsReturned: 0 }
      };
    }
  }

  /**
   * Get highlighted text for a specific article
   * 
   * @param {string} text - Text to highlight
   * @param {string} query - Search query for highlighting
   * @param {Object} options - Highlight options
   * @returns {string} Text with <mark> tags around matched terms
   */
  highlight(text, query, options = {}) {
    if (!text || !query) {
      return text || '';
    }

    const tag = options.tag || this._options.highlightTag;
    const openTag = `<${tag}>`;
    const closeTag = `</${tag}>`;

    // Extract terms from the query (basic term extraction)
    const terms = this._extractSearchTerms(query);
    if (terms.length === 0) {
      return text;
    }

    // Build regex pattern for all terms
    const pattern = terms
      .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    
    const regex = new RegExp(`(${pattern})`, 'gi');
    
    return text.replace(regex, `${openTag}$1${closeTag}`);
  }

  /**
   * Get search result facets without full results
   * 
   * @param {string} query - Search query
   * @param {Object} options - Facet options
   * @returns {Object} Facets for filtering
   */
  getFacets(query, options = {}) {
    if (!query || typeof query !== 'string') {
      return { domains: [], authors: [], dateRange: { min_date: null, max_date: null, count: 0 } };
    }

    try {
      const parsedQuery = this._parseQuery(query);
      return this._adapter.getFacets(parsedQuery.ftsQuery, options);
    } catch (_) {
      return { domains: [], authors: [], dateRange: { min_date: null, max_date: null, count: 0 } };
    }
  }

  /**
   * Get a single article by ID
   * 
   * @param {number} id - Article ID
   * @returns {Object|null} Article data or null
   */
  getArticle(id) {
    return this._adapter.getArticleById(id);
  }

  /**
   * Rebuild the search index
   * @returns {Object} Result with timing
   */
  rebuildIndex() {
    const startTime = Date.now();
    this._adapter.rebuildIndex();
    return {
      success: true,
      operation: 'rebuild',
      durationMs: Date.now() - startTime
    };
  }

  /**
   * Optimize the search index
   * @returns {Object} Result with timing
   */
  optimizeIndex() {
    const startTime = Date.now();
    this._adapter.optimizeIndex();
    return {
      success: true,
      operation: 'optimize',
      durationMs: Date.now() - startTime
    };
  }

  /**
   * Get index statistics
   * @returns {Object} Index config and stats
   */
  getIndexStats() {
    const config = this._adapter.getIndexConfig();
    const needsBackfill = this._adapter.getArticlesNeedingBackfill(1);
    return {
      config,
      needsBackfill: needsBackfill.length > 0,
      weights: BM25_WEIGHTS
    };
  }

  // --- Private methods ---

  /**
   * Parse a user query into FTS5 query syntax
   * @param {string} query - User query
   * @returns {Object} Parsed query with FTS syntax and extracted filters
   */
  _parseQuery(query) {
    let ftsQuery = query.trim();
    let domain = null;
    let author = null;

    // Extract domain: filter
    const domainMatch = ftsQuery.match(/\bdomain:(\S+)/i);
    if (domainMatch) {
      domain = domainMatch[1];
      ftsQuery = ftsQuery.replace(domainMatch[0], '').trim();
    }

    // Extract author: filter and convert to FTS5 column syntax
    const authorMatch = ftsQuery.match(/\bauthor:["']?([^"'\s]+(?:\s+[^"'\s]+)*)["']?/i);
    if (authorMatch) {
      author = authorMatch[1];
      ftsQuery = ftsQuery.replace(authorMatch[0], '').trim();
      // Add author search to FTS query
      if (ftsQuery) {
        ftsQuery = `${ftsQuery} AND (authors:"${author}" OR byline:"${author}")`;
      } else {
        ftsQuery = `authors:"${author}" OR byline:"${author}"`;
      }
    }

    // Handle empty query after filter extraction
    if (!ftsQuery) {
      ftsQuery = '*'; // Match all
    }

    return {
      original: query,
      ftsQuery,
      domain,
      author
    };
  }

  /**
   * Extract search terms from a query for highlighting
   * @param {string} query - Search query
   * @returns {Array<string>} Search terms
   */
  _extractSearchTerms(query) {
    if (!query) return [];

    const terms = [];
    
    // Extract quoted phrases
    const phraseRegex = /"([^"]+)"/g;
    let match;
    while ((match = phraseRegex.exec(query)) !== null) {
      terms.push(match[1]);
    }

    // Extract remaining words (excluding operators and filters)
    const withoutPhrases = query.replace(/"[^"]+"/g, '');
    const words = withoutPhrases
      .split(/\s+/)
      .filter(word => {
        // Skip operators and filters
        if (!word) return false;
        if (/^(AND|OR|NOT)$/i.test(word)) return false;
        if (/^(author|domain|title):/.test(word)) return false;
        return true;
      });
    
    terms.push(...words);
    
    return terms.filter(t => t.length > 0);
  }

  /**
   * Create an empty result object
   * @param {string} reason - Reason for empty result
   * @returns {Object} Empty result structure
   */
  _emptyResult(reason) {
    return {
      success: false,
      error: reason,
      query: null,
      results: [],
      pagination: { total: 0, limit: 0, offset: 0, hasMore: false, page: 0, totalPages: 0 },
      facets: null,
      metrics: { durationMs: 0, resultsReturned: 0 }
    };
  }
}

module.exports = { SearchService };
