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
    const predictions = [];

    // Strategy 1: DSPL patterns (highest priority)
    const dsplPredictions = this.predictFromDspl(countryName, countryCode, domain);
    predictions.push(...dsplPredictions);

    // Strategy 2: Gazetteer-based patterns
    const gazetteerPredictions = this.predictFromGazetteer(countryName, countryCode, domain);
    predictions.push(...gazetteerPredictions);

    // Strategy 3: Common hub patterns as fallback
    const commonPredictions = this.predictFromCommonPatterns(countryName, countryCode, domain);
    predictions.push(...commonPredictions);

    // Strategy 4: Regional patterns for countries without direct coverage
    const regionalPredictions = this.predictFromRegionalPatterns(countryName, countryCode, domain);
    predictions.push(...regionalPredictions);

    // Remove duplicates and score predictions
    const uniquePredictions = this.deduplicateAndScore(predictions);

    return uniquePredictions.slice(0, 5); // Limit to top 5 predictions per country
  }

  /**
   * Predict URLs using DSPL patterns
   */
  predictFromDspl(countryName, countryCode, domain) {
    const predictions = [];
    const dspl = getDsplForDomain(this.dspls, domain);

    if (!dspl?.countryHubPatterns) {
      return predictions;
    }

    // Generate predictions from verified patterns
    for (const pattern of dspl.countryHubPatterns) {
      if (!pattern.verified) continue;

      const url = this.generateUrlFromPattern(pattern.pattern, countryName, countryCode, domain);
      if (url) {
        predictions.push({
          url,
          confidence: pattern.confidence,
          strategy: 'dspl',
          pattern: pattern.pattern,
          countryName,
          countryCode
        });
      }
    }

    return predictions;
  }

  /**
   * Predict URLs using gazetteer data patterns
   */
  predictFromGazetteer(countryName, countryCode, domain) {
    const predictions = [];
    const baseUrl = `https://${domain}`;
    const countrySlug = slugify(countryName);
    const countryCodeLower = countryCode.toLowerCase();

    // Look for existing mappings to learn patterns
    const existingMappings = this.db.prepare(`
      SELECT url FROM place_page_mappings
      WHERE host = ? AND page_kind = 'country-hub' AND status = 'verified'
      LIMIT 10
    `).all(domain) || [];

    // Extract patterns from existing verified URLs
    const patterns = this.extractPatternsFromUrls(existingMappings.map(m => m.url), domain);

    for (const pattern of patterns) {
      const url = pattern
        .replace('{slug}', countrySlug)
        .replace('{code}', countryCodeLower);

      try {
        const fullUrl = new URL(url, baseUrl).href;
        predictions.push({
          url: fullUrl,
          confidence: 0.7, // Lower than DSPL but higher than generic
          strategy: 'gazetteer-learned',
          pattern,
          countryName,
          countryCode
        });
      } catch (err) {
        // Skip invalid URLs
      }
    }

    return predictions;
  }

  /**
   * Predict URLs using common hub patterns
   */
  predictFromCommonPatterns(countryName, countryCode, domain) {
    const predictions = [];
    const baseUrl = `https://${domain}`;
    const countrySlug = slugify(countryName);
    const countryCodeLower = countryCode.toLowerCase();
    const region = this._getRegion(countryCode);

    const patterns = [
      { pattern: `/world/${countrySlug}`, confidence: 0.6 },
      { pattern: `/news/world/${countrySlug}`, confidence: 0.5 },
      { pattern: `/world/${countryCodeLower}`, confidence: 0.5 },
      { pattern: `/news/${countryCodeLower}`, confidence: 0.4 },
      { pattern: `/${countrySlug}`, confidence: 0.4 },
      { pattern: `/international/${countrySlug}`, confidence: 0.3 },
      { pattern: `/news/world-${region}-${countrySlug}`, confidence: 0.3 }
    ];

    for (const { pattern, confidence } of patterns) {
      try {
        const url = new URL(pattern, baseUrl).href;
        predictions.push({
          url,
          confidence,
          strategy: 'common-patterns',
          pattern,
          countryName,
          countryCode
        });
      } catch (err) {
        // Skip invalid URLs
      }
    }

    return predictions;
  }

  /**
   * Predict URLs using regional patterns for uncovered countries
   */
  predictFromRegionalPatterns(countryName, countryCode, domain) {
    const predictions = [];
    const baseUrl = `https://${domain}`;
    const region = this._getRegion(countryCode);

    // Check if region has coverage
    const regionCoverage = this.db.prepare(`
      SELECT COUNT(*) as count FROM place_page_mappings
      WHERE host = ? AND page_kind = 'country-hub' AND status = 'verified'
      AND place_id IN (
        SELECT id FROM places WHERE country_code = ?
      )
    `).get(domain, countryCode);

    if (regionCoverage.count === 0) {
      // Try regional hub patterns
      const regionalPatterns = [
        `/world/${region}`,
        `/news/world/${region}`,
        `/international/${region}`
      ];

      for (const pattern of regionalPatterns) {
        try {
          const url = new URL(pattern, baseUrl).href;
          predictions.push({
            url,
            confidence: 0.2, // Low confidence for regional fallbacks
            strategy: 'regional-fallback',
            pattern,
            countryName,
            countryCode
          });
        } catch (err) {
          // Skip invalid URLs
        }
      }
    }

    return predictions;
  }

  /**
   * Generate URL from pattern template
   */
  generateUrlFromPattern(pattern, countryName, countryCode, domain) {
    const baseUrl = `https://${domain}`;
    const countrySlug = slugify(countryName);
    const countryCodeLower = countryCode.toLowerCase();

    const url = pattern
      .replace('{slug}', countrySlug)
      .replace('{code}', countryCodeLower);

    try {
      return new URL(url, baseUrl).href;
    } catch (err) {
      return null;
    }
  }

  /**
   * Extract patterns from existing verified URLs
   */
  extractPatternsFromUrls(urls, domain) {
    const patterns = new Set();

    for (const url of urls) {
      try {
        const urlObj = new URL(url);
        if (urlObj.hostname !== domain) continue;

        const path = urlObj.pathname;
        // Look for country-specific patterns
        const countryPattern = path.replace(/\/[a-z-]+(?=\/|$)/, '/{slug}');
        if (countryPattern !== path) {
          patterns.add(countryPattern);
        }
      } catch (err) {
        // Skip invalid URLs
      }
    }

    return Array.from(patterns);
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
}

module.exports = { CountryHubGapAnalyzer };
