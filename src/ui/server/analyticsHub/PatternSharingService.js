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
 * All SQL queries are in the DB adapter layer:
 * src/db/sqlite/v1/queries/ui/patternSharing.js
 * 
 * Added 2026-01-06 as part of P2 improvements
 */

const { createPatternSharingQueries } = require('../../../data/db/sqlite/v1/queries/ui/patternSharing');

class PatternSharingService {
  /**
   * @param {Object} db - better-sqlite3 database instance
   */
  constructor(db) {
    this.db = db;
    this.queries = createPatternSharingQueries(db);
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

    if (!this.queries.hasCrossCrawlKnowledge()) {
      return {
        totalPatterns: 0,
        uniqueDomains: 0,
        patternTypes: [],
        topSharedPatterns: []
      };
    }

    try {
      const stats = this.queries.getCrossDomainstats();
      const types = this.queries.getPatternTypeBreakdown();
      const topPatterns = this.queries.getTopSharedPatterns(20);

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

    if (!this.queries.hasLayoutSignatures()) {
      return [];
    }

    try {
      const rows = this.queries.getDomainFamilies(limit);

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

    if (!this.queries.hasCrossCrawlKnowledge()) {
      return { recommendations: [], reason: 'cross_crawl_knowledge table not found' };
    }

    try {
      const rows = this.queries.getPatternRecommendations(targetDomain, 20);

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

    if (!this.queries.hasCrossCrawlKnowledge()) {
      return { patterns: [], reason: 'cross_crawl_knowledge table not found' };
    }

    try {
      const rows = this.queries.getDomainPatterns(domain);

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
