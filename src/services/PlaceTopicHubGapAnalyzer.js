/**
 * PlaceTopicHubGapAnalyzer - Service for analyzing place-topic combination hub coverage gaps
 *
 * Extends HubGapAnalyzerBase to provide place-topic combination URL prediction
 * and gap analysis for news website coverage.
 *
 * Provides gap analysis, predictions, and pattern learning for place-topic combination hubs
 * like /world/france/politics or /sport/iceland.
 *
 * Uses database query module for all SQL operations (no inline SQL).
 * Learns URL patterns from existing data via Domain-Specific Pattern Libraries (DSPLs).
 */

const { HubGapAnalyzerBase } = require('./HubGapAnalyzerBase');
const { getDsplForDomain } = require('./shared/dspl');
const { slugify } = require('../tools/slugify');
const { PredictionStrategyManager } = require('./shared/PredictionStrategyManager');
const { UrlPatternGenerator } = require('./shared/UrlPatternGenerator');

class PlaceTopicHubGapAnalyzer extends HubGapAnalyzerBase {
  constructor({ 
    db,
    logger = console,
    dsplDir
  } = {}) {
    super({ db, logger, dsplDir });
    
    // Initialize shared prediction manager
    this.predictionManager = new PredictionStrategyManager({
      db: this.db,
      dspls: this.dspls,
      entityType: 'place-topic',
      buildMetadata: this.buildEntityMetadata.bind(this),
      logger: this.logger
    });
    
    // Override methods for place-topic specific logic
    this.predictionManager._getExistingMappings = (domain) => {
      try {
        // For place-topic, we need to get mappings from place_hubs table
        return this.db.prepare(`
          SELECT url FROM place_hubs
          WHERE host = ? AND topic_slug IS NOT NULL
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

    this.predictionManager._extractPatternsFromUrls = (urls, domain, metadata) => {
      return this.extractPatternsFromUrls(urls, domain, metadata);
    };

    this.predictionManager._getRegionalPatterns = (entity, metadata) => {
      // For place-topic, use regional fallback patterns
      const region = metadata.region;
      return [
        { pattern: `/world/${region}/{topicSlug}`, confidence: 0.3 },
        { pattern: `/news/world/${region}/{topicSlug}`, confidence: 0.25 },
        { pattern: `/international/${region}/{topicSlug}`, confidence: 0.2 }
      ];
    };
    
    // Cache for analysis results
    this.lastAnalysis = null;
    this.lastAnalysisTime = 0;
    this.analysisCacheMs = 5000;
  }  /**
   * Place-topic combination label for DSPL lookups and logging
   */
  getEntityLabel() {
    return 'place-topic';
  }

  /**
   * Fallback patterns for place-topic combination hubs
   */
  getFallbackPatterns() {
    return [
      '/world/{placeSlug}/{topicSlug}',
      '/news/world/{placeSlug}/{topicSlug}',
      '/{placeSlug}/{topicSlug}',
      '/news/{placeSlug}/{topicSlug}',
      '/{topicSlug}/{placeSlug}',
      '/news/{topicSlug}/{placeSlug}',
      '/world/{region}/{placeSlug}/{topicSlug}',
      '/news/world/{region}/{placeSlug}/{topicSlug}'
    ];
  }

  /**
   * Build metadata for place-topic combination entity
   * @param {Object} combination - Combination object with place and topic
   * @param {Object} combination.place - Place entity {name, code, kind, slug}
   * @param {Object} combination.topic - Topic entity {slug, label, kind}
   * @returns {Object|null} Object with placeholder keys for pattern substitution
   */
  buildEntityMetadata(combination) {
    if (!combination || !combination.place || !combination.topic) return null;

    const { place, topic } = combination;

    if (!place.name || !topic.slug) return null;

    const placeSlug = place.slug || slugify(place.name);
    const topicSlug = topic.slug;
    const placeCode = place.code ? place.code.toLowerCase() : '';
    const region = this._getRegion(placeCode);

    return {
      placeSlug,
      placeCode,
      placeName: place.name,
      topicSlug,
      topicLabel: topic.label || topicSlug,
      region
    };
  }

  /**
   * Enhanced URL prediction for place-topic combinations
   * @param {string} domain - Target domain
   * @param {Object} place - Place entity {name, code, kind}
   * @param {Object} topic - Topic entity {slug, label, kind}
   * @returns {Array<Object>} Predicted URL objects with confidence scores
   */
  predictCombinationUrls(domain, place, topic) {
    const combination = { place, topic };
    const predictions = [];

    // Strategy 1: DSPL patterns (highest priority)
    const dsplPredictions = this.predictionManager.predictFromDspl(combination, domain);
    predictions.push(...dsplPredictions);

    // Strategy 2: Gazetteer-based patterns
    const gazetteerPredictions = this.predictionManager.predictFromGazetteer(combination, domain);
    predictions.push(...gazetteerPredictions);

    // Strategy 3: Common combination patterns as fallback (only if no DSPL patterns exist)
    if (dsplPredictions.length === 0) {
      const commonPatterns = [
        { pattern: `/world/{placeSlug}/{topicSlug}`, confidence: 0.7 },
        { pattern: `/news/world/{placeSlug}/{topicSlug}`, confidence: 0.65 },
        { pattern: `/{placeSlug}/{topicSlug}`, confidence: 0.6 },
        { pattern: `/news/{placeSlug}/{topicSlug}`, confidence: 0.55 },
        { pattern: `/{topicSlug}/{placeSlug}`, confidence: 0.5 },
        { pattern: `/news/{topicSlug}/{placeSlug}`, confidence: 0.45 },
        { pattern: `/world/{region}/{placeSlug}/{topicSlug}`, confidence: 0.4 },
        { pattern: `/news/world/{region}/{placeSlug}/{topicSlug}`, confidence: 0.35 }
      ];
      const commonPredictions = this.predictionManager.predictFromCommonPatterns(combination, domain, commonPatterns);
      predictions.push(...commonPredictions);
    }

    // Strategy 4: Regional patterns for uncovered combinations
    const regionalPredictions = this.predictionManager.predictFromRegionalPatterns(combination, domain);
    predictions.push(...regionalPredictions);

    // Remove duplicates and score predictions
    const uniquePredictions = this.deduplicateAndScore(predictions);

    return uniquePredictions.slice(0, 3).map(p => p.url); // Return just URLs for compatibility
  }

  /**
   * Analyze place-topic combination coverage for a specific domain
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

    const combinationStats = hubStats.perKind?.['place-topic'] || { seeded: 0, visited: 0 };
    const coverage = host
      ? this._getCombinationCoverage(host)
      : { seeded: 0, visited: 0, missingCombinations: [], totalCombinations: 0, missing: 0 };

    const seeded = coverage.seeded || combinationStats.seeded || 0;
    const visited = coverage.visited || combinationStats.visited || 0;
    const missingCombinations = coverage.missingCombinations || [];
    const missing = coverage.missing ?? Math.max(seeded - visited, 0);

    const coveragePercent = seeded > 0 ? Math.round((visited / seeded) * 100) : 0;
    const totalCombinations = coverage.totalCombinations || seeded;
    const isComplete = missing === 0 && totalCombinations > 0;

    const analysis = {
      domain: host,
      seeded,
      visited,
      missing,
      coveragePercent,
      isComplete,
      timestamp: new Date().toISOString(),
      totalCombinations,
      missingCombinations
    };

    // Cache result
    if (!this.lastAnalysis) this.lastAnalysis = {};
    this.lastAnalysis[cacheKey] = analysis;
    this.lastAnalysisTime = now;

    return analysis;
  }

  /**
   * Generate gap predictions for missing place-topic combinations
   * @param {string} domain - Target domain
   * @param {Array} missingCombinations - Array of {place, topic} for missing combinations
   * @returns {Array} Prediction objects
   */
  generatePredictions(domain, missingCombinations = []) {
    const predictions = [];

    for (const combination of missingCombinations) {
      const predictedUrls = this.predictCombinationUrls(domain, combination.place, combination.topic);

      for (const url of predictedUrls) {
        predictions.push({
          url,
          placeName: combination.place.name,
          placeCode: combination.place.code,
          topicSlug: combination.topic.slug,
          topicLabel: combination.topic.label,
          confidence: this._calculateCombinationConfidence(combination),
          priority: this._calculateCombinationPriority(combination),
          predictionSource: 'place-topic-combination-gap-analysis',
          timestamp: new Date().toISOString()
        });
      }
    }

    return predictions;
  }

  // Private methods

  _getRegion(countryCode) {
    const upperCode = countryCode?.toUpperCase();
    const regionMap = {
      // Asia
      'CN': 'asia', 'JP': 'asia', 'IN': 'asia', 'KR': 'asia', 'SG': 'asia', 'HK': 'asia', 'TW': 'asia',
      'TH': 'asia', 'MY': 'asia', 'ID': 'asia', 'PH': 'asia', 'VN': 'asia', 'PK': 'asia', 'BD': 'asia',
      'LK': 'asia', 'NP': 'asia', 'MM': 'asia', 'KH': 'asia', 'LA': 'asia', 'MN': 'asia',
      
      // Europe
      'GB': 'europe', 'DE': 'europe', 'FR': 'europe', 'IT': 'europe', 'ES': 'europe', 'RU': 'europe',
      'NL': 'europe', 'BE': 'europe', 'AT': 'europe', 'CH': 'europe', 'SE': 'europe', 'NO': 'europe',
      'DK': 'europe', 'FI': 'europe', 'PL': 'europe', 'CZ': 'europe', 'HU': 'europe', 'RO': 'europe',
      'BG': 'europe', 'GR': 'europe', 'PT': 'europe', 'IE': 'europe', 'SK': 'europe', 'SI': 'europe',
      'HR': 'europe', 'BA': 'europe', 'ME': 'europe', 'MK': 'europe', 'AL': 'europe', 'RS': 'europe',
      'EE': 'europe', 'LV': 'europe', 'LT': 'europe', 'UA': 'europe', 'BY': 'europe', 'MD': 'europe',
      
      // Americas
      'US': 'americas', 'CA': 'americas', 'MX': 'americas', 'BR': 'americas', 'AR': 'americas', 'CL': 'americas',
      'CO': 'americas', 'PE': 'americas', 'VE': 'americas', 'EC': 'americas', 'BO': 'americas', 'PY': 'americas',
      'UY': 'americas', 'GY': 'americas', 'SR': 'americas', 'GF': 'americas', 'CR': 'americas', 'PA': 'americas',
      'NI': 'americas', 'HN': 'americas', 'SV': 'americas', 'GT': 'americas', 'BZ': 'americas', 'JM': 'americas',
      'HT': 'americas', 'DO': 'americas', 'CU': 'americas', 'PR': 'americas',
      
      // Oceania
      'AU': 'oceania', 'NZ': 'oceania', 'FJ': 'oceania', 'PG': 'oceania', 'SB': 'oceania', 'VU': 'oceania',
      
      // Africa
      'ZA': 'africa', 'EG': 'africa', 'NG': 'africa', 'KE': 'africa', 'MA': 'africa', 'TN': 'africa',
      'GH': 'africa', 'CI': 'africa', 'SN': 'africa', 'ML': 'africa', 'BF': 'africa', 'NE': 'africa',
      'TD': 'africa', 'CM': 'africa', 'GA': 'africa', 'CG': 'africa', 'CD': 'africa', 'AO': 'africa',
      'MZ': 'africa', 'ZW': 'africa', 'ZM': 'africa', 'BW': 'africa', 'NA': 'africa', 'TZ': 'africa',
      'UG': 'africa', 'RW': 'africa', 'BI': 'africa', 'ET': 'africa', 'DJ': 'africa', 'SO': 'africa',
      'SD': 'africa', 'SS': 'africa', 'LY': 'africa', 'DZ': 'africa', 'TN': 'africa'
    };
    return regionMap[upperCode] || 'international';
  }

  _getCombinationCoverage(domain) {
    // Get coverage statistics for place-topic combinations
    const stats = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN topic_slug IS NOT NULL THEN 1 END) as with_topics,
        COUNT(CASE WHEN topic_slug IS NOT NULL AND last_seen_at IS NOT NULL THEN 1 END) as visited
      FROM place_hubs
      WHERE host = ?
    `).get(domain) || { total: 0, with_topics: 0, visited: 0 };

    return {
      seeded: stats.with_topics,
      visited: stats.visited,
      missing: Math.max(0, stats.with_topics - stats.visited),
      totalCombinations: stats.with_topics,
      missingCombinations: [] // Would need more complex query to determine
    };
  }

  _calculateCombinationConfidence(combination) {
    // Base confidence on place importance and topic relevance
    const placeImportance = combination.place.importance || 50;
    const topicRelevance = combination.topic.relevance || 0.5;

    const importanceNormalized = Math.min((placeImportance || 0) / 100, 1.0);
    return 0.3 + (importanceNormalized * 0.4) + (topicRelevance * 0.3);
  }

  _calculateCombinationPriority(combination) {
    return Math.max(5, Math.floor((combination.place.importance || 0) / 10));
  }
}

module.exports = { PlaceTopicHubGapAnalyzer };