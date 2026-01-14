/**
 * HubGapAnalyzerBase - Abstract base class for hub gap analysis
 *
 * Provides shared pattern generation, URL normalization, and DSPL loading logic
 * for all entity types (country, city, region).
 *
 * Uses Template Method Pattern: subclasses override getFallbackPatterns() and
 * buildEntityMetadata() to customize behavior for their entity type.
 *
 * Pattern generation pipeline:
 * 1. Load entity-specific metadata from gazetteer (name, code, country, region, etc.)
 * 2. Generate predictions from DSPL patterns (highest priority)
 * 3. Fallback to entity-type-specific hardcoded patterns
 * 4. Deduplicate by URL and score by confidence
 * 5. Return sorted list of predictions
 */

const path = require('path');
const { loadDsplLibrary, getDsplForDomain } = require('./shared/dspl');
const { slugify } = require('../tools/slugify');

class HubGapAnalyzerBase {
  /**
   * Base constructor for all hub gap analyzers
   * @param {Object} options
   * @param {import('better-sqlite3').Database} options.db - Database connection
   * @param {Console} [options.logger=console] - Logger instance
   * @param {string} [options.dsplDir] - Directory containing DSPL JSON files
   * @throws {Error} If db is not provided
   */
  constructor({
    db,
    logger = console,
    dsplDir = path.join(__dirname, '..', '..', 'data', 'dspls')
  } = {}) {
    if (!db) {
      throw new Error(`${this.constructor.name} requires a database connection`);
    }

    this.db = db;
    this.logger = logger;
    this.dsplDir = dsplDir;

    // Load DSPLs on initialization
    this.dspls = loadDsplLibrary({ dsplDir: this.dsplDir, logger: this.logger });
  }

  /**
   * Generate candidate hub URLs for an entity
   * Abstract implementation called by entity-specific predictXxxHubUrls() methods
   *
   * @param {string} domain - Target domain (hostname)
   * @param {Object} entity - Entity metadata object (country/city/region)
   * @returns {Array<string>} Array of candidate URLs (absolute)
   *
   * Subclasses should override buildEntityMetadata() to extract needed fields
   */
  predictHubUrls(domain, entity) {
    if (!domain || !entity) {
      return [];
    }

    const baseUrl = `https://${domain}`;
    const metadata = this.buildEntityMetadata(entity);

    if (!metadata) {
      return [];
    }

    const urls = new Set();
    const addPattern = (pattern) => {
      if (!pattern) return;
      try {
        const formatted = this._formatPattern(pattern, metadata);
        const normalized = new URL(formatted, baseUrl).href;
        urls.add(normalized);
      } catch (_) {
        // Ignore invalid URLs
      }
    };

    // Strategy 1: DSPL patterns (highest priority)
    const dspl = getDsplForDomain(this.dspls, domain);
    const dsplPatterns = this._getDsplPatternsForEntity(dspl);
    for (const entry of dsplPatterns) {
      if (!entry) continue;
      if (entry.verified === false) continue;
      addPattern(entry.pattern || entry);
    }

    // Strategy 2: Fallback patterns specific to entity type
    const fallbackPatterns = this.getFallbackPatterns();
    for (const pattern of fallbackPatterns) {
      addPattern(pattern);
    }

    return Array.from(urls);
  }

  /**
   * Format a pattern by replacing placeholders with entity metadata values
   * @private
   * @param {string} pattern - Pattern with placeholders like {slug}, {code}
   * @param {Object} metadata - Entity metadata from buildEntityMetadata()
   * @returns {string} Formatted pattern with placeholders replaced
   */
  _formatPattern(pattern, metadata) {
    if (!pattern || !metadata) return pattern;

    // Replace all possible placeholders (subclasses may use different ones)
    let formatted = pattern;
    for (const [key, value] of Object.entries(metadata)) {
      const placeholder = `{${key}}`;
      if (formatted.includes(placeholder)) {
        formatted = formatted.replace(new RegExp(placeholder, 'g'), value || '');
      }
    }
    return formatted;
  }

  /**
   * Get DSPL patterns for this entity type
   * @private
   * @param {Object} dspl - DSPL object for domain
   * @returns {Array} Array of patterns specific to entity type (country/city/region)
   *
   * Override if DSPL property name differs from default
   */
  _getDsplPatternsForEntity(dspl) {
    const entityLabel = this.getEntityLabel();
    const propertyName = `${entityLabel}HubPatterns`;
    return dspl?.[propertyName] || [];
  }

  /**
   * Remove duplicate URLs and keep highest confidence version
   * @protected
   * @param {Array<Object>} predictions - Predictions with { url, confidence, ... }
   * @returns {Array<Object>} Deduplicated array sorted by confidence descending
   */
  deduplicateAndScore(predictions) {
    const seen = new Map();

    for (const pred of predictions) {
      if (!seen.has(pred.url)) {
        seen.set(pred.url, pred);
      } else {
        // Keep the higher confidence version
        const existing = seen.get(pred.url);
        if (pred.confidence > existing.confidence) {
          seen.set(pred.url, pred);
        }
      }
    }

    // Convert back to array and sort by confidence descending
    const unique = Array.from(seen.values());
    return unique.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Normalize domain to hostname
   * @protected
   * @param {string} domain - Domain string (with or without protocol)
   * @returns {string} Normalized hostname
   */
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

  // ============ Abstract Methods (must be overridden by subclasses) ============

  /**
   * Get human-readable label for this entity type
   * @abstract
   * @returns {string} e.g., 'country', 'city', 'region'
   *
   * Used for logging and DSPL property lookups
   */
  getEntityLabel() {
    throw new Error('Subclass must implement getEntityLabel()');
  }

  /**
   * Get fallback patterns specific to this entity type
   * @abstract
   * @returns {Array<string>} Array of URL path patterns with placeholders
   *
   * Example: ['/{slug}', '/world/{slug}', '/cities/{slug}']
   */
  getFallbackPatterns() {
    throw new Error('Subclass must implement getFallbackPatterns()');
  }

  /**
   * Extract and build metadata for pattern substitution
   * @abstract
   * @param {Object} entity - Entity object from database (country/city/region)
   * @returns {Object|null} Object with placeholder keys (slug, code, citySlug, etc.)
   *
   * Example: { slug: 'france', code: 'fr', name: 'France' }
   *
   * Keys in returned object will be used to replace {key} placeholders in patterns.
   * Return null if entity is invalid.
   */
  buildEntityMetadata(entity) {
    throw new Error('Subclass must implement buildEntityMetadata()');
  }
}

module.exports = { HubGapAnalyzerBase };

