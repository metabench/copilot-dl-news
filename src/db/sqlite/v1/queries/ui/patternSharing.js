'use strict';

/**
 * Pattern Sharing Queries - DB adapter layer for cross-domain pattern analytics
 * 
 * All SQL for pattern sharing lives here. Services should use these
 * functions instead of inline db.prepare() calls.
 */

/**
 * Create a pattern sharing query module
 * @param {Object} db - better-sqlite3 database instance
 * @returns {Object} Query functions
 */
function createPatternSharingQueries(db) {
  /**
   * Check if a table exists
   */
  function tableExists(tableName) {
    const result = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name=?
    `).get(tableName);
    return !!result;
  }

  return {
    /**
     * Check if cross_crawl_knowledge table exists
     */
    hasCrossCrawlKnowledge() {
      return tableExists('cross_crawl_knowledge');
    },

    /**
     * Check if layout_signatures table exists
     */
    hasLayoutSignatures() {
      return tableExists('layout_signatures');
    },

    /**
     * Get overall cross-domain stats
     */
    getCrossDomainstats() {
      const stmt = db.prepare(`
        SELECT 
          COUNT(*) as total_patterns,
          COUNT(DISTINCT source_domain) as unique_domains,
          SUM(usage_count) as total_usage
        FROM cross_crawl_knowledge
      `);
      return stmt.get() || { total_patterns: 0, unique_domains: 0, total_usage: 0 };
    },

    /**
     * Get pattern type breakdown
     */
    getPatternTypeBreakdown() {
      const stmt = db.prepare(`
        SELECT 
          knowledge_type,
          COUNT(*) as count,
          SUM(usage_count) as usage,
          AVG(confidence_level) as avg_confidence
        FROM cross_crawl_knowledge
        GROUP BY knowledge_type
        ORDER BY count DESC
      `);
      return stmt.all() || [];
    },

    /**
     * Get top shared patterns by usage count
     */
    getTopSharedPatterns(limit = 20) {
      const stmt = db.prepare(`
        SELECT 
          source_domain,
          knowledge_type,
          knowledge_key,
          usage_count,
          confidence_level,
          created_at
        FROM cross_crawl_knowledge
        WHERE usage_count > 0
        ORDER BY usage_count DESC
        LIMIT ?
      `);
      return stmt.all(limit) || [];
    },

    /**
     * Get domain families - domains sharing layout signatures
     */
    getDomainFamilies(limit = 20) {
      const stmt = db.prepare(`
        WITH domain_signatures AS (
          SELECT 
            SUBSTR(first_seen_url, 
              INSTR(first_seen_url, '://') + 3,
              INSTR(SUBSTR(first_seen_url, INSTR(first_seen_url, '://') + 3), '/') - 1
            ) as domain,
            signature_hash,
            seen_count
          FROM layout_signatures
          WHERE level = 2
            AND first_seen_url IS NOT NULL
        ),
        shared_templates AS (
          SELECT 
            signature_hash,
            COUNT(DISTINCT domain) as domain_count,
            GROUP_CONCAT(DISTINCT domain) as domains,
            SUM(seen_count) as total_seen
          FROM domain_signatures
          GROUP BY signature_hash
          HAVING COUNT(DISTINCT domain) > 1
        )
        SELECT 
          signature_hash,
          domain_count,
          domains,
          total_seen
        FROM shared_templates
        ORDER BY domain_count DESC, total_seen DESC
        LIMIT ?
      `);
      return stmt.all(limit) || [];
    },

    /**
     * Get pattern recommendations for a target domain
     */
    getPatternRecommendations(targetDomain, limit = 20) {
      const stmt = db.prepare(`
        SELECT 
          source_domain,
          knowledge_type,
          knowledge_key,
          knowledge_value,
          confidence_level,
          usage_count
        FROM cross_crawl_knowledge
        WHERE source_domain != ?
          AND confidence_level >= 0.7
          AND usage_count >= 2
        ORDER BY confidence_level DESC, usage_count DESC
        LIMIT ?
      `);
      return stmt.all(targetDomain, limit) || [];
    },

    /**
     * Get patterns learned from a specific domain
     */
    getDomainPatterns(domain) {
      const stmt = db.prepare(`
        SELECT 
          knowledge_type,
          knowledge_key,
          knowledge_value,
          confidence_level,
          usage_count,
          created_at,
          updated_at
        FROM cross_crawl_knowledge
        WHERE source_domain = ?
        ORDER BY knowledge_type, confidence_level DESC
      `);
      return stmt.all(domain) || [];
    }
  };
}

module.exports = { createPatternSharingQueries };
