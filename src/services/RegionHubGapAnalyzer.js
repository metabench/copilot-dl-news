'use strict';

const path = require('path');
const { getTopRegions } = require('../db/sqlite/v1/queries/gazetteer.places');
const { slugify } = require('../tools/slugify');
const { HubGapAnalyzerBase } = require('./HubGapAnalyzerBase');

/**
 * RegionHubGapAnalyzer extends HubGapAnalyzerBase to provide region-specific hub URL predictions.
 */
class RegionHubGapAnalyzer extends HubGapAnalyzerBase {
  /**
   * @param {object} options
   * @param {import('better-sqlite3').Database} options.db - Database handle.
   * @param {Console} [options.logger=console] - Logger instance.
   * @param {string} [options.dsplDir] - Directory containing DSPL JSON files.
   */
  constructor({ db, logger = console, dsplDir = path.join(__dirname, '..', '..', 'data', 'dspls') } = {}) {
    super({ db, logger, dsplDir });
  }

  /**
   * Region label for DSPL lookups and logging
   */
  getEntityLabel() {
    return 'region';
  }

  /**
   * Fallback patterns for region hubs
   */
  getFallbackPatterns() {
    return [
      '/{regionSlug}',
      '/{countryCode}/{regionSlug}',
      '/news/{regionSlug}',
      '/world/{regionSlug}',
      '/world/{countryCode}/{regionSlug}',
      '/{regionSlug}/news',
      '/{countryCode}-{regionSlug}',
      '/{countryCode}/{regionCode}'
    ];
  }

  /**
   * Build metadata for region entity
   */
  buildEntityMetadata(region) {
    if (!region?.name) return null;

    const regionSlug = slugify(region.name);
    if (!regionSlug) return null;

    const countryCode = region.countryCode ? String(region.countryCode).toLowerCase() : null;
    const regionCode = region.code || null;
    const regionCodePart = regionCode ? regionCode.split('-').pop()?.toLowerCase() : null;

    return {
      regionSlug,
      regionCode: regionCodePart,
      regionCodeFull: (regionCode || '').toLowerCase(),
      countryCode,
      name: region.name
    };
  }

  /**
   * Retrieve top regions prioritised by population/priority score.
   *
   * @param {number} [limit=50] - Maximum number of regions to return.
   * @returns {Array<{id: number, name: string, code: string|null, countryCode: string|null, importance: number}>}
   */
  getTopRegions(limit = 50) {
    return getTopRegions(this.db, limit);
  }

  /**
   * Generate candidate URLs for a region hub.
   * Delegates to base class predictHubUrls() method.
   *
   * @param {string} domain - Target domain (hostname).
   * @param {object} region - Region metadata.
   * @param {string} region.name - Human readable region name.
   * @param {string|null} [region.code] - Optional ADM1 code (e.g. "US-CA").
   * @param {string|null} [region.countryCode] - Parent country ISO code.
   * @returns {string[]} Array of candidate URLs (absolute).
   */
  predictRegionHubUrls(domain, region) {
    return this.predictHubUrls(domain, region);
  }
}

module.exports = {
  RegionHubGapAnalyzer
};
