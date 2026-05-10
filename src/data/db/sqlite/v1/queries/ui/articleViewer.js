'use strict';

/**
 * Article Viewer Queries
 * 
 * Provides queries for the article viewer UI, including:
 * - Article list with pagination
 * - Article detail with stored content
 * - Content decompression
 * 
 * @module articleViewer
 */

const { decompress } = require('../../../../../../shared/utils/compression');
const { HtmlArticleExtractor } = require('../../../../../../shared/utils/HtmlArticleExtractor');

// Shared extractor instance
const extractor = new HtmlArticleExtractor({ minWordCount: 20 });

/**
 * Get article content by fetch ID (http_response_id)
 * Returns metadata plus raw HTML for re-rendering
 * 
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} fetchId - http_response_id
 * @returns {Object|null} Article data with HTML content
 */
function getArticleContentByFetchId(db, fetchId) {
  const row = db.prepare(`
    SELECT 
      u.id AS url_id,
      u.url,
      u.host,
      u.canonical_url,
      hr.id AS fetch_id,
      hr.fetched_at,
      hr.http_status,
      hr.content_type,
      hr.bytes_downloaded,
      ca.id AS analysis_id,
      ca.title,
      ca.date AS published_date,
      ca.section,
      ca.word_count,
      ca.byline,
      ca.authors,
      ca.language,
      ca.classification,
      ca.confidence_score,
      ca.body_text,
      ca.analysis_json,
      cs.id AS storage_id,
      cs.content_blob,
      cs.compression_type_id,
      cs.uncompressed_size,
      ct.algorithm AS compression_algorithm
    FROM http_responses hr
    JOIN urls u ON u.id = hr.url_id
    JOIN content_storage cs ON cs.http_response_id = hr.id
    LEFT JOIN content_analysis ca ON ca.content_id = cs.id
    LEFT JOIN compression_types ct ON ct.id = cs.compression_type_id
    WHERE hr.id = ?
    LIMIT 1
  `).get(fetchId);

  if (!row) return null;

  return {
    urlId: row.url_id,
    url: row.url,
    host: row.host,
    canonicalUrl: row.canonical_url,
    fetchId: row.fetch_id,
    fetchedAt: row.fetched_at,
    httpStatus: row.http_status,
    contentType: row.content_type,
    bytesDownloaded: row.bytes_downloaded,
    analysisId: row.analysis_id,
    title: row.title,
    publishedDate: row.published_date,
    section: row.section,
    wordCount: row.word_count,
    byline: row.byline,
    authors: row.authors,
    language: row.language,
    classification: row.classification,
    confidenceScore: row.confidence_score,
    bodyText: row.body_text,
    analysisJson: row.analysis_json ? JSON.parse(row.analysis_json) : null,
    storageId: row.storage_id,
    contentBlob: row.content_blob,
    compressionAlgorithm: row.compression_algorithm,
    uncompressedSize: row.uncompressed_size
  };
}

/**
 * Get article content by URL ID
 * Returns the most recent fetch for the URL
 * 
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} urlId - URL ID
 * @returns {Object|null} Article data with HTML content
 */
function getArticleContentByUrlId(db, urlId) {
  const row = db.prepare(`
    SELECT 
      u.id AS url_id,
      u.url,
      u.host,
      u.canonical_url,
      hr.id AS fetch_id,
      hr.fetched_at,
      hr.http_status,
      hr.content_type,
      hr.bytes_downloaded,
      ca.id AS analysis_id,
      ca.title,
      ca.date AS published_date,
      ca.section,
      ca.word_count,
      ca.byline,
      ca.authors,
      ca.language,
      ca.classification,
      ca.confidence_score,
      ca.body_text,
      ca.analysis_json,
      cs.id AS storage_id,
      cs.content_blob,
      cs.compression_type_id,
      cs.uncompressed_size,
      ct.algorithm AS compression_algorithm
    FROM urls u
    JOIN http_responses hr ON hr.url_id = u.id
    JOIN content_storage cs ON cs.http_response_id = hr.id
    LEFT JOIN content_analysis ca ON ca.content_id = cs.id
    LEFT JOIN compression_types ct ON ct.id = cs.compression_type_id
    WHERE u.id = ? AND hr.http_status = 200
    ORDER BY hr.fetched_at DESC
    LIMIT 1
  `).get(urlId);

  if (!row) return null;

  return {
    urlId: row.url_id,
    url: row.url,
    host: row.host,
    canonicalUrl: row.canonical_url,
    fetchId: row.fetch_id,
    fetchedAt: row.fetched_at,
    httpStatus: row.http_status,
    contentType: row.content_type,
    bytesDownloaded: row.bytes_downloaded,
    analysisId: row.analysis_id,
    title: row.title,
    publishedDate: row.published_date,
    section: row.section,
    wordCount: row.word_count,
    byline: row.byline,
    authors: row.authors,
    language: row.language,
    classification: row.classification,
    confidenceScore: row.confidence_score,
    bodyText: row.body_text,
    analysisJson: row.analysis_json ? JSON.parse(row.analysis_json) : null,
    storageId: row.storage_id,
    contentBlob: row.content_blob,
    compressionAlgorithm: row.compression_algorithm,
    uncompressedSize: row.uncompressed_size
  };
}

/**
 * Decompress stored HTML content
 * 
 * @param {Buffer} contentBlob - Compressed content blob
 * @param {string} algorithm - Compression algorithm (brotli, gzip, zstd, none)
 * @returns {string|null} Decompressed HTML string
 */
function decompressContent(contentBlob, algorithm = 'none') {
  if (!contentBlob) return null;

  try {
    const decompressed = decompress(contentBlob, algorithm);
    return decompressed.toString('utf-8');
  } catch (err) {
    console.error('Decompression error:', err.message);
    return null;
  }
}

/**
 * Extract article content from HTML using Readability
 * Returns clean text, title, byline, etc.
 * 
 * @param {string} html - Raw HTML content
 * @param {string} url - Source URL for context
 * @returns {Object} Extraction result with success flag
 */
function extractArticleFromHtml(html, url) {
  return extractor.extract(html, url);
}

/**
 * Get fully extracted article by fetch ID
 * Combines database metadata with fresh Readability extraction
 * 
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} fetchId - http_response_id
 * @returns {Object|null} Complete article with extracted content
 */
function getExtractedArticle(db, fetchId) {
  const article = getArticleContentByFetchId(db, fetchId);
  if (!article) return null;

  // Decompress the stored HTML
  const html = decompressContent(article.contentBlob, article.compressionAlgorithm);
  if (!html) {
    return {
      ...article,
      extraction: { success: false, error: 'Failed to decompress content' },
      html: null
    };
  }

  // Extract article content
  const extraction = extractArticleFromHtml(html, article.url);

  return {
    ...article,
    extraction,
    html,
    contentBlob: undefined  // Don't return the raw blob
  };
}

/**
 * Get fully extracted article by URL ID
 * Uses most recent successful fetch
 * 
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} urlId - URL ID
 * @returns {Object|null} Complete article with extracted content
 */
function getExtractedArticleByUrlId(db, urlId) {
  const article = getArticleContentByUrlId(db, urlId);
  if (!article) return null;

  // Decompress the stored HTML
  const html = decompressContent(article.contentBlob, article.compressionAlgorithm);
  if (!html) {
    return {
      ...article,
      extraction: { success: false, error: 'Failed to decompress content' },
      html: null
    };
  }

  // Extract article content
  const extraction = extractArticleFromHtml(html, article.url);

  return {
    ...article,
    extraction,
    html,
    contentBlob: undefined  // Don't return the raw blob
  };
}

/**
 * List articles with content available for viewing
 * 
 * @param {Database} db - better-sqlite3 database instance
 * @param {Object} options - Pagination and filtering options
 * @returns {Array} List of articles with metadata
 */
function listArticlesWithContent(db, options = {}) {
  const {
    limit = 50,
    offset = 0,
    host = null,
    classification = null,
    minConfidence = null,
    search = null,
    sortBy = 'fetched_at',
    sortDir = 'DESC'
  } = options;

  // Build WHERE clauses
  const whereClauses = ['hr.http_status = 200', 'cs.content_blob IS NOT NULL'];
  const params = [];

  if (host) {
    whereClauses.push('u.host = ?');
    params.push(host);
  }

  if (classification) {
    whereClauses.push('ca.classification = ?');
    params.push(classification);
  }

  if (minConfidence != null) {
    whereClauses.push('ca.confidence_score >= ?');
    params.push(minConfidence);
  }

  if (search) {
    whereClauses.push('(ca.title LIKE ? OR u.url LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  // Validate sort column
  const validSortColumns = ['fetched_at', 'title', 'word_count', 'confidence_score', 'host'];
  const safeSort = validSortColumns.includes(sortBy) ? sortBy : 'fetched_at';
  const safeSortDir = sortDir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  // Map sort column to actual table column
  const sortColumnMap = {
    fetched_at: 'hr.fetched_at',
    title: 'ca.title',
    word_count: 'ca.word_count',
    confidence_score: 'ca.confidence_score',
    host: 'u.host'
  };

  const sql = `
    SELECT 
      u.id AS url_id,
      u.url,
      u.host,
      hr.id AS fetch_id,
      hr.fetched_at,
      ca.title,
      ca.date AS published_date,
      ca.section,
      ca.word_count,
      ca.byline,
      ca.classification,
      ca.confidence_score,
      cs.uncompressed_size
    FROM urls u
    JOIN http_responses hr ON hr.url_id = u.id
    JOIN content_storage cs ON cs.http_response_id = hr.id
    LEFT JOIN content_analysis ca ON ca.content_id = cs.id
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY ${sortColumnMap[safeSort]} ${safeSortDir}
    LIMIT ? OFFSET ?
  `;

  params.push(limit, offset);
  return db.prepare(sql).all(...params);
}

/**
 * Count articles with content available for viewing
 * 
 * @param {Database} db - better-sqlite3 database instance
 * @param {Object} options - Filtering options
 * @returns {number} Total count
 */
function countArticlesWithContent(db, options = {}) {
  const { host = null, classification = null, minConfidence = null, search = null } = options;

  const whereClauses = ['hr.http_status = 200', 'cs.content_blob IS NOT NULL'];
  const params = [];

  if (host) {
    whereClauses.push('u.host = ?');
    params.push(host);
  }

  if (classification) {
    whereClauses.push('ca.classification = ?');
    params.push(classification);
  }

  if (minConfidence != null) {
    whereClauses.push('ca.confidence_score >= ?');
    params.push(minConfidence);
  }

  if (search) {
    whereClauses.push('(ca.title LIKE ? OR u.url LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const sql = `
    SELECT COUNT(*) AS total
    FROM urls u
    JOIN http_responses hr ON hr.url_id = u.id
    JOIN content_storage cs ON cs.http_response_id = hr.id
    LEFT JOIN content_analysis ca ON ca.content_id = cs.id
    WHERE ${whereClauses.join(' AND ')}
  `;

  const row = db.prepare(sql).get(...params);
  return row ? row.total : 0;
}

module.exports = {
  getArticleContentByFetchId,
  getArticleContentByUrlId,
  decompressContent,
  extractArticleFromHtml,
  getExtractedArticle,
  getExtractedArticleByUrlId,
  listArticlesWithContent,
  countArticlesWithContent
};
