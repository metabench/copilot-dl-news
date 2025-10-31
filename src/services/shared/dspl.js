'use strict';

const fs = require('fs');
const path = require('path');
const { PatternDiscoveryManager } = require('./PatternDiscoveryManager');

/**
 * Load Domain-Specific Pattern Libraries (DSPLs) from disk.
 *
 * Each DSPL file is expected to be a JSON document containing
 * a mapping of domain -> metadata (patterns, stats, etc.).
 *
 * @param {object} options
 * @param {string} options.dsplDir - Directory containing DSPL JSON files.
 * @param {Console} [options.logger=console] - Logger instance.
 * @returns {Map<string, object>} Map of domain (including www. variants) to DSPL entry.
 */
function loadDsplLibrary({ dsplDir, logger = console } = {}) {
  const dspls = new Map();

  if (!dsplDir || !fs.existsSync(dsplDir)) {
    logger?.warn?.(`[dspl] DSPL directory not found: ${dsplDir}`);
    return dspls;
  }

  const files = fs.readdirSync(dsplDir).filter((file) => file.endsWith('.json'));
  logger?.log?.(`[dspl] Found ${files.length} DSPL file(s) in ${dsplDir}`);

  for (const file of files) {
    const filePath = path.join(dsplDir, file);
    try {
      const contents = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(contents);
      for (const [domain, entry] of Object.entries(data)) {
        dspls.set(domain, entry);
        dspls.set(`www.${domain}`, entry);
      }
    } catch (error) {
      logger?.error?.(`[dspl] Failed to load DSPL ${file}: ${error.message}`);
    }
  }

  return dspls;
}

/**
 * Retrieve DSPL metadata for a given domain (handles www. prefix).
 *
 * @param {Map<string, object>} dsplMap - DSPL library map.
 * @param {string} domain - Hostname to look up.
 * @returns {object|null} DSPL entry or null when not available.
 */
function getDsplForDomain(dsplMap, domain) {
  if (!domain || !dsplMap) return null;
  const normalized = String(domain).toLowerCase();
  return dsplMap.get(normalized) || dsplMap.get(normalized.replace(/^www\./, '')) || null;
}

/**
 * Automatically discover URL patterns from verified country hub mappings
 * @param {Database} db - Database connection
 * @param {string} domain - Domain to analyze
 * @param {Console} logger - Logger instance
 * @returns {Array} Discovered patterns with confidence scores
 */
function discoverPatternsFromMappings(db, domain, logger = console) {
  const manager = new PatternDiscoveryManager({ logger });
  return manager.discoverPatternsFromMappings(db, domain, 'country-hub');
}

/**
 * Update DSPL with newly verified patterns
 * @param {string} dsplDir - DSPL directory
 * @param {string} domain - Domain to update
 * @param {Array} newPatterns - New patterns to add
 * @param {Console} logger - Logger instance
 */
function updateDsplWithPatterns(dsplDir, domain, newPatterns, logger = console) {
  const manager = new PatternDiscoveryManager({ logger });
  return manager.updateDsplWithPatterns(dsplDir, domain, newPatterns, 'countryHub');
}

/**
 * Automatically discover hierarchical place-place URL patterns from verified mappings
 * @param {Database} db - Database connection
 * @param {string} domain - Domain to analyze
 * @param {Console} logger - Logger instance
 * @returns {Array} Discovered hierarchical patterns with confidence scores
 */
function discoverPlacePlacePatternsFromMappings(db, domain, logger = console) {
  const manager = new PatternDiscoveryManager({ logger });
  return manager.discoverPatternsFromMappings(db, domain, 'place-place-hub');
}

/**
 * Update DSPL with newly verified hierarchical patterns
 * @param {string} dsplDir - DSPL directory
 * @param {string} domain - Domain to update
 * @param {Array} newPatterns - New hierarchical patterns to add
 * @param {Console} logger - Logger instance
 */
function updateDsplWithPlacePlacePatterns(dsplDir, domain, newPatterns, logger = console) {
  const manager = new PatternDiscoveryManager({ logger });
  return manager.updateDsplWithPatterns(dsplDir, domain, newPatterns, 'placePlaceHub');
}

module.exports = {
  loadDsplLibrary,
  getDsplForDomain,
  discoverPatternsFromMappings,
  updateDsplWithPatterns,
  discoverPlacePlacePatternsFromMappings,
  updateDsplWithPlacePlacePatterns
};
