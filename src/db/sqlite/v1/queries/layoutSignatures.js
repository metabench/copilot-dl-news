"use strict";

/**
 * Layout Signatures Query Module
 * 
 * Manages the layout_signatures table which stores structural fingerprints
 * for HTML pages. Signatures are keyed by hash and level (1 or 2).
 * 
 * Schema:
 *   signature_hash TEXT PRIMARY KEY
 *   level INTEGER NOT NULL (1=template, 2=structure)
 *   signature TEXT NOT NULL
 *   first_seen_url TEXT
 *   seen_count INTEGER DEFAULT 1
 *   created_at DATETIME
 *   last_seen_at DATETIME
 */

function assertDatabase(db) {
  if (!db || typeof db.prepare !== "function") {
    throw new Error("createLayoutSignaturesQueries requires a better-sqlite3 database handle");
  }
}

function createLayoutSignaturesQueries(db) {
  assertDatabase(db);

  const upsertStmt = db.prepare(`
    INSERT INTO layout_signatures (signature_hash, level, signature, first_seen_url, seen_count, last_seen_at)
    VALUES (@signature_hash, @level, @signature, @first_seen_url, 1, CURRENT_TIMESTAMP)
    ON CONFLICT(signature_hash) DO UPDATE SET
      seen_count = seen_count + 1,
      last_seen_at = CURRENT_TIMESTAMP
  `);

  const getStmt = db.prepare(`
    SELECT signature_hash, level, signature, first_seen_url, seen_count, created_at, last_seen_at
      FROM layout_signatures
     WHERE signature_hash = ?
  `);

  const getByLevelStmt = db.prepare(`
    SELECT signature_hash, level, signature, first_seen_url, seen_count, created_at, last_seen_at
      FROM layout_signatures
     WHERE level = ?
     ORDER BY seen_count DESC
     LIMIT ?
  `);

  const getTopClustersStmt = db.prepare(`
    SELECT signature_hash, level, signature, first_seen_url, seen_count, created_at, last_seen_at
      FROM layout_signatures
     WHERE level = 2
     ORDER BY seen_count DESC
     LIMIT ?
  `);

  const countByLevelStmt = db.prepare(`
    SELECT level, COUNT(*) as count, SUM(seen_count) as total_seen
      FROM layout_signatures
     GROUP BY level
  `);

  const deleteStmt = db.prepare(`
    DELETE FROM layout_signatures WHERE signature_hash = ?
  `);

  return {
    /**
     * Insert or update a signature (increments seen_count on conflict)
     * @param {Object} params
     * @param {string} params.signature_hash - The hash of the signature
     * @param {number} params.level - 1 (template) or 2 (structure)
     * @param {string} params.signature - The serialized signature string
     * @param {string} [params.first_seen_url] - URL where first encountered
     */
    upsert({ signature_hash, level, signature, first_seen_url = null }) {
      return upsertStmt.run({ signature_hash, level, signature, first_seen_url });
    },

    /**
     * Get a signature by hash
     * @param {string} signature_hash
     * @returns {Object|null}
     */
    get(signature_hash) {
      return getStmt.get(signature_hash) || null;
    },

    /**
     * Get signatures by level
     * @param {number} level - 1 or 2
     * @param {number} [limit=100]
     * @returns {Array}
     */
    getByLevel(level, limit = 100) {
      return getByLevelStmt.all(level, limit);
    },

    /**
     * Get top L2 clusters by seen_count
     * @param {number} [limit=10]
     * @returns {Array}
     */
    getTopClusters(limit = 10) {
      return getTopClustersStmt.all(limit);
    },

    /**
     * Get counts grouped by level
     * @returns {Array<{level: number, count: number, total_seen: number}>}
     */
    getCounts() {
      return countByLevelStmt.all();
    },

    /**
     * Delete a signature
     * @param {string} signature_hash
     * @returns {Object} RunResult with changes count
     */
    delete(signature_hash) {
      return deleteStmt.run(signature_hash);
    },

    /**
     * Batch upsert signatures (uses transaction internally)
     * @param {Array<Object>} signatures - Array of signature objects
     * @returns {Object} { inserted: number, updated: number }
     */
    batchUpsert(signatures) {
      const stats = { inserted: 0, updated: 0 };
      const transaction = db.transaction((sigs) => {
        for (const sig of sigs) {
          const existing = getStmt.get(sig.signature_hash);
          upsertStmt.run({
            signature_hash: sig.signature_hash,
            level: sig.level,
            signature: sig.signature,
            first_seen_url: sig.first_seen_url || null
          });
          if (existing) {
            stats.updated++;
          } else {
            stats.inserted++;
          }
        }
      });
      transaction(signatures);
      return stats;
    }
  };
}

module.exports = { createLayoutSignaturesQueries };
