'use strict';

/**
 * PatternSharingService - Cross-domain pattern sharing analytics
 * 
 * Provides insights into:
 * - Pattern success rates across domains
 * - Cross-domain pattern applicability
 * - Domain family grouping (same CMS platforms)
 * - Pattern transfer recommendations
 * 
 * Added 2026-01-06 as part of P2 improvements
 */

class PatternSharingService {
  /**
   * @param {Object} db - better-sqlite3 database instance
   */
  constructor(db) {
    this.db = db;
    this._cache = new Map();
    this._cacheTTL = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Check and return cached result
   */
  _getCached(key) {
    const cached = this._cache.get(key);
    if (cached && Date.now() - cached.timestamp < this._cacheTTL) {
      return cached.data;
    }
    return null;
  }

  /**
   * Store result in cache
   */
  _setCache(key, data) {
    this._cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Get cross-domain knowledge summary
   * Shows what patterns exist and how they're being shared
   * @returns {Object} Summary of cross-domain patterns
   */
  getCrossDomainsummary() {
    const cacheKey = 'crossDomainSummary';
    const cached = this._getCached(cacheKey);
    if (cached) return cached;

    // Check if table exists
    const tableExists = this.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='cross_crawl_knowledge'
    `).get();

    if (!tableExists) {
      return {
        totalPatterns: 0,
        uniqueDomains: 0,
        patternTypes: [],
        topSharedPatterns: []
      };
    }

    try {
      // Overall stats
      const statsStmt = this.db.prepare(`
        SELECT 
          COUNT(*) as total_patterns,
          COUNT(DISTINCT source_domain) as unique_domains,
          SUM(usage_count) as total_usage
        FROM cross_crawl_knowledge
      `);
      const stats = statsStmt.get() || { total_patterns: 0, unique_domains: 0, total_usage: 0 };

      // Breakdown by type
      const typeStmt = this.db.prepare(`
        SELECT 
          knowledge_type,
          COUNT(*) as count,
          SUM(usage_count) as usage,
          AVG(confidence_level) as avg_confidence
        FROM cross_crawl_knowledge
        GROUP BY knowledge_type
        ORDER BY count DESC
      `);
      const types = typeStmt.all() || [];

      // Top shared patterns (highest usage)
      const topStmt = this.db.prepare(`
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
        LIMIT 20
      `);
      const topPatterns = topStmt.all() || [];

      const result = {
        totalPatterns: stats.total_patterns || 0,
        uniqueDomains: stats.unique_domains || 0,
        totalUsage: stats.total_usage || 0,
        patternTypes: types.map(t => ({
          type: t.knowledge_type,
          count: t.count,
          usage: t.usage || 0,
          avgConfidence: t.avg_confidence ? Math.round(t.avg_confidence * 100) / 100 : null
        })),
        topSharedPatterns: topPatterns.map(p => ({
          domain: p.source_domain,
          type: p.knowledge_type,
          key: p.knowledge_key,
          usageCount: p.usage_count,
          confidence: p.confidence_level,
          createdAt: p.created_at
        }))
      };

      this._setCache(cacheKey, result);
      return result;
    } catch (err) {
      console.warn('getCrossDomainsummary failed:', err.message);
      return { totalPatterns: 0, uniqueDomains: 0, patternTypes: [], topSharedPatterns: [] };
    }
  }

  /**
   * Get domain families - groups of domains with similar patterns
   * Based on layout signature similarity
   * @param {number} limit - Max families to return
   * @returns {Array} Domain families with similarity scores
   */
  getDomainFamilies(limit = 20) {
    const cacheKey = `domainFamilies:${limit}`;
    const cached = this._getCached(cacheKey);
    if (cached) return cached;

    // Check if layout_signatures table exists
    const tableExists = this.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='layout_signatures'
    `).get();

    if (!tableExists) {
      return [];
    }

    try {
      // Find domains that share layout signatures
      // Group by signature_hash to find similar templates
      const stmt = this.db.prepare(`
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

      const rows = stmt.all(limit) || [];

      const result = rows.map(row => ({
        signatureHash: row.signature_hash,
        domainCount: row.domain_count,
        domains: row.domains ? row.domains.split(',').slice(0, 10) : [],
        totalSeen: row.total_seen
      }));

      this._setCache(cacheKey, result);
      return result;
    } catch (err) {
      console.warn('getDomainFamilies failed:', err.message);
      return [];
    }
  }

  /**
   * Get pattern transfer recommendations
   * Suggests which patterns from successful domains might apply to others
   * @param {string} targetDomain - Domain to get recommendations for
   * @returns {Object} Recommendations with confidence scores
   */
  getPatternRecommendations(targetDomain) {
    if (!targetDomain) {
      return { recommendations: [], reason: 'No target domain specified' };
    }

    // Check if table exists
    const tableExists = this.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='cross_crawl_knowledge'
    `).get();

    if (!tableExists) {
      return { recommendations: [], reason: 'cross_crawl_knowledge table not found' };
    }

    try {
      // Find patterns from similar domains (same TLD family)
      const targetTld = this._extractTld(targetDomain);
      
      const stmt = this.db.prepare(`
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
        LIMIT 20
      `);

      const rows = stmt.all(targetDomain) || [];

      const recommendations = rows.map(row => ({
        sourceDomain: row.source_domain,
        type: row.knowledge_type,
        key: row.knowledge_key,
        confidence: row.confidence_level,
        usageCount: row.usage_count,
        relevance: this._calculateRelevance(targetDomain, row.source_domain, row.knowledge_type)
      }));

      // Sort by relevance
      recommendations.sort((a, b) => b.relevance - a.relevance);

      return {
        targetDomain,
        recommendations: recommendations.slice(0, 10),
        totalAvailable: rows.length
      };
    } catch (err) {
      console.warn('getPatternRecommendations failed:', err.message);
      return { recommendations: [], reason: err.message };
    }
  }

  /**
   * Get patterns learned from a specific domain
   * @param {string} domain - Domain to get patterns for
   * @returns {Object} Patterns learned from this domain
   */
  getDomainPatterns(domain) {
    if (!domain) {
      return { patterns: [], reason: 'No domain specified' };
    }

    // Check if table exists
    const tableExists = this.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='cross_crawl_knowledge'
    `).get();

    if (!tableExists) {
      return { patterns: [], reason: 'cross_crawl_knowledge table not found' };
    }

    try {
      const stmt = this.db.prepare(`
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

      const rows = stmt.all(domain) || [];

      // Group by type
      const byType = {};
      for (const row of rows) {
        if (!byType[row.knowledge_type]) {
          byType[row.knowledge_type] = [];
        }
        byType[row.knowledge_type].push({
          key: row.knowledge_key,
          value: row.knowledge_value,
          confidence: row.confidence_level,
          usageCount: row.usage_count,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        });
      }

      return {
        domain,
        patternCount: rows.length,
        byType
      };
    } catch (err) {
      console.warn('getDomainPatterns failed:', err.message);
      return { patterns: [], reason: err.message };
    }
  }

  /**
   * Extract TLD from domain
   */
  _extractTld(domain) {
    if (!domain) return '';
    const parts = domain.split('.');
    return parts.length > 1 ? parts.slice(-2).join('.') : domain;
  }

  /**
   * Calculate pattern relevance score
   */
  _calculateRelevance(targetDomain, sourceDomain, knowledgeType) {
    let score = 0.5; // Base score

    // Same TLD gets bonus
    if (this._extractTld(targetDomain) === this._extractTld(sourceDomain)) {
      score += 0.2;
    }

    // Seed patterns are more transferable
    if (knowledgeType === 'seed-pattern') {
      score += 0.15;
    }

    // Hub structure patterns are valuable
    if (knowledgeType === 'hub-tree') {
      score += 0.1;
    }

    return Math.min(1.0, score);
  }

  /**
   * Clear cache
   */
  clearCache() {
    this._cache.clear();
  }
}

module.exports = { PatternSharingService };
