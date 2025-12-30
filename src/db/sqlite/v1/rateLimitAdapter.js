'use strict';

/**
 * Rate Limit Adapter (Stub)
 * 
 * Provides database persistence for rate limit tracking data.
 * This is a stub implementation - the actual table and queries
 * need to be created when this feature is fully implemented.
 * 
 * Expected table schema:
 * 
 * CREATE TABLE IF NOT EXISTS rate_limits (
 *   id INTEGER PRIMARY KEY AUTOINCREMENT,
 *   domain TEXT UNIQUE NOT NULL,
 *   interval_ms INTEGER NOT NULL DEFAULT 1000,
 *   rate_limit_hits INTEGER NOT NULL DEFAULT 0,
 *   last_hit_at TEXT,
 *   created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 *   updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
 * );
 * 
 * CREATE INDEX IF NOT EXISTS idx_rate_limits_domain ON rate_limits(domain);
 */

/**
 * Create a rate limit adapter for a database connection
 * @param {Object} db - Database connection (better-sqlite3 instance)
 * @returns {Object} - Rate limit adapter
 */
function createRateLimitAdapter(db) {
  // Check if table exists (stub check)
  const tableExists = () => {
    try {
      const result = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='rate_limits'"
      ).get();
      return !!result;
    } catch {
      return false;
    }
  };

  return {
    /**
     * Save or update rate limit for a domain
     * @param {string} domain - Domain name
     * @param {number} intervalMs - Current interval in milliseconds
     * @param {number} hits - Total rate limit hits
     * @returns {Promise<boolean>} - Success
     */
    async saveRateLimit(domain, intervalMs, hits) {
      if (!tableExists()) {
        // Stub: table doesn't exist yet
        return false;
      }

      try {
        db.prepare(`
          INSERT INTO rate_limits (domain, interval_ms, rate_limit_hits, updated_at)
          VALUES (?, ?, ?, datetime('now'))
          ON CONFLICT(domain) DO UPDATE SET
            interval_ms = excluded.interval_ms,
            rate_limit_hits = excluded.rate_limit_hits,
            updated_at = datetime('now')
        `).run(domain, intervalMs, hits);
        return true;
      } catch (err) {
        console.error('[RateLimitAdapter] saveRateLimit error:', err.message);
        return false;
      }
    },

    /**
     * Get rate limit for a specific domain
     * @param {string} domain - Domain name
     * @returns {Promise<Object|null>} - Rate limit record or null
     */
    async getRateLimit(domain) {
      if (!tableExists()) {
        return null;
      }

      try {
        const row = db.prepare(`
          SELECT domain, interval_ms as interval, rate_limit_hits as hits, 
                 last_hit_at as lastHitAt, updated_at as updatedAt
          FROM rate_limits
          WHERE domain = ?
        `).get(domain);
        return row || null;
      } catch (err) {
        console.error('[RateLimitAdapter] getRateLimit error:', err.message);
        return null;
      }
    },

    /**
     * Get all rate limits
     * @returns {Promise<Array<Object>>} - All rate limit records
     */
    async getAllRateLimits() {
      if (!tableExists()) {
        return [];
      }

      try {
        return db.prepare(`
          SELECT domain, interval_ms as interval, rate_limit_hits as hits,
                 last_hit_at as lastHitAt, updated_at as updatedAt
          FROM rate_limits
          ORDER BY rate_limit_hits DESC
        `).all();
      } catch (err) {
        console.error('[RateLimitAdapter] getAllRateLimits error:', err.message);
        return [];
      }
    },

    /**
     * Delete rate limit for a domain
     * @param {string} domain - Domain name
     * @returns {Promise<boolean>} - Success
     */
    async deleteRateLimit(domain) {
      if (!tableExists()) {
        return false;
      }

      try {
        db.prepare('DELETE FROM rate_limits WHERE domain = ?').run(domain);
        return true;
      } catch (err) {
        console.error('[RateLimitAdapter] deleteRateLimit error:', err.message);
        return false;
      }
    },

    /**
     * Get throttled domains (interval > threshold)
     * @param {number} thresholdMs - Minimum interval to consider throttled
     * @returns {Promise<Array<Object>>}
     */
    async getThrottledDomains(thresholdMs = 2000) {
      if (!tableExists()) {
        return [];
      }

      try {
        return db.prepare(`
          SELECT domain, interval_ms as interval, rate_limit_hits as hits
          FROM rate_limits
          WHERE interval_ms >= ?
          ORDER BY interval_ms DESC
        `).all(thresholdMs);
      } catch (err) {
        console.error('[RateLimitAdapter] getThrottledDomains error:', err.message);
        return [];
      }
    },

    /**
     * Prune old rate limit records
     * @param {number} olderThanDays - Delete records not updated in this many days
     * @returns {Promise<number>} - Number of records deleted
     */
    async pruneOld(olderThanDays = 30) {
      if (!tableExists()) {
        return 0;
      }

      try {
        const result = db.prepare(`
          DELETE FROM rate_limits
          WHERE updated_at < datetime('now', '-' || ? || ' days')
        `).run(olderThanDays);
        return result.changes;
      } catch (err) {
        console.error('[RateLimitAdapter] pruneOld error:', err.message);
        return 0;
      }
    },

    /**
     * Create the rate_limits table if it doesn't exist
     * Call this during database initialization
     * @returns {Promise<boolean>} - Success
     */
    async ensureTable() {
      try {
        db.exec(`
          CREATE TABLE IF NOT EXISTS rate_limits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            domain TEXT UNIQUE NOT NULL,
            interval_ms INTEGER NOT NULL DEFAULT 1000,
            rate_limit_hits INTEGER NOT NULL DEFAULT 0,
            last_hit_at TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
          
          CREATE INDEX IF NOT EXISTS idx_rate_limits_domain ON rate_limits(domain);
        `);
        return true;
      } catch (err) {
        console.error('[RateLimitAdapter] ensureTable error:', err.message);
        return false;
      }
    }
  };
}

module.exports = { createRateLimitAdapter };
