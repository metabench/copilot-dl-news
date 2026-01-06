/**
 * PredictionStrategyManager - Shared prediction strategies for HubGapAnalyzer classes
 *
 * Extracts common prediction logic from CountryHubGapAnalyzer, PlacePlaceHubGapAnalyzer,
 * and PlaceTopicHubGapAnalyzer to eliminate duplication and improve maintainability.
 *
 * Provides standardized prediction strategies that can be configured for different entity types.
 */

const { getDb } = require('../../db');

class PredictionStrategyManager {
  /**
   * @param {Object} config - Configuration for prediction strategies
   * @param {import('better-sqlite3').Database} config.db - Database connection
   * @param {Map} config.dspls - DSPL library map
   * @param {string} config.entityType - Entity type ('country', 'place-place', 'place-topic')
   * @param {Function} config.buildMetadata - Function to build entity metadata
   * @param {Console} [config.logger=console] - Logger instance
   */
  constructor({ db, dspls, entityType, buildMetadata, logger = console }) {
    this.db = db;
    if (!this.db) this.db = getDb();
    if (this.db && typeof this.db.getHandle === 'function') this.db = this.db.getHandle();

    this.dspls = dspls;
    this.entityType = entityType;
    this.buildMetadata = buildMetadata;
    this.logger = logger;
  }

  /**
   * Predict URLs using DSPL patterns
   * @param {Object} entity - Entity to predict for
   * @param {string} domain - Target domain
   * @param {Object} options - Additional options
   * @returns {Array<Object>} Predictions with confidence scores
   */
  predictFromDspl(entity, domain, options = {}) {
    const predictions = [];
    const dspl = this.dspls.get(domain) || this.dspls.get(`www.${domain}`);

    if (!dspl) return predictions;

    const patterns = this._getDsplPatterns(dspl);
    if (!patterns || patterns.length === 0) return predictions;

    const metadata = this.buildMetadata(entity);
    if (!metadata) return predictions;

    for (const pattern of patterns) {
      if (pattern.verified === false) continue;

      const url = this._generateUrlFromPattern(pattern.pattern || pattern, metadata, domain);
      if (url) {
        predictions.push({
          url,
          confidence: pattern.confidence || 0.8,
          strategy: 'dspl',
          pattern: pattern.pattern || pattern,
          entity,
          domain
        });
      }
    }

    return predictions;
  }

  /**
   * Predict URLs using gazetteer/learned patterns from existing mappings
   * @param {Object} entity - Entity to predict for
   * @param {string} domain - Target domain
   * @param {Object} options - Additional options
   * @returns {Array<Object>} Predictions with confidence scores
   */
  predictFromGazetteer(entity, domain, options = {}) {
    const predictions = [];
    const baseUrl = `https://${domain}`;
    const metadata = this.buildMetadata(entity);

    if (!metadata) return predictions;

    // Get existing mappings for learning patterns
    const existingMappings = this._getExistingMappings(domain);
    if (existingMappings.length < 2) return predictions;

    // Extract patterns from existing URLs
    const patterns = this._extractPatternsFromUrls(existingMappings.map(m => m.url), domain, metadata);

    for (const pattern of patterns) {
      const url = this._formatPatternWithMetadata(pattern, metadata);

      try {
        const fullUrl = new URL(url, baseUrl).href;
        predictions.push({
          url: fullUrl,
          confidence: 0.7, // Lower than DSPL but higher than generic
          strategy: 'gazetteer-learned',
          pattern,
          entity,
          domain
        });
      } catch (err) {
        // Skip invalid URLs
      }
    }

    return predictions;
  }

  /**
   * Predict URLs using common hardcoded patterns
   * @param {Object} entity - Entity to predict for
   * @param {string} domain - Target domain
   * @param {Array} patterns - Array of {pattern, confidence} objects
   * @returns {Array<Object>} Predictions with confidence scores
   */
  predictFromCommonPatterns(entity, domain, patterns = []) {
    const predictions = [];
    const baseUrl = `https://${domain}`;
    const metadata = this.buildMetadata(entity);

    if (!metadata) return predictions;

    for (const { pattern, confidence } of patterns) {
      try {
        const formatted = this._formatPatternWithMetadata(pattern, metadata);
        const url = new URL(formatted, baseUrl).href;
        predictions.push({
          url,
          confidence,
          strategy: 'common-patterns',
          pattern,
          entity,
          domain
        });
      } catch (err) {
        // Skip invalid URLs
      }
    }

    return predictions;
  }

  /**
   * Predict URLs using crawl data (urls table)
   * @param {Object} entity - Entity to predict for
   * @param {string} domain - Target domain
   * @returns {Array<Object>} Predictions with confidence scores
   */
  predictFromCrawlData(entity, domain) {
    const predictions = [];
    const metadata = this.buildMetadata(entity);
    if (!metadata || !metadata.slug) return predictions;

    // Prepare statement if not already prepared
    if (!this._crawlDataStmt) {
      try {
        this._crawlDataStmt = this.db.prepare(`
          SELECT url FROM urls
          WHERE host = ? AND url LIKE ?
          LIMIT 20
        `);
      } catch (err) {
        // Handle missing table
        return [];
      }
    }

    const patterns = [
      `%/${metadata.slug}`,
      `%/${metadata.slug}/%`
    ];
    
    // Add code if available
    if (metadata.code) {
        patterns.push(`%/${metadata.code.toLowerCase()}`);
        patterns.push(`%/${metadata.code.toLowerCase()}/%`);
    }

    const seenUrls = new Set();

    for (const pattern of patterns) {
      try {
        const rows = this._crawlDataStmt.all(domain, pattern);
        for (const row of rows) {
            if (seenUrls.has(row.url)) continue;
            seenUrls.add(row.url);

            // Simple heuristic: shorter URLs are more likely to be hubs
            // and URLs ending in the slug are better
            let confidence = 0.5;
            if (row.url.endsWith(`/${metadata.slug}`) || row.url.endsWith(`/${metadata.slug}/`)) {
                confidence = 0.8;
            } else if (row.url.includes(`/world/${metadata.slug}`)) {
                confidence = 0.7;
            }

            predictions.push({
                url: row.url,
                confidence,
                strategy: 'crawl-data',
                pattern: pattern,
                entity,
                domain
            });
        }
      } catch (err) {
        // Ignore errors
      }
    }

    return predictions;
  }

  /**
   * Predict URLs using regional fallback patterns
   * @param {Object} entity - Entity to predict for
   * @param {string} domain - Target domain
   * @param {Object} options - Additional options
   * @returns {Array<Object>} Predictions with confidence scores
   */
  predictFromRegionalPatterns(entity, domain, options = {}) {
    const predictions = [];
    const baseUrl = `https://${domain}`;
    const metadata = this.buildMetadata(entity);

    if (!metadata) return predictions;

    // Check if entity has coverage - if not, try regional patterns
    const hasCoverage = this._checkEntityCoverage(entity, domain);
    if (hasCoverage) return predictions;

    const regionalPatterns = this._getRegionalPatterns(entity, metadata);

    for (const { pattern, confidence } of regionalPatterns) {
      try {
        const formatted = this._formatPatternWithMetadata(pattern, metadata);
        const url = new URL(formatted, baseUrl).href;
        predictions.push({
          url,
          confidence: confidence || 0.2, // Low confidence for regional fallbacks
          strategy: 'regional-fallback',
          pattern,
          entity,
          domain
        });
      } catch (err) {
        // Skip invalid URLs
      }
    }

    return predictions;
  }

  // ============ Private Methods ============

  _getDsplPatterns(dspl) {
    const propertyMap = {
      'country': 'countryHubPatterns',
      'place-place': 'placePlaceHubPatterns',
      'place-topic': 'placeTopicHubPatterns',
      'city': 'cityHubPatterns',
      'region': 'regionHubPatterns',
      'topic': 'topicHubPatterns'
    };

    const propertyName = propertyMap[this.entityType];
    return dspl?.[propertyName] || [];
  }

  _generateUrlFromPattern(pattern, metadata, domain) {
    const baseUrl = `https://${domain}`;
    const formatted = this._formatPatternWithMetadata(pattern, metadata);

    try {
      return new URL(formatted, baseUrl).href;
    } catch (err) {
      return null;
    }
  }

  _formatPatternWithMetadata(pattern, metadata) {
    if (!pattern || !metadata) return pattern;

    let formatted = pattern;
    for (const [key, value] of Object.entries(metadata)) {
      const placeholder = `{${key}}`;
      if (formatted.includes(placeholder)) {
        formatted = formatted.replace(new RegExp(placeholder, 'g'), value || '');
      }
    }
    return formatted;
  }

  _getExistingMappings(domain) {
    // This will be overridden by subclasses or passed in config
    // Default implementation returns empty array
    return [];
  }

  _extractPatternsFromUrls(urls, domain, metadata) {
    // Default implementation - can be overridden
    const patterns = new Set();

    for (const url of urls) {
      try {
        const urlObj = new URL(url);
        if (urlObj.hostname !== domain) continue;

        const path = urlObj.pathname;
        // Generic pattern extraction - subclasses can override for specific logic
        const genericPattern = this._extractGenericPattern(path, metadata);
        if (genericPattern) {
          patterns.add(genericPattern);
        }
      } catch (err) {
        // Skip invalid URLs
      }
    }

    return Array.from(patterns);
  }

  _extractGenericPattern(path, metadata) {
    // Generic pattern extraction - replace entity-specific values with placeholders
    let pattern = path;
    for (const [key, value] of Object.entries(metadata)) {
      if (value && typeof value === 'string') {
        pattern = pattern.replace(new RegExp(value, 'g'), `{${key}}`);
      }
    }
    return pattern !== path ? pattern : null;
  }

  _checkEntityCoverage(entity, domain) {
    // Default implementation - subclasses should override
    return false;
  }

  _getRegionalPatterns(entity, metadata) {
    // Default implementation - subclasses should override
    return [];
  }
}

module.exports = { PredictionStrategyManager };