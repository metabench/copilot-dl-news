'use strict';

const path = require('path');
const { getTopCities } = require('../db/sqlite/v1/queries/gazetteer.places');
const { slugify } = require('../tools/slugify');
const { HubGapAnalyzerBase } = require('./HubGapAnalyzerBase');

/**
 * CityHubGapAnalyzer extends HubGapAnalyzerBase to provide city-specific hub URL predictions.
 */
class CityHubGapAnalyzer extends HubGapAnalyzerBase {
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
   * City label for DSPL lookups and logging
   */
  getEntityLabel() {
    return 'city';
  }

  /**
   * Fallback patterns for city hubs
   */
  getFallbackPatterns() {
    return [
      '/{citySlug}',
      '/city/{citySlug}',
      '/cities/{citySlug}',
      '/{countryCode}/{citySlug}',
      '/{countryCode}/{regionSlug}/{citySlug}',
      '/world/{citySlug}',
      '/world/{countryCode}/{citySlug}',
      '/travel/{citySlug}',
      '/{regionSlug}/{citySlug}'
    ];
  }

  /**
   * Build metadata for city entity
   */
  buildEntityMetadata(city) {
    if (!city?.name) return null;

    const citySlug = slugify(city.name);
    if (!citySlug) return null;

    const countryCode = city.countryCode ? String(city.countryCode).toLowerCase() : null;
    const regionSlug = city.regionName ? slugify(city.regionName) : null;

    return {
      citySlug,
      countryCode,
      regionSlug,
      name: city.name
    };
  }

  /**
   * Retrieve top cities prioritised by population/priority score.
   *
   * @param {number} [limit=50] - Maximum number of cities to return.
   * @returns {Array<{id: number, name: string, countryCode: string|null, regionName: string|null, regionId: number|null, importance: number}>}
   */
  getTopCities(limit = 50) {
    return getTopCities(this.db, limit);
  }

  /**
   * Generate candidate URLs for a city hub.
   * Delegates to base class predictHubUrls() method.
   *
   * @param {string} domain - Target domain (hostname).
   * @param {object} city - City metadata.
   * @param {string} city.name - City name.
   * @param {string|null} [city.countryCode] - Country ISO code.
   * @param {string|null} [city.regionName] - Parent region name.
   * @returns {string[]} Array of candidate URLs (absolute).
   */
  predictCityHubUrls(domain, city) {
    return this.predictHubUrls(domain, city);
  }
}

module.exports = {
  CityHubGapAnalyzer
};
