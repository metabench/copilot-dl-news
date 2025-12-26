'use strict';

/**
 * Similarity Database Adapter
 * 
 * Provides database access for article fingerprints used by the
 * Content Similarity Engine (DuplicateDetector).
 * 
 * Tables used:
 * - article_fingerprints: SimHash and MinHash signatures
 * - content_storage: Content ID mapping
 * - content_analysis: Body text for fingerprinting
 * 
 * @module similarityAdapter
 */

/**
 * Create similarity adapter
 * @param {import('better-sqlite3').Database} db - better-sqlite3 database instance
 * @returns {Object} Similarity adapter methods
 */
function createSimilarityAdapter(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('createSimilarityAdapter requires a better-sqlite3 database handle');
  }
  
  // Ensure table exists (idempotent)
  db.exec(`
    CREATE TABLE IF NOT EXISTS article_fingerprints (
      content_id INTEGER PRIMARY KEY,
      simhash BLOB NOT NULL,
      minhash_signature BLOB,
      word_count INTEGER,
      computed_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (content_id) REFERENCES content_storage(id) ON DELETE CASCADE
    )
  `);
  
  // Ensure indexes exist
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_article_fingerprints_simhash 
      ON article_fingerprints(simhash);
    CREATE INDEX IF NOT EXISTS idx_article_fingerprints_computed_at 
      ON article_fingerprints(computed_at);
  `);
  
  // Prepared statements
  const stmts = {
    // Insert or replace fingerprint
    saveFingerprint: db.prepare(`
      INSERT OR REPLACE INTO article_fingerprints 
        (content_id, simhash, minhash_signature, word_count, computed_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `),
    
    // Get fingerprint by content ID
    getFingerprint: db.prepare(`
      SELECT content_id, simhash, minhash_signature, word_count, computed_at
      FROM article_fingerprints
      WHERE content_id = ?
    `),
    
    // Get all fingerprints (for index loading)
    getAllFingerprints: db.prepare(`
      SELECT content_id, simhash, minhash_signature, word_count
      FROM article_fingerprints
      ORDER BY content_id
      LIMIT ?
    `),
    
    // Get fingerprints with pagination
    getFingerprints: db.prepare(`
      SELECT content_id, simhash, minhash_signature, word_count, computed_at
      FROM article_fingerprints
      ORDER BY computed_at DESC
      LIMIT ? OFFSET ?
    `),
    
    // Count fingerprints
    countFingerprints: db.prepare(`
      SELECT COUNT(*) as total FROM article_fingerprints
    `),
    
    // Delete fingerprint
    deleteFingerprint: db.prepare(`
      DELETE FROM article_fingerprints WHERE content_id = ?
    `),
    
    // Get articles without fingerprints (for batch processing)
    getArticlesWithoutFingerprints: db.prepare(`
      SELECT 
        cs.id as content_id,
        ca.body_text as body_text,
        ca.word_count
      FROM content_storage cs
      INNER JOIN content_analysis ca ON ca.content_id = cs.id
      LEFT JOIN article_fingerprints af ON af.content_id = cs.id
      WHERE af.content_id IS NULL
        AND ca.body_text IS NOT NULL
        AND length(ca.body_text) > 100
      ORDER BY cs.id
      LIMIT ? OFFSET ?
    `),
    
    // Count articles without fingerprints
    countArticlesWithoutFingerprints: db.prepare(`
      SELECT COUNT(*) as total
      FROM content_storage cs
      INNER JOIN content_analysis ca ON ca.content_id = cs.id
      LEFT JOIN article_fingerprints af ON af.content_id = cs.id
      WHERE af.content_id IS NULL
        AND ca.body_text IS NOT NULL
        AND length(ca.body_text) > 100
    `),
    
    // Find potential duplicates by SimHash prefix
    findBySimhashPrefix: db.prepare(`
      SELECT content_id, simhash, minhash_signature
      FROM article_fingerprints
      WHERE substr(simhash, 1, 4) = substr(?, 1, 4)
    `),
    
    // Get statistics
    getStats: db.prepare(`
      SELECT 
        COUNT(*) as total_fingerprints,
        COUNT(minhash_signature) as with_minhash,
        AVG(word_count) as avg_word_count,
        MIN(computed_at) as oldest,
        MAX(computed_at) as newest
      FROM article_fingerprints
    `)
  };
  
  /**
   * Normalize fingerprint row from database
   */
  function normalizeFingerprint(row) {
    if (!row) return null;
    return {
      contentId: row.content_id,
      simhash: row.simhash,
      minhash: row.minhash_signature,
      wordCount: row.word_count,
      computedAt: row.computed_at
    };
  }
  
  return {
    /**
     * Save a fingerprint to the database
     * @param {Object} fingerprint - Fingerprint data
     * @param {number} fingerprint.contentId - Content storage ID
     * @param {Buffer} fingerprint.simhash - 8-byte SimHash
     * @param {Buffer} [fingerprint.minhash] - 512-byte MinHash signature
     * @param {number} [fingerprint.wordCount] - Word count
     * @returns {{changes: number}} Result
     */
    saveFingerprint({ contentId, simhash, minhash = null, wordCount = null }) {
      if (!Buffer.isBuffer(simhash) || simhash.length !== 8) {
        throw new Error('simhash must be an 8-byte Buffer');
      }
      
      const result = stmts.saveFingerprint.run(
        contentId,
        simhash,
        minhash,
        wordCount
      );
      
      return { changes: result.changes };
    },
    
    /**
     * Get fingerprint by content ID
     * @param {number} contentId - Content storage ID
     * @returns {Object|null} Fingerprint or null
     */
    getFingerprint(contentId) {
      const row = stmts.getFingerprint.get(contentId);
      return normalizeFingerprint(row);
    },
    
    /**
     * Get all fingerprints (for index loading)
     * @param {Object} [options] - Options
     * @param {number} [options.limit=100000] - Maximum to return
     * @returns {Array<Object>} Fingerprints
     */
    getAllFingerprints({ limit = 100000 } = {}) {
      const rows = stmts.getAllFingerprints.all(limit);
      return rows.map(normalizeFingerprint);
    },
    
    /**
     * Get fingerprints with pagination
     * @param {Object} options - Options
     * @param {number} [options.page=1] - Page number
     * @param {number} [options.limit=100] - Items per page
     * @returns {Object} Paginated result
     */
    getFingerprints({ page = 1, limit = 100 } = {}) {
      const offset = (page - 1) * limit;
      const rows = stmts.getFingerprints.all(limit, offset);
      const total = stmts.countFingerprints.get().total;
      
      return {
        items: rows.map(normalizeFingerprint),
        total,
        page,
        limit,
        hasMore: offset + rows.length < total
      };
    },
    
    /**
     * Delete a fingerprint
     * @param {number} contentId - Content storage ID
     * @returns {{changes: number}} Result
     */
    deleteFingerprint(contentId) {
      const result = stmts.deleteFingerprint.run(contentId);
      return { changes: result.changes };
    },
    
    /**
     * Get articles that need fingerprinting
     * @param {Object} [options] - Options
     * @param {number} [options.limit=1000] - Batch size
     * @param {number} [options.offset=0] - Offset
     * @returns {Array<{contentId: number, bodyText: string, wordCount: number}>}
     */
    getArticlesWithoutFingerprints({ limit = 1000, offset = 0 } = {}) {
      const rows = stmts.getArticlesWithoutFingerprints.all(limit, offset);
      return rows.map(row => ({
        contentId: row.content_id,
        bodyText: row.body_text,
        wordCount: row.word_count
      }));
    },
    
    /**
     * Count articles needing fingerprinting
     * @returns {number} Count
     */
    countArticlesWithoutFingerprints() {
      return stmts.countArticlesWithoutFingerprints.get().total;
    },
    
    /**
     * Find fingerprints with similar SimHash prefix (for fast screening)
     * @param {Buffer} simhash - SimHash to match
     * @returns {Array<Object>} Matching fingerprints
     */
    findBySimhashPrefix(simhash) {
      if (!Buffer.isBuffer(simhash) || simhash.length !== 8) {
        throw new Error('simhash must be an 8-byte Buffer');
      }
      
      const rows = stmts.findBySimhashPrefix.all(simhash);
      return rows.map(normalizeFingerprint);
    },
    
    /**
     * Get fingerprint statistics
     * @returns {Object} Statistics
     */
    getStats() {
      const row = stmts.getStats.get();
      return {
        totalFingerprints: row.total_fingerprints,
        withMinhash: row.with_minhash,
        avgWordCount: Math.round(row.avg_word_count || 0),
        oldest: row.oldest,
        newest: row.newest
      };
    },
    
    /**
     * Bulk save fingerprints (faster for batch processing)
     * @param {Array<Object>} fingerprints - Array of fingerprint objects
     * @returns {{saved: number}} Result
     */
    bulkSave(fingerprints) {
      const insert = db.transaction((fps) => {
        let saved = 0;
        for (const fp of fps) {
          if (!Buffer.isBuffer(fp.simhash) || fp.simhash.length !== 8) {
            continue;
          }
          stmts.saveFingerprint.run(
            fp.contentId,
            fp.simhash,
            fp.minhash || null,
            fp.wordCount || null
          );
          saved++;
        }
        return saved;
      });
      
      const saved = insert(fingerprints);
      return { saved };
    }
  };
}

module.exports = {
  createSimilarityAdapter
};
