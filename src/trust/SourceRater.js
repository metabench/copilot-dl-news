'use strict';

/**
 * SourceRater - Manage source credibility ratings
 * 
 * Tracks and calculates credibility scores for news sources based on:
 * - Media Bias/Fact Check (MBFC) ratings
 * - Correction/retraction rate
 * - Domain age and establishment
 * - Fact-check history
 * 
 * Credibility score: 0-100 scale
 * - 80-100: ✅ High credibility
 * - 50-79: ⚠️ Mixed credibility
 * - 0-49: ❌ Low credibility
 * 
 * @module SourceRater
 */

// MBFC factual reporting ratings to numeric scores (0-100)
const MBFC_SCORES = {
  'very-high': 95,
  'high': 85,
  'mostly-factual': 70,
  'mixed': 50,
  'low': 30,
  'very-low': 10
};

// Bias labels
const BIAS_LABELS = {
  'left': 'left',
  'left-center': 'left-center',
  'center': 'center',
  'right-center': 'right-center',
  'right': 'right',
  'extreme-left': 'extreme-left',
  'extreme-right': 'extreme-right',
  'conspiracy-pseudoscience': 'questionable',
  'satire': 'satire',
  'pro-science': 'center'
};

// Default credibility for unknown sources
const DEFAULT_CREDIBILITY = 50;

// Well-known credible sources (bootstrap data)
const KNOWN_SOURCES = {
  // Major wire services
  'apnews.com': { score: 92, mbfc: 'high', bias: 'center' },
  'reuters.com': { score: 92, mbfc: 'very-high', bias: 'center' },
  
  // Major newspapers
  'nytimes.com': { score: 85, mbfc: 'high', bias: 'left-center' },
  'washingtonpost.com': { score: 82, mbfc: 'mostly-factual', bias: 'left-center' },
  'wsj.com': { score: 85, mbfc: 'mostly-factual', bias: 'right-center' },
  'theguardian.com': { score: 80, mbfc: 'mostly-factual', bias: 'left-center' },
  'bbc.com': { score: 88, mbfc: 'high', bias: 'left-center' },
  'bbc.co.uk': { score: 88, mbfc: 'high', bias: 'left-center' },
  
  // Broadcast networks
  'cnn.com': { score: 65, mbfc: 'mixed', bias: 'left' },
  'foxnews.com': { score: 55, mbfc: 'mixed', bias: 'right' },
  'msnbc.com': { score: 60, mbfc: 'mixed', bias: 'left' },
  'nbcnews.com': { score: 75, mbfc: 'mostly-factual', bias: 'left-center' },
  'abcnews.go.com': { score: 75, mbfc: 'mostly-factual', bias: 'left-center' },
  'cbsnews.com': { score: 75, mbfc: 'mostly-factual', bias: 'left-center' },
  
  // Public broadcasting
  'npr.org': { score: 82, mbfc: 'mostly-factual', bias: 'left-center' },
  'pbs.org': { score: 85, mbfc: 'high', bias: 'center' },
  
  // International
  'economist.com': { score: 88, mbfc: 'high', bias: 'right-center' },
  'ft.com': { score: 88, mbfc: 'high', bias: 'right-center' },
  'aljazeera.com': { score: 65, mbfc: 'mixed', bias: 'left-center' },
  
  // Questionable sources (low credibility examples)
  'infowars.com': { score: 10, mbfc: 'very-low', bias: 'conspiracy-pseudoscience' },
  'naturalnews.com': { score: 15, mbfc: 'very-low', bias: 'conspiracy-pseudoscience' },
  'theonion.com': { score: 90, mbfc: 'high', bias: 'satire' },
  'babylonbee.com': { score: 85, mbfc: 'high', bias: 'satire' }
};

/**
 * SourceRater class for managing source credibility
 */
class SourceRater {
  /**
   * Create a SourceRater instance
   * 
   * @param {Object} [options] - Configuration
   * @param {Object} [options.trustAdapter] - Database adapter for source data
   * @param {Object} [options.logger] - Logger instance
   * @param {Object} [options.weights] - Scoring weight overrides
   */
  constructor(options = {}) {
    this.trustAdapter = options.trustAdapter || null;
    this.logger = options.logger || console;
    
    // Scoring weights
    this.weights = {
      mbfc: 0.4,           // MBFC rating
      corrections: 0.2,     // Correction rate (lower is better)
      age: 0.2,            // Domain age factor
      baseline: 0.2,       // Baseline reputation
      ...options.weights
    };
    
    // Cache for runtime lookups
    this.cache = new Map();
    
    // Load known sources into cache
    for (const [host, data] of Object.entries(KNOWN_SOURCES)) {
      this.cache.set(host, {
        credibilityScore: data.score,
        mbfcRating: data.mbfc,
        biasLabel: data.bias,
        updatedAt: new Date().toISOString()
      });
    }
  }
  
  /**
   * Get credibility rating for a source
   * 
   * @param {string} host - Source hostname (e.g., 'nytimes.com')
   * @param {Object} [options] - Options
   * @param {boolean} [options.useCache=true] - Use cached data
   * @returns {Object} Credibility rating
   */
  getSourceCredibility(host, options = {}) {
    const { useCache = true } = options;
    const normalizedHost = this._normalizeHost(host);
    
    // Check cache first
    if (useCache && this.cache.has(normalizedHost)) {
      return this.cache.get(normalizedHost);
    }
    
    // Check database
    if (this.trustAdapter) {
      const dbData = this.trustAdapter.getSourceCredibility(normalizedHost);
      if (dbData) {
        this.cache.set(normalizedHost, dbData);
        return dbData;
      }
    }
    
    // Check known sources
    if (KNOWN_SOURCES[normalizedHost]) {
      const known = KNOWN_SOURCES[normalizedHost];
      return {
        credibilityScore: known.score,
        mbfcRating: known.mbfc,
        biasLabel: known.bias,
        source: 'known',
        updatedAt: new Date().toISOString()
      };
    }
    
    // Unknown source - return default
    return {
      credibilityScore: DEFAULT_CREDIBILITY,
      mbfcRating: null,
      biasLabel: null,
      source: 'unknown',
      updatedAt: new Date().toISOString()
    };
  }
  
  /**
   * Calculate credibility score from multiple factors
   * 
   * @param {Object} factors - Credibility factors
   * @param {string} [factors.mbfcRating] - MBFC factual rating
   * @param {number} [factors.correctionCount] - Number of corrections issued
   * @param {number} [factors.articleCount] - Total articles from source
   * @param {number} [factors.domainAgeYears] - Domain age in years
   * @returns {number} Credibility score (0-100)
   */
  calculateScore(factors) {
    let score = 0;
    let totalWeight = 0;
    
    // MBFC rating component
    if (factors.mbfcRating && MBFC_SCORES[factors.mbfcRating]) {
      score += MBFC_SCORES[factors.mbfcRating] * this.weights.mbfc;
      totalWeight += this.weights.mbfc;
    }
    
    // Correction rate component (lower correction rate = higher score)
    if (factors.correctionCount !== undefined && factors.articleCount > 0) {
      const correctionRate = factors.correctionCount / factors.articleCount;
      // Ideal: <1% corrections
      const correctionScore = Math.max(0, 100 - (correctionRate * 1000));
      score += correctionScore * this.weights.corrections;
      totalWeight += this.weights.corrections;
    }
    
    // Domain age component (older = more established)
    if (factors.domainAgeYears !== undefined) {
      // Max benefit at 20+ years
      const ageScore = Math.min(100, (factors.domainAgeYears / 20) * 100);
      score += ageScore * this.weights.age;
      totalWeight += this.weights.age;
    }
    
    // Baseline reputation (if no other data)
    if (totalWeight === 0) {
      return DEFAULT_CREDIBILITY;
    }
    
    // Normalize by total weight used
    const normalizedScore = score / totalWeight;
    
    return Math.round(Math.max(0, Math.min(100, normalizedScore)));
  }
  
  /**
   * Update source credibility rating
   * 
   * @param {string} host - Source hostname
   * @param {Object} data - Credibility data
   * @param {number} [data.credibilityScore] - Overall score (0-100)
   * @param {string} [data.mbfcRating] - MBFC rating
   * @param {string} [data.biasLabel] - Bias label
   * @param {number} [data.correctionCount] - Correction count
   * @returns {Object} Updated credibility data
   */
  updateSource(host, data) {
    const normalizedHost = this._normalizeHost(host);
    
    const updatedData = {
      host: normalizedHost,
      credibilityScore: data.credibilityScore || DEFAULT_CREDIBILITY,
      mbfcRating: data.mbfcRating || null,
      biasLabel: data.biasLabel || null,
      correctionCount: data.correctionCount || 0,
      updatedAt: new Date().toISOString()
    };
    
    // Update cache
    this.cache.set(normalizedHost, updatedData);
    
    // Persist to database
    if (this.trustAdapter) {
      this.trustAdapter.saveSourceCredibility(updatedData);
    }
    
    return updatedData;
  }
  
  /**
   * Batch update sources from MBFC data
   * 
   * @param {Array} mbfcData - Array of {host, rating, bias}
   * @returns {Object} Update summary
   */
  batchUpdateFromMBFC(mbfcData) {
    let updated = 0;
    let skipped = 0;
    
    for (const item of mbfcData) {
      if (!item.host || !item.rating) {
        skipped++;
        continue;
      }
      
      const score = MBFC_SCORES[item.rating] || DEFAULT_CREDIBILITY;
      
      this.updateSource(item.host, {
        credibilityScore: score,
        mbfcRating: item.rating,
        biasLabel: item.bias || null
      });
      
      updated++;
    }
    
    return { updated, skipped };
  }
  
  /**
   * Get badge for credibility score
   * 
   * @param {number} score - Credibility score (0-100)
   * @returns {Object} Badge with emoji and label
   */
  getBadge(score) {
    if (score >= 80) {
      return { emoji: '✅', label: 'High', level: 'high', color: 'green' };
    } else if (score >= 50) {
      return { emoji: '⚠️', label: 'Mixed', level: 'mixed', color: 'yellow' };
    } else {
      return { emoji: '❌', label: 'Low', level: 'low', color: 'red' };
    }
  }
  
  /**
   * Get all known sources
   * 
   * @param {Object} [options] - Options
   * @param {number} [options.minScore=0] - Minimum score filter
   * @param {string} [options.biasFilter] - Filter by bias label
   * @returns {Array} Array of source credibility data
   */
  getAllSources(options = {}) {
    const { minScore = 0, biasFilter } = options;
    
    const sources = [];
    
    // From cache
    for (const [host, data] of this.cache) {
      if (data.credibilityScore >= minScore) {
        if (!biasFilter || data.biasLabel === biasFilter) {
          sources.push({ host, ...data });
        }
      }
    }
    
    // From database (if available)
    if (this.trustAdapter) {
      const dbSources = this.trustAdapter.getAllSourceCredibility({ minScore, biasFilter });
      for (const src of dbSources) {
        if (!this.cache.has(src.host)) {
          sources.push(src);
        }
      }
    }
    
    return sources.sort((a, b) => b.credibilityScore - a.credibilityScore);
  }
  
  /**
   * Normalize hostname
   * @private
   */
  _normalizeHost(host) {
    if (!host) return '';
    
    return host
      .toLowerCase()
      .replace(/^www\./, '')
      .replace(/\/$/, '')
      .trim();
  }
  
  /**
   * Get MBFC score mapping
   * @returns {Object}
   */
  getMBFCScores() {
    return { ...MBFC_SCORES };
  }
  
  /**
   * Get statistics
   * @returns {Object}
   */
  getStats() {
    let high = 0, mixed = 0, low = 0;
    
    for (const data of this.cache.values()) {
      if (data.credibilityScore >= 80) high++;
      else if (data.credibilityScore >= 50) mixed++;
      else low++;
    }
    
    return {
      cachedSources: this.cache.size,
      knownSources: Object.keys(KNOWN_SOURCES).length,
      highCredibility: high,
      mixedCredibility: mixed,
      lowCredibility: low,
      weights: this.weights
    };
  }
}

module.exports = { 
  SourceRater,
  MBFC_SCORES,
  BIAS_LABELS,
  KNOWN_SOURCES,
  DEFAULT_CREDIBILITY
};
