/**
 * URL Resolution Utility for Database Normalization
 *
 * Provides utilities to resolve URLs to normalized url_id references
 * in the urls table, supporting both individual and batch operations.
 *
 * Used during database normalization to migrate tables from storing
 * URLs directly to using url_id foreign key references.
 */

const { ensureDb } = require('../../data/db/sqlite/ensureDb');
// c219: url-row creation is delegated to ncdb's ensureUrlId. This class used
// to write `INSERT OR IGNORE INTO urls (url, created_at)` — no host, no
// last_seen_at — while HttpRequestResponseFacade wrote host and last_seen_at
// for the same table. Eight different insert shapes exist across the two
// repos, and the live db carries 91,013 host-less url rows (4.9% of
// 1,867,208). Which writer made which row is not determinable, so no cause is
// claimed; what is fixed is that this repo's writers now agree.
const { ensureUrlId } = require('news-crawler-db');

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
    // c219: the insert/select pair that used to live here is ncdb's
    // ensureUrlId, which caches its own statements per-connection. Nothing to
    // prepare on this side any more.
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

    // c219: delegated. ncdb derives + lowercases the host, sets created_at
    // and last_seen_at, and backfills host on a row that predates this fix
    // (the 91,013 already in production) instead of duplicating it.
    const id = ensureUrlId(this.db, url);
    if (id == null) {
      throw new Error(`Failed to resolve URL ID for: ${url}`);
    }

    return id;
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

    // c219: this was one multi-row `INSERT OR IGNORE ... VALUES (?,?),(?,?)…`
    // plus a fallback for SQLite's variable limit plus a second batched
    // SELECT to read the ids back. All three are gone: ensureUrlId caches its
    // statements per-connection, so a loop is fast, and it removes the
    // variable-limit failure mode entirely rather than catching it. Wrapped in
    // one transaction so a 54,485-row migration batch stays a single commit.
    const result = new Map();
    const resolveAll = () => {
      for (const url of uniqueUrls) {
        try {
          const id = ensureUrlId(this.db, url);
          if (id != null) result.set(url, id);
        } catch (error) {
          // One bad url must not abort a migration batch — the old code had
          // the same tolerance via its per-url fallback.
          console.warn(`Failed to resolve URL: ${url}`, error.message);
        }
      }
    };

    if (typeof this.db.transaction === 'function') {
      this.db.transaction(resolveAll)();
    } else {
      resolveAll();
    }

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