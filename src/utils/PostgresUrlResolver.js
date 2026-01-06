/**
 * Postgres URL Resolution Utility
 *
 * Provides utilities to resolve URLs to normalized url_id references
 * in the urls table, supporting both individual and batch operations.
 */

class PostgresUrlResolver {
  /**
   * Create a new URL resolver instance
   * @param {Pool} pool - Postgres connection pool
   */
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Ensure a URL exists in the urls table and return its ID
   * @param {string} url - The URL to resolve
   * @returns {Promise<number>} The url_id for the URL
   */
  async ensureUrlId(url) {
    if (!url || typeof url !== 'string') {
      throw new Error('URL must be a non-empty string');
    }

    const client = await this.pool.connect();
    try {
      // Try to insert and return ID
      const insertRes = await client.query(`
        INSERT INTO urls (url, created_at)
        VALUES ($1, NOW())
        ON CONFLICT (url) DO UPDATE SET last_seen_at = NOW()
        RETURNING id
      `, [url]);

      if (insertRes.rows.length > 0) {
        return insertRes.rows[0].id;
      }

      // If insert didn't return (e.g. race condition or DO NOTHING behavior if I used that), fetch it
      const fetchRes = await client.query('SELECT id FROM urls WHERE url = $1', [url]);
      if (fetchRes.rows.length === 0) {
        throw new Error(`Failed to resolve URL ID for: ${url}`);
      }
      return fetchRes.rows[0].id;
    } finally {
      client.release();
    }
  }

  /**
   * Batch resolve multiple URLs to their IDs
   * @param {string[]} urls - Array of URLs to resolve
   * @returns {Promise<Map<string, number>>} Map of URL -> url_id
   */
  async batchResolve(urls) {
    if (!Array.isArray(urls)) {
      throw new Error('URLs must be an array');
    }

    const uniqueUrls = [...new Set(urls.filter(url => url && typeof url === 'string'))];
    if (uniqueUrls.length === 0) {
      return new Map();
    }

    const client = await this.pool.connect();
    try {
      // Postgres doesn't have a hard limit on params like SQLite, but let's be safe and chunk if huge
      // For now, assuming reasonable batch sizes or relying on pg's handling.
      // Actually, let's use UNNEST for bulk insert which is very efficient in PG.

      await client.query(`
        INSERT INTO urls (url, created_at)
        SELECT u, NOW()
        FROM UNNEST($1::text[]) AS u
        ON CONFLICT (url) DO NOTHING
      `, [uniqueUrls]);

      // Now select them all back
      const res = await client.query(`
        SELECT id, url FROM urls WHERE url = ANY($1::text[])
      `, [uniqueUrls]);

      const result = new Map();
      for (const row of res.rows) {
        result.set(row.url, row.id);
      }

      const missingUrls = uniqueUrls.filter(url => !result.has(url));
      if (missingUrls.length > 0) {
        console.warn(`Failed to resolve IDs for ${missingUrls.length} URLs:`, missingUrls.slice(0, 5));
      }

      return result;
    } finally {
      client.release();
    }
  }

  /**
   * Get URL string by ID
   * @param {number} urlId - The URL ID to resolve
   * @returns {Promise<string|null>} The URL string or null if not found
   */
  async getUrlById(urlId) {
    const res = await this.pool.query('SELECT url FROM urls WHERE id = $1', [urlId]);
    return res.rows[0] ? res.rows[0].url : null;
  }

  /**
   * Validate that all URL IDs in a result map are valid
   * @param {Map<string, number>} urlMap - Map of URL -> url_id
   * @returns {Promise<Object>} Validation results
   */
  async validateUrlMap(urlMap) {
    const errors = [];
    let validCount = 0;
    let invalidCount = 0;

    for (const [url, urlId] of urlMap) {
      if (typeof urlId !== 'number' || urlId <= 0) {
        errors.push(`Invalid url_id for URL: ${url} (got: ${urlId})`);
        invalidCount++;
      } else {
        const actualUrl = await this.getUrlById(urlId);
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
   * @returns {Promise<Object>} Statistics about the urls table
   */
  async getStats() {
    const totalRes = await this.pool.query('SELECT COUNT(*) as count FROM urls');
    const recentRes = await this.pool.query("SELECT COUNT(*) as count FROM urls WHERE created_at >= NOW() - INTERVAL '1 day'");

    return {
      totalUrls: parseInt(totalRes.rows[0].count, 10),
      recentUrls: parseInt(recentRes.rows[0].count, 10),
      urlsTableExists: true
    };
  }
}

module.exports = { PostgresUrlResolver };
