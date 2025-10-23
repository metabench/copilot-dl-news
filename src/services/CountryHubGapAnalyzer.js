/**
 * CountryHubGapAnalyzer - Standalone service for analyzing country hub coverage gaps
 * 
 * This is the core implementation that can be used independently of the crawler.
 * Provides gap analysis, predictions, and pattern learning for country-level place hubs.
 * 
 * Uses database query module for all SQL operations (no inline SQL).
 * Learns URL patterns from existing data via Domain-Specific Pattern Libraries (DSPLs).
 */

const { getAllCountries, getTopCountries } = require('../db/sqlite/v1/queries/gazetteer.places');
const { getCountryHubCoverage } = require('../db/sqlite/v1/queries/placePageMappings');
const path = require('path');
const { loadDsplLibrary, getDsplForDomain } = require('./shared/dspl');

class CountryHubGapAnalyzer {
  constructor({ 
    db,
    gazetteerData = null,
    logger = console,
    dsplDir = path.join(__dirname, '..', '..', 'data', 'dspls')
  } = {}) {
    if (!db) {
      throw new Error('CountryHubGapAnalyzer requires a database connection');
    }
    
    this.db = db;
    this.gazetteerData = gazetteerData;
    this.logger = logger;
    this.dsplDir = dsplDir;
    
    // Cache for analysis results
    this.lastAnalysis = null;
    this.lastAnalysisTime = 0;
    this.analysisCacheMs = 5000;
    
    // Load DSPLs on initialization
    this.dspls = loadDsplLibrary({ dsplDir: this.dsplDir, logger: this.logger });
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
   * Predict country hub URLs for a domain
   * @param {string} domain - Target domain
   * @param {string} countryName - Country name
   * @param {string} countryCode - Country code (e.g., 'US', 'GB')
   * @returns {Array<string>} Predicted URLs
   */
  predictCountryHubUrls(domain, countryName, countryCode) {
    const baseUrl = `https://${domain}`;
    const urls = [];
    const countrySlug = this._generateCountrySlug(countryName);
    const countryCodeLower = countryCode.toLowerCase();
    
    // Check if we have a learned DSPL for this domain
    const dspl = getDsplForDomain(this.dspls, domain);
    
    if (dspl && dspl.countryHubPatterns && dspl.countryHubPatterns.length > 0) {
      // Use learned patterns (verified patterns only)
      const verifiedPatterns = dspl.countryHubPatterns.filter(p => p.verified);
      
      for (const patternObj of verifiedPatterns) {
        const pattern = patternObj.pattern
          .replace('{slug}', countrySlug)
          .replace('{code}', countryCodeLower);
        
        try {
          const url = new URL(pattern, baseUrl).href;
          urls.push(url);
        } catch (err) {
          // Skip invalid URLs
        }
      }
      
      if (urls.length > 0) {
        return urls;
      }
    }
    
    // Fall back to generic patterns if no DSPL available (no log - already logged at init)
    const patterns = [
      `/world/${countrySlug}`,
      `/news/world/${countrySlug}`,
      `/world/${countryCodeLower}`,
      `/news/${countryCodeLower}`,
      `/${countrySlug}`,
      `/international/${countrySlug}`,
      `/news/world-${this._getRegion(countryCode)}-${countrySlug}`
    ];

    for (const pattern of patterns) {
      try {
        const url = new URL(pattern, baseUrl).href;
        urls.push(url);
      } catch (err) {
        // Skip invalid URLs
      }
    }

    return urls;
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

  _generateCountrySlug(countryName) {
    return countryName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  _getRegion(countryCode) {
    const regionMap = {
      'CN': 'asia', 'JP': 'asia', 'IN': 'asia', 'KR': 'asia',
      'GB': 'europe', 'DE': 'europe', 'FR': 'europe', 'IT': 'europe', 'ES': 'europe', 'RU': 'europe',
      'US': 'americas', 'CA': 'americas', 'MX': 'americas', 'BR': 'americas',
      'AU': 'oceania'
    };
    return regionMap[countryCode] || 'international';
  }

  _normalizeHost(domain) {
    if (!domain) return '';
    const trimmed = String(domain).trim();
    if (!trimmed) return '';

    try {
      const parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
      return parsed.hostname.replace(/^www\./, '').toLowerCase();
    } catch (_) {
      return trimmed
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/.*$/, '')
        .toLowerCase();
    }
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
