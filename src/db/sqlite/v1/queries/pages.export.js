/**
 * Pages export queries
 *
 * Provides functions for exporting pages data.
 */

/**
 * Check if table exists
 * @param {import('better-sqlite3').Database} db
 * @param {string} tableName
 * @returns {boolean}
 */
function tableExists(db, tableName) {
  const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?");
  return !!stmt.get(tableName);
}

/**
 * Get total count for a table
 * @param {import('better-sqlite3').Database} db
 * @param {string} tableName
 * @returns {number}
 */
function getTableCount(db, tableName) {
  const stmt = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`);
  return stmt.get().count;
}

/**
 * Get total articles count
 * @param {import('better-sqlite3').Database} db
 * @returns {number}
 */
function getTotalArticlesCount(db) {
  const stmt = db.prepare(`
    SELECT COUNT(*) as count
    FROM urls u
    INNER JOIN http_responses hr ON hr.url_id = u.id
    INNER JOIN content_storage cs ON cs.http_response_id = hr.id
    WHERE hr.http_status = 200 AND cs.content_blob IS NOT NULL
  `);
  return stmt.get().count;
}

/**
 * Get articles query for export
 * @returns {string}
 */
function getArticlesQuery() {
  return `
    SELECT DISTINCT
      u.id,
      u.url,
      u.canonical_url,
      u.host,
      ca.title,
      ca.date,
      ca.section,
      cs.content_blob AS html,
      ct.algorithm AS compression_algorithm,
      hr.fetched_at AS crawled_at
    FROM urls u
    INNER JOIN http_responses hr ON hr.url_id = u.id
    INNER JOIN content_storage cs ON cs.http_response_id = hr.id
    INNER JOIN compression_types ct ON cs.compression_type_id = ct.id
    INNER JOIN content_analysis ca ON ca.content_id = cs.id
    INNER JOIN (
      SELECT u2.url, MAX(hr2.fetched_at) as max_crawled
      FROM urls u2
      INNER JOIN http_responses hr2 ON hr2.url_id = u2.id
      INNER JOIN content_storage cs2 ON cs2.http_response_id = hr2.id
      WHERE hr2.http_status = 200 AND cs2.content_blob IS NOT NULL
      GROUP BY u2.url
    ) latest ON u.url = latest.url AND hr.fetched_at = latest.max_crawled
    WHERE hr.http_status = 200 AND cs.content_blob IS NOT NULL
    ORDER BY hr.fetched_at DESC
  `;
}

/**
 * Get articles chunk
 * @param {import('better-sqlite3').Database} db
 * @param {number} offset
 * @param {number} chunkSize
 * @returns {Array}
 */
function getArticlesChunk(db, offset, chunkSize) {
  const query = getArticlesQuery() + ` LIMIT ${chunkSize} OFFSET ${offset}`;
  return db.prepare(query).all();
}

/**
 * Get count from a custom query
 * @param {import('better-sqlite3').Database} db
 * @param {string} query
 * @returns {number}
 */
function getQueryCount(db, query) {
  const stmt = db.prepare(query);
  return stmt.get().count;
}

/**
 * Insert compression type
 * @param {import('better-sqlite3').Database} db
 * @param {Object} compressionType
 * @returns {number} Inserted ID
 */
function insertCompressionType(db, compressionType) {
  const stmt = db.prepare(`
    INSERT INTO compression_types (name, level, window_bits)
    VALUES (?, ?, ?)
  `);
  const result = stmt.run(compressionType.name, compressionType.level, compressionType.window_bits);
  return result.lastInsertRowid;
}

/**
 * Get last insert rowid
 * @param {import('better-sqlite3').Database} db
 * @returns {number}
 */
function getLastInsertRowid(db) {
  const stmt = db.prepare('SELECT last_insert_rowid() as id');
  return stmt.get().id;
}

/**
 * Insert article
 * @param {import('better-sqlite3').Database} db
 * @param {Object} article
 * @param {Object} options
 */
function insertArticle(db, article, options = {}) {
  const { extractionMode = 'raw', compressionMethod = 'none' } = options;

  const columns = ['url', 'canonical_url', 'host', 'title', 'date', 'section', 'html', 'crawled_at'];
  const values = [article.url, article.canonical_url, article.host, article.title, article.date, article.section, article.html, article.crawled_at];

  if (extractionMode === 'article-plus') {
    columns.push('extracted_text', 'word_count', 'metadata', 'extraction_success');
    values.push(article.extracted_text, article.word_count, article.metadata, article.extraction_success);
  }

  if (compressionMethod !== 'none') {
    columns.push('compressed_html', 'compression_type_id', 'original_size', 'compressed_size', 'compression_ratio');
    values.push(article.compressed_html, article.compression_type_id, article.original_size, article.compressed_size, article.compression_ratio);
  }

  const placeholders = values.map(() => '?').join(', ');
  const stmt = db.prepare(`INSERT INTO articles (${columns.join(', ')}) VALUES (${placeholders})`);
  stmt.run(...values);
}

/**
 * Get exported articles count
 * @param {import('better-sqlite3').Database} db
 * @returns {number}
 */
function getExportedArticlesCount(db) {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM articles');
  return stmt.get().count;
}

/**
 * Get extraction stats
 * @param {import('better-sqlite3').Database} db
 * @returns {Object}
 */
function getExtractionStats(db) {
  const stmt = db.prepare(`
    SELECT
      COUNT(*) as total_articles,
      SUM(CASE WHEN extraction_success = 1 THEN 1 ELSE 0 END) as successful_extractions,
      AVG(word_count) as avg_word_count,
      SUM(word_count) as total_words
    FROM articles
    WHERE extraction_success IS NOT NULL
  `);
  return stmt.get();
}

/**
 * Get compression stats
 * @param {import('better-sqlite3').Database} db
 * @returns {Object}
 */
function getCompressionStats(db) {
  const stmt = db.prepare(`
    SELECT
      AVG(compression_ratio) as avg_ratio,
      MIN(compression_ratio) as min_ratio,
      MAX(compression_ratio) as max_ratio,
      SUM(original_size) as total_original,
      SUM(compressed_size) as total_compressed
    FROM articles
    WHERE compressed_html IS NOT NULL
  `);
  return stmt.get();
}

module.exports = {
  tableExists,
  getTableCount,
  getQueryCount,
  getTotalArticlesCount,
  getArticlesQuery,
  getArticlesChunk,
  insertCompressionType,
  getLastInsertRowid,
  insertArticle,
  getExportedArticlesCount,
  getExtractionStats,
  getCompressionStats
};