/**
 * CountryHubGapAnalyzer - Service for analyzing country hub coverage gaps
 * 
 * Extends HubGapAnalyzerBase to provide country-specific hub URL prediction
 * and gap analysis for news website coverage.
 * 
 * Provides gap analysis, predictions, and pattern learning for country-level place hubs.
 * Uses database query module for all SQL operations (no inline SQL).
 * Learns URL patterns from existing data via Domain-Specific Pattern Libraries (DSPLs).
 */

const { getAllCountries, getTopCountries } = require('../db/sqlite/v1/queries/gazetteer.places');
const { getCountryHubCoverage } = require('../db/sqlite/v1/queries/placePageMappings');
const { HubGapAnalyzerBase } = require('./HubGapAnalyzerBase');
const { getDsplForDomain } = require('./shared/dspl');
const { slugify } = require('../tools/slugify');
const { PredictionStrategyManager } = require('./shared/PredictionStrategyManager');
const { UrlPatternGenerator } = require('./shared/UrlPatternGenerator');

const MAX_KNOWN_404_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

class CountryHubGapAnalyzer extends HubGapAnalyzerBase {
  constructor({ 
    db,
    gazetteerData = null,
    logger = console,
    dsplDir
  } = {}) {
    super({ db, logger, dsplDir });
    
    this.gazetteerData = gazetteerData;
    
    // Cache for analysis results
    this.lastAnalysis = null;
    this.lastAnalysisTime = 0;
    this.analysisCacheMs = 5000;

    // Initialize prediction strategy manager
    this.predictionManager = new PredictionStrategyManager({
      db: this.db,
      dspls: this.dspls,
      entityType: 'country',
      buildMetadata: this.buildEntityMetadata.bind(this),
      logger: this.logger
    });

    this.maxKnown404AgeMs = MAX_KNOWN_404_AGE_MS;
    this._knownStatusCache = new Map();
    this._initLatestHttpStatusStatement();

    // Override the _getExistingMappings method for country-specific logic
    this.predictionManager._getExistingMappings = (domain) => {
      try {
        return this.db.prepare(`
          SELECT url FROM place_page_mappings
          WHERE host = ? AND page_kind = 'country-hub' AND status = 'verified'
          LIMIT 10
        `).all(domain) || [];
      } catch (err) {
        // Handle missing table gracefully (for tests or incomplete databases)
        if (err.message.includes('no such table')) {
          return [];
        }
        throw err;
      }
    };

    // Override the _extractPatternsFromUrls method for country-specific pattern extraction
    this.predictionManager._extractPatternsFromUrls = (urls, domain, metadata) => {
      return this.extractPatternsFromUrls(urls, domain);
    };
  }

  /**
   * Country label for DSPL lookups and logging
   */
  getEntityLabel() {
    return 'country';
  }

  /**
   * Fallback patterns for country hubs
   */
  getFallbackPatterns() {
    return [
      '/world/{slug}',
      '/news/world/{slug}',
      '/world/{code}',
      '/news/{code}',
      '/{slug}',
      '/international/{slug}',
      '/news/world-{region}-{slug}'
    ];
  }

  /**
   * Build metadata for country entity
   */
  buildEntityMetadata(country) {
    if (!country || !country.name) return null;
    
    const slug = slugify(country.name);
    const code = country.code ? country.code.toLowerCase() : '';
    const region = this._getRegion(country.code);

    return {
      slug,
      code,
      region,
      name: country.name
    };
  }

  /**
   * Get list of all countries from gazetteer
   * @returns {Array} Array of {name, code, importance}
   */
  getAllCountries() {
    return getAllCountries(this.db);
  }

  /**
   * Get top N countries by importance
   * @param {number} limit - Maximum number of countries to return
   * @returns {Array} Top countries
   */
  getTopCountries(limit = 50) {
    return getTopCountries(this.db, limit);
  }

  /**
   * Enhanced URL prediction with multiple strategies and fallbacks
   * @param {string} domain - Target domain
   * @param {string} countryName - Country name
   * @param {string} countryCode - Country code (e.g., 'US', 'GB')
   * @returns {Array<Object>} Predicted URL objects with confidence scores
   */
  predictCountryHubUrls(domain, countryName, countryCode) {
    const entity = { name: countryName, code: countryCode };
    const predictions = [];

    // Strategy 1: DSPL patterns (highest priority)
    const dsplPredictions = this.predictionManager.predictFromDspl(entity, domain);
    predictions.push(...dsplPredictions);

    // Strategy 2: Gazetteer-based patterns
    const gazetteerPredictions = this.predictionManager.predictFromGazetteer(entity, domain);
    predictions.push(...gazetteerPredictions);

    // Strategy 3: Common hub patterns as fallback (only if no DSPL patterns exist)
    if (dsplPredictions.length === 0) {
      const commonPatterns = [
        { pattern: `/world/${slugify(countryName)}`, confidence: 0.6 },
        { pattern: `/news/world/${slugify(countryName)}`, confidence: 0.5 },
        { pattern: `/news/${countryCode.toLowerCase()}`, confidence: 0.4 },
        { pattern: `/${slugify(countryName)}`, confidence: 0.4 },
        { pattern: `/international/${slugify(countryName)}`, confidence: 0.3 },
        { pattern: `/news/world-${this._getRegion(countryCode)}-${slugify(countryName)}`, confidence: 0.3 }
      ];
      const commonPredictions = this.predictionManager.predictFromCommonPatterns(entity, domain, commonPatterns);
      predictions.push(...commonPredictions);
    }

    // Strategy 4: Regional patterns for countries without direct coverage
    const regionalPredictions = this.predictionManager.predictFromRegionalPatterns(entity, domain);
    predictions.push(...regionalPredictions);

    // Remove duplicates and score predictions
    const uniquePredictions = this.deduplicateAndScore(predictions);
    const filteredPredictions = uniquePredictions.filter((prediction) => !this._isKnown404Url(prediction.url));
    const finalPredictions = filteredPredictions.length > 0 ? filteredPredictions : uniquePredictions;

    return finalPredictions.slice(0, 5).map((p) => p.url); // Return just URLs for compatibility
  }

  /**
   * Analyze country hub coverage for a specific domain
   * @param {string} domain - Domain to analyze
   * @param {Object} hubStats - Hub visit statistics from crawler state
   * @returns {Object} Gap analysis summary
   */
  analyzeGaps(domain, hubStats = {}) {
    const host = this._normalizeHost(domain);
    const now = Date.now();
    
    // Return cached analysis if recent
    const cacheKey = `${host || ''}`;
    if (this.lastAnalysis?.[cacheKey] && (now - this.lastAnalysisTime) < this.analysisCacheMs) {
      return this.lastAnalysis[cacheKey];
    }

    const countryStats = hubStats.perKind?.country || { seeded: 0, visited: 0 };
    const coverage = host
      ? getCountryHubCoverage(this.db, host)
      : { seeded: 0, visited: 0, missingCountries: [], totalCountries: 0, missing: 0 };

    const seeded = coverage.seeded || countryStats.seeded || 0;
    const visited = coverage.visited || countryStats.visited || 0;
    const missingCountries = coverage.missingCountries || [];
    const missing = coverage.missing ?? Math.max(seeded - visited, 0);
    
    const coveragePercent = seeded > 0 ? Math.round((visited / seeded) * 100) : 0;
    const totalCountries = coverage.totalCountries || seeded;
    const isComplete = missing === 0 && totalCountries > 0;

    const analysis = {
      domain: host,
      seeded,
      visited,
      missing,
      coveragePercent,
      isComplete,
      timestamp: new Date().toISOString(),
      totalCountries,
      missingCountries
    };

    // Cache result
    if (!this.lastAnalysis) this.lastAnalysis = {};
    this.lastAnalysis[cacheKey] = analysis;
    this.lastAnalysisTime = now;

    return analysis;
  }

  /**
   * Generate gap predictions for missing countries
   * @param {string} domain - Target domain
   * @param {Array} missingCountries - Array of {name, code} for missing countries
   * @returns {Array} Prediction objects
   */
  generatePredictions(domain, missingCountries = []) {
    const predictions = [];
    
    for (const country of missingCountries) {
      const predictedUrls = this.predictCountryHubUrls(domain, country.name, country.code);
      
      for (const url of predictedUrls) {
        predictions.push({
          url,
          countryName: country.name,
          countryCode: country.code,
          confidence: this._calculateConfidence(country),
          priority: this._calculatePriority(country),
          predictionSource: 'country-hub-gap-analysis',
          timestamp: new Date().toISOString()
        });
      }
    }

    return predictions;
  }

  /**
   * Extract country name from URL
   * @param {string} url - URL to analyze
   * @returns {string|null} Extracted country name
   */
  extractCountryNameFromUrl(url) {
    if (!url) return null;
    
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      
      // Extract last meaningful segment
      const segments = path.split('/').filter(s => s && s.length > 2);
      if (segments.length === 0) return null;
      
      const lastSegment = segments[segments.length - 1];
      
      // Convert slug to title case
      return lastSegment
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    } catch (err) {
      return null;
    }
  }

  // Private methods

  _getRegion(countryCode) {
    const regionMap = {
      'CN': 'asia', 'JP': 'asia', 'IN': 'asia', 'KR': 'asia',
      'GB': 'europe', 'DE': 'europe', 'FR': 'europe', 'IT': 'europe', 'ES': 'europe', 'RU': 'europe',
      'US': 'americas', 'CA': 'americas', 'MX': 'americas', 'BR': 'americas',
      'AU': 'oceania'
    };
    return regionMap[countryCode] || 'international';
  }

  _calculateConfidence(country) {
    const importanceNormalized = Math.min((country.importance || 0) / 100, 1.0);
    return 0.4 + (importanceNormalized * 0.4);
  }

  _calculatePriority(country) {
    return Math.max(10, Math.floor(country.importance || 0));
  }

  _initLatestHttpStatusStatement() {
    try {
      this._selectLatestHttpStatusStmt = this.db.prepare(`
        SELECT hr.http_status AS http_status, hr.fetched_at AS fetched_at
        FROM urls u
        INNER JOIN http_responses hr ON hr.url_id = u.id
        WHERE u.url = ?
        ORDER BY hr.fetched_at DESC
        LIMIT 1
      `);
    } catch (err) {
      if (err && typeof err.message === 'string' && err.message.includes('no such table')) {
        this._selectLatestHttpStatusStmt = null;
        return;
      }
      throw err;
    }
  }

  _getLatestHttpStatus(url) {
    if (!url || !this._selectLatestHttpStatusStmt) {
      return null;
    }

    const cached = this._knownStatusCache.get(url);
    if (cached && (Date.now() - cached.cachedAt) <= 5 * 60 * 1000) { // 5 minute memoization window
      return cached.row;
    }

    try {
      const row = this._selectLatestHttpStatusStmt.get(url) || null;
      this._knownStatusCache.set(url, { row, cachedAt: Date.now() });
      return row;
    } catch (err) {
      if (err && typeof err.message === 'string' && err.message.includes('no such table')) {
        this._selectLatestHttpStatusStmt = null;
        return null;
      }
      throw err;
    }
  }

  _isKnown404Url(url) {
    const row = this._getLatestHttpStatus(url);
    if (!row || row.http_status !== 404) {
      return false;
    }
    if (!row.fetched_at) {
      return true;
    }
    const fetchedAtMs = Date.parse(row.fetched_at);
    if (!Number.isFinite(fetchedAtMs)) {
      return true;
    }
    return (Date.now() - fetchedAtMs) <= this.maxKnown404AgeMs;
  }
}

module.exports = { CountryHubGapAnalyzer };
