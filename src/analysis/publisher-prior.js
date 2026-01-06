'use strict';

/**
 * Publisher Prior Scoring - Computes place disambiguation priors based on publisher coverage
 * 
 * Uses the place_page_mappings table to determine what places a publisher covers,
 * which provides strong signals for disambiguation. If BBC has a UK hub but no Texas hub,
 * "London" on BBC should strongly favor London, UK.
 * 
 * @module analysis/publisher-prior
 */

/**
 * Cache TTL for publisher priors (5 minutes)
 */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Default prior when no coverage data exists
 */
const DEFAULT_PRIOR = 0.1;

/**
 * Minimum prior value (even for clearly non-covered countries)
 */
const MIN_PRIOR = 0.05;

/**
 * Maximum prior value (cap to avoid over-confidence)
 */
const MAX_PRIOR = 0.8;

/**
 * Publisher prior calculator
 */
class PublisherPrior {
  /**
   * @param {Object} db - Database connection (better-sqlite3)
   * @param {Object} [options] - Configuration options
   * @param {number} [options.cacheTtlMs=300000] - Cache TTL in milliseconds
   */
  constructor(db, options = {}) {
    if (!db || typeof db.prepare !== 'function') {
      throw new Error('PublisherPrior requires a database handle with prepare()');
    }
    this.db = db;
    this.cacheTtlMs = options.cacheTtlMs || CACHE_TTL_MS;
    
    // Cache: host -> { data, timestamp }
    this._cache = new Map();
    
    // Prepare statements
    this._stmts = this._prepareStatements();
  }
  
  /**
   * Prepare SQL statements
   * @private
   */
  _prepareStatements() {
    // Get total verified coverage for a host
    const totalCoverage = this.db.prepare(`
      SELECT COUNT(DISTINCT place_id) as cnt
        FROM place_page_mappings
       WHERE host = ?
         AND status = 'verified'
    `);
    
    // Get coverage by country for a host
    const coverageByCountry = this.db.prepare(`
      SELECT 
        p.country_code,
        COUNT(DISTINCT m.place_id) as place_count
      FROM place_page_mappings m
      JOIN places p ON m.place_id = p.id
      WHERE m.host = ?
        AND m.status = 'verified'
        AND p.country_code IS NOT NULL
      GROUP BY p.country_code
    `);
    
    // Get coverage by place kind for a host (country hubs vs region hubs)
    const coverageByKind = this.db.prepare(`
      SELECT 
        m.page_kind,
        COUNT(*) as cnt
      FROM place_page_mappings m
      WHERE m.host = ?
        AND m.status = 'verified'
      GROUP BY m.page_kind
    `);
    
    // Check if specific country is covered
    const hasCountryCoverage = this.db.prepare(`
      SELECT 1
        FROM place_page_mappings m
        JOIN places p ON m.place_id = p.id
       WHERE m.host = ?
         AND m.status = 'verified'
         AND p.country_code = ?
       LIMIT 1
    `);
    
    // Get all verified place_ids for a host
    const verifiedPlaces = this.db.prepare(`
      SELECT DISTINCT place_id
        FROM place_page_mappings
       WHERE host = ?
         AND status = 'verified'
    `);
    
    return {
      totalCoverage,
      coverageByCountry,
      coverageByKind,
      hasCountryCoverage,
      verifiedPlaces
    };
  }
  
  /**
   * Normalize host to canonical form
   * @param {string} host - Host/domain
   * @returns {string} Normalized host
   */
  _normalizeHost(host) {
    return (host || '').trim().toLowerCase().replace(/^www\./, '');
  }
  
  /**
   * Get or compute publisher coverage data
   * @param {string} host - Publisher host/domain
   * @returns {Object} Coverage data
   */
  _getCoverage(host) {
    const normalizedHost = this._normalizeHost(host);
    
    // Check cache
    const cached = this._cache.get(normalizedHost);
    if (cached && (Date.now() - cached.timestamp) < this.cacheTtlMs) {
      return cached.data;
    }
    
    // Compute coverage
    const total = this._stmts.totalCoverage.get(normalizedHost)?.cnt || 0;
    const byCountry = this._stmts.coverageByCountry.all(normalizedHost);
    const byKind = this._stmts.coverageByKind.all(normalizedHost);
    
    // Build country coverage map
    const countryCoverage = new Map();
    for (const row of byCountry) {
      countryCoverage.set(row.country_code, row.place_count);
    }
    
    // Build kind coverage map
    const kindCoverage = new Map();
    for (const row of byKind) {
      kindCoverage.set(row.page_kind, row.cnt);
    }
    
    const data = {
      host: normalizedHost,
      totalPlaces: total,
      countryCoverage,
      kindCoverage,
      hasAnyData: total > 0
    };
    
    // Cache result
    this._cache.set(normalizedHost, {
      data,
      timestamp: Date.now()
    });
    
    return data;
  }
  
  /**
   * Calculate publisher prior for a candidate place
   * @param {string} host - Publisher host/domain
   * @param {string} countryCode - ISO country code (e.g., 'GB', 'US')
   * @param {Object} [options] - Additional options
   * @param {number} [options.placeId] - Specific place ID for direct lookup
   * @returns {number} Prior probability 0-1
   */
  getPrior(host, countryCode, options = {}) {
    const coverage = this._getCoverage(host);
    
    // No coverage data - return default
    if (!coverage.hasAnyData) {
      return DEFAULT_PRIOR;
    }
    
    // Check if specific place is verified
    if (options.placeId) {
      const verified = this._stmts.verifiedPlaces.all(this._normalizeHost(host));
      const placeIds = new Set(verified.map(r => r.place_id));
      if (placeIds.has(options.placeId)) {
        return MAX_PRIOR; // Direct match - high confidence
      }
    }
    
    // Calculate country-based prior
    const countryCount = coverage.countryCoverage.get(countryCode) || 0;
    
    if (countryCount === 0) {
      // Country not covered - low prior but not zero
      return MIN_PRIOR;
    }
    
    // Prior = proportion of coverage in this country + base
    const proportion = countryCount / coverage.totalPlaces;
    const prior = Math.min(MAX_PRIOR, MIN_PRIOR + (proportion * (MAX_PRIOR - MIN_PRIOR)));
    
    return prior;
  }
  
  /**
   * Get detailed prior explanation for debugging
   * @param {string} host - Publisher host/domain
   * @param {string} countryCode - ISO country code
   * @param {Object} [options] - Additional options
   * @returns {Object} Detailed explanation
   */
  explain(host, countryCode, options = {}) {
    const coverage = this._getCoverage(host);
    const prior = this.getPrior(host, countryCode, options);
    
    const countryCount = coverage.countryCoverage.get(countryCode) || 0;
    
    return {
      host: coverage.host,
      countryCode,
      prior,
      explanation: {
        hasAnyData: coverage.hasAnyData,
        totalPlaces: coverage.totalPlaces,
        countryPlaces: countryCount,
        proportion: coverage.totalPlaces > 0 ? countryCount / coverage.totalPlaces : 0,
        reason: !coverage.hasAnyData 
          ? 'No coverage data - using default prior'
          : countryCount === 0
            ? 'Country not in verified coverage - using minimum prior'
            : `${countryCount}/${coverage.totalPlaces} places are in ${countryCode}`
      },
      coverage: {
        byCountry: Object.fromEntries(coverage.countryCoverage),
        byKind: Object.fromEntries(coverage.kindCoverage)
      },
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Batch score multiple candidates for a host
   * @param {string} host - Publisher host/domain
   * @param {Array<Object>} candidates - Array of {countryCode, placeId?}
   * @returns {Array<Object>} Candidates with prior scores added
   */
  scoreCandidates(host, candidates) {
    const coverage = this._getCoverage(host);
    
    return candidates.map(candidate => ({
      ...candidate,
      publisherPrior: this.getPrior(host, candidate.countryCode || candidate.country_code, {
        placeId: candidate.placeId || candidate.place_id
      })
    }));
  }
  
  /**
   * Clear cache (useful for testing or after bulk updates)
   */
  clearCache() {
    this._cache.clear();
  }
  
  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getCacheStats() {
    return {
      size: this._cache.size,
      hosts: Array.from(this._cache.keys())
    };
  }
}

module.exports = {
  PublisherPrior,
  DEFAULT_PRIOR,
  MIN_PRIOR,
  MAX_PRIOR
};
