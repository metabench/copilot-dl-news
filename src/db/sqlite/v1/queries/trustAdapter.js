'use strict';

/**
 * Trust Database Adapter
 * 
 * Provides database access for fact-checking and credibility:
 * - fact_checks: Fact-check records from external sources
 * - source_credibility: Source credibility ratings (MBFC, etc.)
 * - article_credibility: Cached article credibility assessments
 * 
 * @module trustAdapter
 */

/**
 * Create trust adapter
 * @param {import('better-sqlite3').Database} db - better-sqlite3 database instance
 * @returns {Object} Trust adapter methods
 */
function createTrustAdapter(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('createTrustAdapter requires a better-sqlite3 database handle');
  }
  
  // Ensure tables exist (idempotent)
  db.exec(`
    -- Fact-checks from external sources (Snopes, PolitiFact, etc.)
    CREATE TABLE IF NOT EXISTS fact_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      claim_text TEXT NOT NULL,
      claim_simhash TEXT,
      rating TEXT NOT NULL,
      source TEXT NOT NULL,
      source_url TEXT,
      published_at TEXT,
      fetched_at TEXT DEFAULT (datetime('now'))
    );

    -- Source credibility ratings
    CREATE TABLE IF NOT EXISTS source_credibility (
      host TEXT PRIMARY KEY,
      credibility_score INTEGER DEFAULT 50,
      mbfc_rating TEXT,
      bias_label TEXT,
      correction_count INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Article credibility analysis (cached results)
    CREATE TABLE IF NOT EXISTS article_credibility (
      content_id INTEGER PRIMARY KEY,
      overall_score INTEGER DEFAULT 50,
      matched_fact_checks TEXT,
      source_score INTEGER,
      claim_count INTEGER DEFAULT 0,
      analyzed_at TEXT DEFAULT (datetime('now'))
    );

    -- Indexes for efficient lookups
    CREATE INDEX IF NOT EXISTS idx_fact_checks_simhash ON fact_checks(claim_simhash);
    CREATE INDEX IF NOT EXISTS idx_fact_checks_source ON fact_checks(source);
    CREATE INDEX IF NOT EXISTS idx_fact_checks_rating ON fact_checks(rating);
    CREATE INDEX IF NOT EXISTS idx_source_credibility_score ON source_credibility(credibility_score DESC);
    CREATE INDEX IF NOT EXISTS idx_article_credibility_score ON article_credibility(overall_score DESC);
  `);
  
  // Prepared statements
  const stmts = {
    // Fact-check statements
    saveFactCheck: db.prepare(`
      INSERT INTO fact_checks 
        (claim_text, claim_simhash, rating, source, source_url, published_at, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `),
    
    getFactCheck: db.prepare(`
      SELECT * FROM fact_checks WHERE id = ?
    `),
    
    getAllFactChecks: db.prepare(`
      SELECT * FROM fact_checks 
      ORDER BY fetched_at DESC 
      LIMIT ?
    `),
    
    getFactChecksBySource: db.prepare(`
      SELECT * FROM fact_checks 
      WHERE source = ? 
      ORDER BY fetched_at DESC 
      LIMIT ?
    `),
    
    getFactChecksByRating: db.prepare(`
      SELECT * FROM fact_checks 
      WHERE rating = ? 
      ORDER BY fetched_at DESC 
      LIMIT ?
    `),
    
    searchFactChecks: db.prepare(`
      SELECT * FROM fact_checks 
      WHERE claim_text LIKE ? 
      ORDER BY fetched_at DESC 
      LIMIT ?
    `),
    
    deleteFactCheck: db.prepare(`
      DELETE FROM fact_checks WHERE id = ?
    `),
    
    getFactCheckCount: db.prepare(`
      SELECT COUNT(*) as count FROM fact_checks
    `),
    
    // Source credibility statements
    saveSourceCredibility: db.prepare(`
      INSERT OR REPLACE INTO source_credibility 
        (host, credibility_score, mbfc_rating, bias_label, correction_count, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `),
    
    getSourceCredibility: db.prepare(`
      SELECT * FROM source_credibility WHERE host = ?
    `),
    
    getAllSourceCredibility: db.prepare(`
      SELECT * FROM source_credibility 
      WHERE credibility_score >= ?
      ORDER BY credibility_score DESC 
      LIMIT ?
    `),
    
    getSourcesByBias: db.prepare(`
      SELECT * FROM source_credibility 
      WHERE bias_label = ?
      ORDER BY credibility_score DESC
    `),
    
    deleteSourceCredibility: db.prepare(`
      DELETE FROM source_credibility WHERE host = ?
    `),
    
    getSourceCount: db.prepare(`
      SELECT COUNT(*) as count FROM source_credibility
    `),
    
    // Article credibility statements
    saveArticleCredibility: db.prepare(`
      INSERT OR REPLACE INTO article_credibility 
        (content_id, overall_score, matched_fact_checks, source_score, claim_count, analyzed_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `),
    
    getArticleCredibility: db.prepare(`
      SELECT * FROM article_credibility WHERE content_id = ?
    `),
    
    getArticlesByCredibility: db.prepare(`
      SELECT ac.*, ca.title as article_title
      FROM article_credibility ac
      LEFT JOIN content_analysis ca ON ca.id = ac.content_id
      WHERE ac.overall_score >= ? AND ac.overall_score <= ?
      ORDER BY ac.overall_score DESC
      LIMIT ? OFFSET ?
    `),
    
    deleteArticleCredibility: db.prepare(`
      DELETE FROM article_credibility WHERE content_id = ?
    `),
    
    getCredibilityStats: db.prepare(`
      SELECT 
        COUNT(*) as total_analyzed,
        AVG(overall_score) as avg_score,
        SUM(CASE WHEN overall_score >= 80 THEN 1 ELSE 0 END) as high_credibility,
        SUM(CASE WHEN overall_score >= 50 AND overall_score < 80 THEN 1 ELSE 0 END) as mixed_credibility,
        SUM(CASE WHEN overall_score < 50 THEN 1 ELSE 0 END) as low_credibility
      FROM article_credibility
    `)
  };
  
  return {
    // ============ FACT-CHECK METHODS ============
    
    /**
     * Save a fact-check record
     * @param {Object} data - Fact-check data
     * @returns {Object} Result with inserted ID
     */
    saveFactCheck(data) {
      const result = stmts.saveFactCheck.run(
        data.claimText,
        data.claimSimhash || null,
        data.rating,
        data.source,
        data.sourceUrl || null,
        data.publishedAt || null
      );
      return { id: result.lastInsertRowid, ...data };
    },
    
    /**
     * Get fact-check by ID
     * @param {number} id - Fact-check ID
     * @returns {Object|null} Fact-check record
     */
    getFactCheck(id) {
      return stmts.getFactCheck.get(id) || null;
    },
    
    /**
     * Get all fact-checks
     * @param {Object} [options] - Options
     * @param {number} [options.limit=1000] - Maximum results
     * @returns {Array} Fact-check records
     */
    getAllFactChecks(options = {}) {
      const { limit = 1000 } = options;
      return stmts.getAllFactChecks.all(limit);
    },
    
    /**
     * Get fact-checks by source
     * @param {string} source - Fact-checker name
     * @param {Object} [options] - Options
     * @returns {Array} Fact-check records
     */
    getFactChecksBySource(source, options = {}) {
      const { limit = 100 } = options;
      return stmts.getFactChecksBySource.all(source, limit);
    },
    
    /**
     * Get fact-checks by rating
     * @param {string} rating - Rating value
     * @param {Object} [options] - Options
     * @returns {Array} Fact-check records
     */
    getFactChecksByRating(rating, options = {}) {
      const { limit = 100 } = options;
      return stmts.getFactChecksByRating.all(rating, limit);
    },
    
    /**
     * Search fact-checks by claim text
     * @param {string} query - Search query
     * @param {Object} [options] - Options
     * @returns {Array} Matching fact-checks
     */
    searchFactChecks(query, options = {}) {
      const { limit = 20 } = options;
      return stmts.searchFactChecks.all(`%${query}%`, limit);
    },
    
    /**
     * Delete a fact-check
     * @param {number} id - Fact-check ID
     * @returns {Object} Result with changes count
     */
    deleteFactCheck(id) {
      const result = stmts.deleteFactCheck.run(id);
      return { deleted: result.changes };
    },
    
    /**
     * Get total fact-check count
     * @returns {number} Count
     */
    getFactCheckCount() {
      return stmts.getFactCheckCount.get().count;
    },
    
    // ============ SOURCE CREDIBILITY METHODS ============
    
    /**
     * Save source credibility rating
     * @param {Object} data - Credibility data
     * @returns {Object} Saved data
     */
    saveSourceCredibility(data) {
      stmts.saveSourceCredibility.run(
        data.host,
        data.credibilityScore || 50,
        data.mbfcRating || null,
        data.biasLabel || null,
        data.correctionCount || 0
      );
      return data;
    },
    
    /**
     * Get source credibility by host
     * @param {string} host - Source hostname
     * @returns {Object|null} Credibility data
     */
    getSourceCredibility(host) {
      const row = stmts.getSourceCredibility.get(host);
      if (!row) return null;
      
      return {
        host: row.host,
        credibilityScore: row.credibility_score,
        mbfcRating: row.mbfc_rating,
        biasLabel: row.bias_label,
        correctionCount: row.correction_count,
        updatedAt: row.updated_at
      };
    },
    
    /**
     * Get all source credibility ratings
     * @param {Object} [options] - Options
     * @returns {Array} Source credibility records
     */
    getAllSourceCredibility(options = {}) {
      const { minScore = 0, limit = 500 } = options;
      const rows = stmts.getAllSourceCredibility.all(minScore, limit);
      
      return rows.map(row => ({
        host: row.host,
        credibilityScore: row.credibility_score,
        mbfcRating: row.mbfc_rating,
        biasLabel: row.bias_label,
        correctionCount: row.correction_count,
        updatedAt: row.updated_at
      }));
    },
    
    /**
     * Get sources by bias label
     * @param {string} biasLabel - Bias label
     * @returns {Array} Source records
     */
    getSourcesByBias(biasLabel) {
      return stmts.getSourcesByBias.all(biasLabel).map(row => ({
        host: row.host,
        credibilityScore: row.credibility_score,
        mbfcRating: row.mbfc_rating,
        biasLabel: row.bias_label
      }));
    },
    
    /**
     * Delete source credibility
     * @param {string} host - Source hostname
     * @returns {Object} Result
     */
    deleteSourceCredibility(host) {
      const result = stmts.deleteSourceCredibility.run(host);
      return { deleted: result.changes };
    },
    
    /**
     * Get total source count
     * @returns {number} Count
     */
    getSourceCount() {
      return stmts.getSourceCount.get().count;
    },
    
    // ============ ARTICLE CREDIBILITY METHODS ============
    
    /**
     * Save article credibility assessment
     * @param {Object} data - Credibility data
     * @returns {Object} Saved data
     */
    saveArticleCredibility(data) {
      stmts.saveArticleCredibility.run(
        data.contentId,
        data.overallScore || 50,
        typeof data.matchedFactChecks === 'string' 
          ? data.matchedFactChecks 
          : JSON.stringify(data.matchedFactChecks || []),
        data.sourceScore || null,
        data.claimCount || 0
      );
      return data;
    },
    
    /**
     * Get article credibility by content ID
     * @param {number} contentId - Article content ID
     * @returns {Object|null} Credibility data
     */
    getArticleCredibility(contentId) {
      const row = stmts.getArticleCredibility.get(contentId);
      if (!row) return null;
      
      let matchedFactChecks = [];
      try {
        matchedFactChecks = JSON.parse(row.matched_fact_checks || '[]');
      } catch (e) {
        // Invalid JSON
      }
      
      return {
        contentId: row.content_id,
        overallScore: row.overall_score,
        matchedFactChecks,
        sourceScore: row.source_score,
        claimCount: row.claim_count,
        analyzedAt: row.analyzed_at
      };
    },
    
    /**
     * Get articles by credibility score range
     * @param {Object} [options] - Options
     * @returns {Array} Article credibility records
     */
    getArticlesByCredibility(options = {}) {
      const { minScore = 0, maxScore = 100, limit = 50, offset = 0 } = options;
      const rows = stmts.getArticlesByCredibility.all(minScore, maxScore, limit, offset);
      
      return rows.map(row => ({
        contentId: row.content_id,
        overallScore: row.overall_score,
        sourceScore: row.source_score,
        claimCount: row.claim_count,
        analyzedAt: row.analyzed_at,
        articleTitle: row.article_title
      }));
    },
    
    /**
     * Delete article credibility
     * @param {number} contentId - Article content ID
     * @returns {Object} Result
     */
    deleteArticleCredibility(contentId) {
      const result = stmts.deleteArticleCredibility.run(contentId);
      return { deleted: result.changes };
    },
    
    /**
     * Get credibility statistics
     * @returns {Object} Statistics
     */
    getCredibilityStats() {
      const row = stmts.getCredibilityStats.get();
      return {
        totalAnalyzed: row.total_analyzed,
        avgScore: Math.round(row.avg_score || 0),
        highCredibility: row.high_credibility,
        mixedCredibility: row.mixed_credibility,
        lowCredibility: row.low_credibility
      };
    },
    
    /**
     * Get overall statistics
     * @returns {Object} All statistics
     */
    getStats() {
      return {
        factChecks: this.getFactCheckCount(),
        sources: this.getSourceCount(),
        credibility: this.getCredibilityStats()
      };
    }
  };
}

module.exports = { createTrustAdapter };
