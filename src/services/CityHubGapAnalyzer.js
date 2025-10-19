'use strict';

const path = require('path');
const { getTopCities } = require('../db/sqlite/v1/queries/gazetteer.places');
const { slugify } = require('../tools/slugify');
const { loadDsplLibrary, getDsplForDomain } = require('./shared/dspl');

/**
 * CityHubGapAnalyzer provides heuristics and predictions for city-level hubs.
 */
class CityHubGapAnalyzer {
  /**
   * @param {object} options
   * @param {import('better-sqlite3').Database} options.db - Database handle.
   * @param {Console} [options.logger=console] - Logger instance.
   * @param {string} [options.dsplDir] - Directory containing DSPL JSON files.
   */
  constructor({ db, logger = console, dsplDir = path.join(__dirname, '..', '..', 'data', 'dspls') } = {}) {
    if (!db) {
      throw new Error('CityHubGapAnalyzer requires a database connection');
    }
    this.db = db;
    this.logger = logger;
    this.dspls = loadDsplLibrary({ dsplDir, logger });
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
   *
   * @param {string} domain - Target domain (hostname).
   * @param {object} city - City metadata.
   * @param {string} city.name - City name.
   * @param {string|null} [city.countryCode] - Country ISO code.
   * @param {string|null} [city.regionName] - Parent region name.
   * @returns {string[]} Array of candidate URLs (absolute).
   */
  predictCityHubUrls(domain, city) {
    if (!city?.name) return [];
    const citySlug = slugify(city.name);
    if (!citySlug) return [];

    const baseUrl = `https://${domain}`;
    const countryCode = city.countryCode ? String(city.countryCode).toLowerCase() : null;
    const countrySlug = countryCode || null;
    const regionSlug = city.regionName ? slugify(city.regionName) : null;

    const urls = new Set();
    const addPattern = (pattern) => {
      if (!pattern) return;
      try {
        const formatted = pattern
          .replace('{citySlug}', citySlug)
          .replace('{countryCode}', countrySlug || '')
          .replace('{countrySlug}', countrySlug || '')
          .replace('{regionSlug}', regionSlug || citySlug);
        const normalized = new URL(formatted, baseUrl).href;
        urls.add(normalized);
      } catch (_) {
        // Ignore invalid URLs
      }
    };

    const dspl = getDsplForDomain(this.dspls, domain);
    const dsplPatterns = dspl?.cityHubPatterns || [];
    for (const entry of dsplPatterns) {
      if (!entry) continue;
      if (entry.verified === false) continue;
      addPattern(entry.pattern || entry);
    }

    const fallbackPatterns = [
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
    for (const pattern of fallbackPatterns) {
      addPattern(pattern);
    }

    return Array.from(urls);
  }
}

module.exports = {
  CityHubGapAnalyzer
};
