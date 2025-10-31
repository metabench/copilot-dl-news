/**
 * URL Resolution Utility for Database Normalization
 *
 * Provides utilities to resolve URLs to normalized url_id references
 * in the urls table, supporting both individual and batch operations.
 *
 * Used during database normalization to migrate tables from storing
 * URLs directly to using url_id foreign key references.
 */

const { ensureDb } = require('../db/sqlite/ensureDb');

class UrlResolver {
  /**
   * Create a new URL resolver instance
   * @param {Database} db - SQLite database connection
   */
  constructor(db) {
    this.db = db;
    this._initStatements();
  }

  /**
   * Initialize prepared statements for performance
   * @private
   */
  _initStatements() {
    // Insert URL if it doesn't exist
    this.ensureUrlStmt = this.db.prepare(`
      INSERT OR IGNORE INTO urls (url, created_at)
      VALUES (?, datetime('now'))
    `);

    // Get URL ID by URL string
    this.getUrlIdStmt = this.db.prepare('SELECT id FROM urls WHERE url = ?');

    // Batch insert URLs
    this.batchInsertStmt = null; // Created dynamically for each batch

    // Get multiple URL IDs
    this.batchGetStmt = null; // Created dynamically for each batch
  }

  /**
   * Ensure a URL exists in the urls table and return its ID
   * @param {string} url - The URL to resolve
   * @returns {number} The url_id for the URL
   */
  ensureUrlId(url) {
    if (!url || typeof url !== 'string') {
      throw new Error('URL must be a non-empty string');
    }

    // Insert if not exists (INSERT OR IGNORE)
    this.ensureUrlStmt.run(url);

    // Get the ID
    const row = this.getUrlIdStmt.get(url);
    if (!row) {
      throw new Error(`Failed to resolve URL ID for: ${url}`);
    }

    return row.id;
  }

  /**
   * Batch resolve multiple URLs to their IDs
   * @param {string[]} urls - Array of URLs to resolve
   * @returns {Map<string, number>} Map of URL -> url_id
   */
  batchResolve(urls) {
    if (!Array.isArray(urls)) {
      throw new Error('URLs must be an array');
    }

    const uniqueUrls = [...new Set(urls.filter(url => url && typeof url === 'string'))];
    if (uniqueUrls.length === 0) {
      return new Map();
    }

    // Batch insert all URLs
    const placeholders = uniqueUrls.map(() => '(?, datetime(\'now\'))').join(', ');
    const insertSql = `INSERT OR IGNORE INTO urls (url, created_at) VALUES ${placeholders}`;

    try {
      this.db.prepare(insertSql).run(...uniqueUrls);
    } catch (error) {
      // If batch insert fails due to SQL parameter limits, fall back to individual inserts
      if (error.message.includes('too many SQL variables') || uniqueUrls.length > 500) {
        console.warn('Batch insert failed, falling back to individual inserts');
        for (const url of uniqueUrls) {
          try {
            this.ensureUrlStmt.run(url);
          } catch (insertError) {
            console.warn(`Failed to insert URL: ${url}`, insertError.message);
          }
        }
      } else {
        throw error;
      }
    }

    // Batch select all IDs
    const selectPlaceholders = uniqueUrls.map(() => '?').join(', ');
    const selectSql = `SELECT id, url FROM urls WHERE url IN (${selectPlaceholders})`;

    const rows = this.db.prepare(selectSql).all(...uniqueUrls);

    // Build result map
    const result = new Map();
    for (const row of rows) {
      result.set(row.url, row.id);
    }

    // Check for any missing URLs
    const missingUrls = uniqueUrls.filter(url => !result.has(url));
    if (missingUrls.length > 0) {
      console.warn(`Failed to resolve IDs for ${missingUrls.length} URLs:`, missingUrls.slice(0, 5));
    }

    return result;
  }

  /**
   * Get URL string by ID
   * @param {number} urlId - The URL ID to resolve
   * @returns {string|null} The URL string or null if not found
   */
  getUrlById(urlId) {
    const row = this.db.prepare('SELECT url FROM urls WHERE id = ?').get(urlId);
    return row ? row.url : null;
  }

  /**
   * Validate that all URL IDs in a result map are valid
   * @param {Map<string, number>} urlMap - Map of URL -> url_id
   * @returns {Object} Validation results
   */
  validateUrlMap(urlMap) {
    const errors = [];
    const validCount = 0;
    const invalidCount = 0;

    for (const [url, urlId] of urlMap) {
      if (typeof urlId !== 'number' || urlId <= 0) {
        errors.push(`Invalid url_id for URL: ${url} (got: ${urlId})`);
        invalidCount++;
      } else {
        // Spot check a few URLs to ensure they exist
        const actualUrl = this.getUrlById(urlId);
        if (actualUrl !== url) {
          errors.push(`URL mismatch for ID ${urlId}: expected "${url}", got "${actualUrl}"`);
          invalidCount++;
        } else {
          validCount++;
        }
      }
    }

    return {
      valid: errors.length === 0,
      validCount,
      invalidCount,
      errors
    };
  }

  /**
   * Get statistics about URL resolution
   * @returns {Object} Statistics about the urls table
   */
  getStats() {
    const totalUrls = this.db.prepare('SELECT COUNT(*) as count FROM urls').get().count;
    const recentUrls = this.db.prepare('SELECT COUNT(*) as count FROM urls WHERE created_at >= datetime(\'now\', \'-1 day\')').get().count;

    return {
      totalUrls,
      recentUrls,
      urlsTableExists: true
    };
  }
}

/**
 * Create a URL resolver with a new database connection
 * @param {string} dbPath - Path to the database file
 * @returns {UrlResolver} New URL resolver instance
 */
function createUrlResolver(dbPath) {
  const db = ensureDb(dbPath);
  return new UrlResolver(db);
}

/**
 * Utility function to chunk arrays for batch processing
 * @param {Array} array - Array to chunk
 * @param {number} size - Chunk size
 * @returns {Array[]} Array of chunks
 */
function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

module.exports = {
  UrlResolver,
  createUrlResolver,
  chunkArray
};