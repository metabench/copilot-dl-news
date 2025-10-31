/**
 * PatternDiscoveryManager - Unified pattern discovery from verified mappings
 *
 * Extracts common pattern discovery logic from DSPL functions.
 * Provides strategy-based discovery for different mapping types.
 */

const { PatternLearner } = require('./PatternLearner');

class PatternDiscoveryManager {
  /**
   * @param {object} options
   * @param {Console} [options.logger=console] - Logger instance
   */
  constructor({ logger = console } = {}) {
    this.logger = logger;
    this.patternLearner = new PatternLearner({ logger });
  }

  /**
   * Discover URL patterns from verified mappings
   * @param {Database} db - Database connection
   * @param {string} domain - Domain to analyze
   * @param {string} mappingType - Type of mappings ('country-hub', 'place-place-hub', etc.)
   * @returns {Array} Discovered patterns with confidence scores
   */
  discoverPatternsFromMappings(db, domain, mappingType = 'country-hub') {
    try {
      const mappings = this._getVerifiedMappings(db, domain, mappingType);

      if (mappings.length < 2) {
        return [];
      }

      const patterns = new Map();

      // Extract patterns from URL pairs
      for (let i = 0; i < mappings.length; i++) {
        for (let j = i + 1; j < mappings.length; j++) {
          const pattern = this.patternLearner.extractPatternFromUrls(mappings[i].url, mappings[j].url, mappingType);
          if (pattern) {
            const count = patterns.get(pattern) || 0;
            patterns.set(pattern, count + 1);
          }
        }
      }

      // Convert to pattern objects with confidence
      const discoveredPatterns = [];
      for (const [pattern, examples] of patterns) {
        const confidence = Math.min(examples / mappings.length, 0.9); // Max 90% confidence for discovered patterns
        discoveredPatterns.push({
          pattern,
          confidence,
          verified: false,
          examples,
          discovered: true
        });
      }

      // Sort by confidence
      discoveredPatterns.sort((a, b) => b.confidence - a.confidence);

      this.logger?.log?.(`[dspl] Discovered ${discoveredPatterns.length} ${mappingType} patterns for ${domain}`);
      return discoveredPatterns;

    } catch (error) {
      this.logger?.error?.(`[dspl] Pattern discovery failed for ${domain} (${mappingType}): ${error.message}`);
      return [];
    }
  }

  /**
   * Get verified mappings for a domain and mapping type
   * @param {Database} db - Database connection
   * @param {string} domain - Domain to query
   * @param {string} mappingType - Type of mappings to retrieve
   * @returns {Array} Array of mapping objects with url and place_id
   */
  _getVerifiedMappings(db, domain, mappingType) {
    const pageKindMap = {
      'country-hub': 'country-hub',
      'place-place-hub': 'place-place-hub',
      'place-topic-hub': 'place-topic-hub'
    };

    const pageKind = pageKindMap[mappingType] || mappingType;

    return db.prepare(`
      SELECT url, place_id FROM place_page_mappings
      WHERE host = ? AND page_kind = ? AND status = 'verified'
    `).all(domain, pageKind) || [];
  }

  /**
   * Update DSPL with newly verified patterns
   * @param {string} dsplDir - DSPL directory
   * @param {string} domain - Domain to update
   * @param {Array} newPatterns - New patterns to add
   * @param {string} patternType - Type of patterns ('countryHub' or 'placePlaceHub')
   */
  updateDsplWithPatterns(dsplDir, domain, newPatterns, patternType = 'countryHub') {
    try {
      const fs = require('fs');
      const path = require('path');

      const filePath = path.join(dsplDir, `${domain}.json`);

      let existingData = {};
      if (fs.existsSync(filePath)) {
        existingData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }

      if (!existingData[domain]) {
        existingData[domain] = {
          domain,
          generated: new Date().toISOString(),
          countryHubPatterns: [],
          placePlaceHubPatterns: []
        };
      }

      const patternKey = `${patternType}Patterns`;
      if (!existingData[domain][patternKey]) {
        existingData[domain][patternKey] = [];
      }

      const existingPatterns = new Map(
        existingData[domain][patternKey].map(p => [p.pattern, p])
      );

      // Add new patterns
      for (const newPattern of newPatterns) {
        if (!existingPatterns.has(newPattern.pattern)) {
          existingData[domain][patternKey].push({
            ...newPattern,
            verified: true, // Mark as verified since they come from verified mappings
            added: new Date().toISOString()
          });
        }
      }

      // Update stats
      const verified = existingData[domain][patternKey].filter(p => p.verified).length;
      const total = existingData[domain][patternKey].length;
      const statKey = patternType === 'countryHub' ? 'Patterns' : `${patternType}Patterns`;
      const exampleKey = patternType === 'countryHub' ? 'Examples' : `${patternType}Examples`;

      existingData[domain].stats = {
        ...existingData[domain].stats,
        [`total${statKey}`]: total,
        [`verified${statKey}`]: verified,
        [`total${exampleKey}`]: existingData[domain][patternKey].reduce((sum, p) => sum + (p.examples || 0), 0),
        lastUpdated: new Date().toISOString()
      };

      // Write back
      fs.writeFileSync(filePath, JSON.stringify(existingData, null, 2));
      this.logger?.log?.(`[dspl] Updated DSPL for ${domain} with ${newPatterns.length} new ${patternType} patterns`);

    } catch (error) {
      this.logger?.error?.(`[dspl] Failed to update DSPL for ${domain}: ${error.message}`);
    }
  }
}

module.exports = { PatternDiscoveryManager };