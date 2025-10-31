/**
 * PlacePlaceHubGapAnalyzer - Service for analyzing place-place hub coverage gaps
 *
 * Extends HubGapAnalyzerBase to provide hierarchical place-place hub URL prediction
 * and gap analysis for news website coverage.
 *
 * Handles geographic hierarchies like /us/california (country/region) or /us/california/los-angeles (country/region/city).
 * Uses database query module for all SQL operations (no inline SQL).
 */

const { getPlacesByCountryAndKind, getPlaceHierarchy } = require('../db/sqlite/v1/queries/gazetteer.places');
const { getPlacePlaceHubCoverage } = require('../db/sqlite/v1/queries/placePageMappings');
const { HubGapAnalyzerBase } = require('./HubGapAnalyzerBase');
const { getDsplForDomain } = require('./shared/dspl');
const { slugify } = require('../tools/slugify');
const { PredictionStrategyManager } = require('./shared/PredictionStrategyManager');
const { UrlPatternGenerator } = require('./shared/UrlPatternGenerator');

class PlacePlaceHubGapAnalyzer extends HubGapAnalyzerBase {
  constructor({ 
    db,
    gazetteerData = null,
    logger = console,
    dsplDir
  } = {}) {
    super({ db, logger, dsplDir });
    
    this.gazetteerData = gazetteerData;
    
    // Initialize shared prediction manager
    this.predictionManager = new PredictionStrategyManager({
      db: this.db,
      dspls: this.dspls,
      entityType: 'place-place',
      buildMetadata: this.buildEntityMetadata.bind(this),
      logger: this.logger
    });
    
    // Override methods for place-place specific logic
    this.predictionManager._getExistingMappings = (domain) => {
      try {
        return this.db.prepare(`
          SELECT url FROM place_page_mappings
          WHERE host = ? AND page_kind = 'place-place-hub' AND status = 'verified'
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
      return this.extractPatternsFromUrls(urls, domain);
    };

    this.predictionManager._getRegionalPatterns = (entity, metadata) => {
      // For place-place, use parent-type based patterns
      const parentKind = entity.parentKind;
      const patternMap = {
        'country': [
          { pattern: '/{parentSlug}/{childSlug}', confidence: 0.4 },
          { pattern: '/world/{parentSlug}/{childSlug}', confidence: 0.3 },
          { pattern: '/news/{parentSlug}/{childSlug}', confidence: 0.3 }
        ],
        'region': [
          { pattern: '/{parentSlug}/{childSlug}', confidence: 0.4 },
          { pattern: '/places/{parentSlug}/{childSlug}', confidence: 0.3 },
          { pattern: '/location/{parentSlug}/{childSlug}', confidence: 0.3 }
        ],
        'city': [
          { pattern: '/{parentSlug}/{childSlug}', confidence: 0.4 },
          { pattern: '/cities/{parentSlug}/{childSlug}', confidence: 0.3 }
        ]
      };
      return patternMap[parentKind] || [{ pattern: '/{parentSlug}/{childSlug}', confidence: 0.4 }];
    };
    
    // Cache for analysis results
    this.lastAnalysis = null;
    this.lastAnalysisTime = 0;
    this.analysisCacheMs = 5000;
  }  /**
   * Place-place hub label for DSPL lookups and logging
   */
  getEntityLabel() {
    return 'place-place';
  }

  /**
   * Fallback patterns for place-place hubs
   * These handle hierarchical relationships like country/region or region/city
   */
  getFallbackPatterns() {
    return [
      '/{parentSlug}/{childSlug}',
      '/world/{parentSlug}/{childSlug}',
      '/news/{parentSlug}/{childSlug}',
      '/{parentSlug}/news/{childSlug}',
      '/places/{parentSlug}/{childSlug}',
      '/location/{parentSlug}/{childSlug}'
    ];
  }

  /**
   * Build metadata for hierarchical place-place entity
   * @param {Object} hierarchy - Hierarchy object with parent and child place data
   * @returns {Object|null} Object with placeholder keys for URL generation
   */
  buildEntityMetadata(hierarchy) {
    if (!hierarchy || !hierarchy.parent || !hierarchy.child) return null;

    const parent = hierarchy.parent;
    const child = hierarchy.child;

    // Get preferred names
    const parentName = this._getPreferredName(parent.id);
    const childName = this._getPreferredName(child.id);

    if (!parentName || !childName) return null;

    const parentSlug = slugify(parentName);
    const childSlug = slugify(childName);

    return {
      parentSlug,
      childSlug,
      parentName,
      childName,
      parentKind: parent.kind,
      childKind: child.kind,
      countryCode: parent.country_code || child.country_code
    };
  }

  /**
   * Get hierarchical place relationships for URL prediction
   * @param {string} domain - Target domain
   * @param {Object} hierarchy - Parent-child place relationship
   * @returns {Array<string>} Array of candidate URLs
   */
  predictHubUrls(domain, hierarchy) {
    // Use the base class implementation but with our custom metadata
    return super.predictHubUrls(domain, hierarchy);
  }

  /**
   * Get all hierarchical place relationships (country->region, region->city, etc.)
   * @returns {Array} Array of hierarchy objects with parent/child data
   */
  getAllHierarchies() {
    return getPlaceHierarchy(this.db);
  }

  /**
   * Get top hierarchical relationships by importance/population
   * @param {number} limit - Maximum number of hierarchies to return
   * @returns {Array} Top hierarchies
   */
  getTopHierarchies(limit = 100) {
    const hierarchies = this.getAllHierarchies();

    // Sort by combined importance/population of parent and child
    return hierarchies
      .map(h => ({
        ...h,
        combinedScore: (h.parent.population || 0) + (h.child.population || 0) +
                      (h.parent.importance || 0) + (h.child.importance || 0)
      }))
      .sort((a, b) => b.combinedScore - a.combinedScore)
      .slice(0, limit);
  }

  /**
   * Enhanced URL prediction with multiple strategies for hierarchical relationships
   * @param {string} domain - Target domain
   * @param {Object} hierarchy - Parent-child place relationship
   * @returns {Array<Object>} Predicted URL objects with confidence scores
   */
  predictPlacePlaceHubUrls(domain, hierarchy) {
    const entity = hierarchy;
    const predictions = [];

    // Strategy 1: DSPL patterns (highest priority)
    const dsplPredictions = this.predictionManager.predictFromDspl(entity, domain);
    predictions.push(...dsplPredictions);

    // Strategy 2: Gazetteer-based patterns
    const gazetteerPredictions = this.predictionManager.predictFromGazetteer(entity, domain);
    predictions.push(...gazetteerPredictions);

    // Strategy 3: Common hierarchical hub patterns as fallback (only if no DSPL patterns exist)
    if (dsplPredictions.length === 0) {
      const commonPatterns = [
        { pattern: `/{parentSlug}/{childSlug}`, confidence: 0.6 },
        { pattern: `/world/{parentSlug}/{childSlug}`, confidence: 0.5 },
        { pattern: `/news/{parentSlug}/{childSlug}`, confidence: 0.5 },
        { pattern: `/{parentSlug}/news/{childSlug}`, confidence: 0.4 },
        { pattern: `/places/{parentSlug}/{childSlug}`, confidence: 0.4 },
        { pattern: `/location/{parentSlug}/{childSlug}`, confidence: 0.3 }
      ];
      const commonPredictions = this.predictionManager.predictFromCommonPatterns(entity, domain, commonPatterns);
      predictions.push(...commonPredictions);
    }

    // Strategy 4: Regional patterns for uncovered hierarchies
    const regionalPredictions = this.predictionManager.predictFromRegionalPatterns(entity, domain);
    predictions.push(...regionalPredictions);

    // Remove duplicates and score predictions
    const uniquePredictions = this.deduplicateAndScore(predictions);

    return uniquePredictions.slice(0, 5).map(p => p.url); // Return just URLs for compatibility
  }

  /**
   * Analyze place-place hub coverage for a specific domain
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

    const coverage = host
      ? getPlacePlaceHubCoverage(this.db, host)
      : { seeded: 0, visited: 0, missingHierarchies: [], totalHierarchies: 0, missing: 0 };

    const seeded = coverage.seeded || 0;
    const visited = coverage.visited || 0;
    const missingHierarchies = coverage.missingHierarchies || [];
    const missing = coverage.missing ?? Math.max(seeded - visited, 0);

    const coveragePercent = seeded > 0 ? Math.round((visited / seeded) * 100) : 0;
    const totalHierarchies = coverage.totalHierarchies || seeded;
    const isComplete = missing === 0 && totalHierarchies > 0;

    const analysis = {
      domain: host,
      seeded,
      visited,
      missing,
      coveragePercent,
      isComplete,
      timestamp: new Date().toISOString(),
      totalHierarchies,
      missingHierarchies
    };

    // Cache result
    if (!this.lastAnalysis) this.lastAnalysis = {};
    this.lastAnalysis[cacheKey] = analysis;
    this.lastAnalysisTime = now;

    return analysis;
  }

  /**
   * Generate gap predictions for missing hierarchical relationships
   * @param {string} domain - Target domain
   * @param {Array} missingHierarchies - Array of missing hierarchy objects
   * @returns {Array} Prediction objects
   */
  generatePredictions(domain, missingHierarchies = []) {
    const predictions = [];

    for (const hierarchy of missingHierarchies) {
      const predictedUrls = this.predictPlacePlaceHubUrls(domain, hierarchy);

      for (const url of predictedUrls) {
        predictions.push({
          url,
          hierarchy,
          confidence: this._calculateConfidence(hierarchy),
          priority: this._calculatePriority(hierarchy),
          predictionSource: 'place-place-hub-gap-analysis',
          timestamp: new Date().toISOString()
        });
      }
    }

    return predictions;
  }

  // Private helper methods

  _getPreferredName(placeId) {
    const result = this.db.prepare(`
      SELECT name FROM place_names
      WHERE place_id = ? AND is_preferred = 1
      LIMIT 1
    `).get(placeId);

    return result?.name || null;
  }

  _getPatternsForParentType(parentKind) {
    const patternMap = {
      'country': [
        '/{parentSlug}/{childSlug}',
        '/world/{parentSlug}/{childSlug}',
        '/news/{parentSlug}/{childSlug}'
      ],
      'region': [
        '/{parentSlug}/{childSlug}',
        '/places/{parentSlug}/{childSlug}',
        '/location/{parentSlug}/{childSlug}'
      ],
      'city': [
        '/{parentSlug}/{childSlug}',
        '/cities/{parentSlug}/{childSlug}'
      ]
    };

    return patternMap[parentKind] || ['/{parentSlug}/{childSlug}'];
  }

  _calculateConfidence(hierarchy) {
    const parentScore = (hierarchy.parent.population || 0) / 1000000; // Normalize population
    const childScore = (hierarchy.child.population || 0) / 100000; // Cities have smaller populations
    const combinedScore = Math.min(parentScore + childScore, 1.0);

    return 0.3 + (combinedScore * 0.5); // Base 0.3, up to 0.8
  }

  _calculatePriority(hierarchy) {
    return Math.max(5,
      Math.floor((hierarchy.parent.population || 0) / 1000000) +
      Math.floor((hierarchy.child.population || 0) / 100000)
    );
  }
}

module.exports = { PlacePlaceHubGapAnalyzer };