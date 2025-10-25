'use strict';

const fs = require('fs');
const path = require('path');

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
  try {
    const mappings = db.prepare(`
      SELECT url, place_id FROM place_page_mappings
      WHERE host = ? AND page_kind = 'country-hub' AND status = 'verified'
    `).all(domain);

    if (mappings.length < 2) {
      return [];
    }

    const patterns = new Map();

    // Extract patterns from URL pairs
    for (let i = 0; i < mappings.length; i++) {
      for (let j = i + 1; j < mappings.length; j++) {
        const pattern = extractPatternFromUrls(mappings[i].url, mappings[j].url);
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

    logger?.log?.(`[dspl] Discovered ${discoveredPatterns.length} patterns for ${domain}`);
    return discoveredPatterns;

  } catch (error) {
    logger?.error?.(`[dspl] Pattern discovery failed for ${domain}: ${error.message}`);
    return [];
  }
}

/**
 * Extract common pattern from two URLs
 * @param {string} url1 - First URL
 * @param {string} url2 - Second URL
 * @returns {string|null} Common pattern or null
 */
function extractPatternFromUrls(url1, url2) {
  try {
    const path1 = new URL(url1).pathname;
    const path2 = new URL(url2).pathname;

    const segments1 = path1.split('/').filter(s => s);
    const segments2 = path2.split('/').filter(s => s);

    if (segments1.length !== segments2.length) {
      return null;
    }

    const pattern = [];
    for (let i = 0; i < segments1.length; i++) {
      if (segments1[i] === segments2[i]) {
        pattern.push(segments1[i]);
      } else {
        // Check if both look like country identifiers
        if (isCountryIdentifier(segments1[i]) && isCountryIdentifier(segments2[i])) {
          pattern.push('{slug}');
        } else {
          return null; // Not a consistent pattern
        }
      }
    }

    return '/' + pattern.join('/');
  } catch (error) {
    return null;
  }
}

/**
 * Check if a string looks like a country identifier (slug or code)
 * @param {string} str - String to check
 * @returns {boolean} True if looks like country identifier
 */
function isCountryIdentifier(str) {
  // Country codes are 2-3 letters
  if (/^[a-z]{2,3}$/i.test(str)) {
    return true;
  }

  // Country slugs are lowercase with hyphens
  if (/^[a-z]+(-[a-z]+)*$/.test(str)) {
    return true;
  }

  return false;
}

/**
 * Update DSPL with newly verified patterns
 * @param {string} dsplDir - DSPL directory
 * @param {string} domain - Domain to update
 * @param {Array} newPatterns - New patterns to add
 * @param {Console} logger - Logger instance
 */
function updateDsplWithPatterns(dsplDir, domain, newPatterns, logger = console) {
  try {
    const filePath = path.join(dsplDir, `${domain}.json`);

    let existingData = {};
    if (fs.existsSync(filePath)) {
      existingData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }

    if (!existingData[domain]) {
      existingData[domain] = {
        domain,
        generated: new Date().toISOString(),
        countryHubPatterns: []
      };
    }

    const existingPatterns = new Map(
      existingData[domain].countryHubPatterns.map(p => [p.pattern, p])
    );

    // Add new patterns
    for (const newPattern of newPatterns) {
      if (!existingPatterns.has(newPattern.pattern)) {
        existingData[domain].countryHubPatterns.push({
          ...newPattern,
          verified: true, // Mark as verified since they come from verified mappings
          added: new Date().toISOString()
        });
      }
    }

    // Update stats
    const verified = existingData[domain].countryHubPatterns.filter(p => p.verified).length;
    const total = existingData[domain].countryHubPatterns.length;
    existingData[domain].stats = {
      totalPatterns: total,
      verifiedPatterns: verified,
      totalExamples: existingData[domain].countryHubPatterns.reduce((sum, p) => sum + (p.examples || 0), 0),
      lastUpdated: new Date().toISOString()
    };

    // Write back
    fs.writeFileSync(filePath, JSON.stringify(existingData, null, 2));
    logger?.log?.(`[dspl] Updated DSPL for ${domain} with ${newPatterns.length} new patterns`);

  } catch (error) {
    logger?.error?.(`[dspl] Failed to update DSPL for ${domain}: ${error.message}`);
  }
}

/**
 * Cross-domain pattern learning - find patterns that work across domains
 * @param {Database} db - Database connection
 * @param {Array<string>} domains - Domains to analyze
 * @param {Console} logger - Logger instance
 * @returns {Map<string, Array>} Cross-domain patterns
 */
function findCrossDomainPatterns(db, domains, logger = console) {
  const crossDomainPatterns = new Map();

  try {
    for (const domain of domains) {
      const patterns = discoverPatternsFromMappings(db, domain, logger);
      for (const pattern of patterns) {
        if (!crossDomainPatterns.has(pattern.pattern)) {
          crossDomainPatterns.set(pattern.pattern, []);
        }
        crossDomainPatterns.get(pattern.pattern).push({
          domain,
          confidence: pattern.confidence,
          examples: pattern.examples
        });
      }
    }

    // Find patterns that appear in multiple domains
    const multiDomainPatterns = [];
    for (const [pattern, domainData] of crossDomainPatterns) {
      if (domainData.length > 1) {
        const avgConfidence = domainData.reduce((sum, d) => sum + d.confidence, 0) / domainData.length;
        multiDomainPatterns.push({
          pattern,
          confidence: avgConfidence,
          domains: domainData.map(d => d.domain),
          totalExamples: domainData.reduce((sum, d) => sum + d.examples, 0)
        });
      }
    }

    logger?.log?.(`[dspl] Found ${multiDomainPatterns.length} cross-domain patterns`);
    return multiDomainPatterns;

  } catch (error) {
    logger?.error?.(`[dspl] Cross-domain pattern discovery failed: ${error.message}`);
    return [];
  }
}

module.exports = {
  loadDsplLibrary,
  getDsplForDomain,
  discoverPatternsFromMappings,
  updateDsplWithPatterns,
  findCrossDomainPatterns
};
