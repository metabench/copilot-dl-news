'use strict';

const path = require('path');
const { getDb } = require('../db');
const { getTopCities, getTopSettlementsByKind, getPlacesByCountryAndKind } = require('news-crawler-db');
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
    let _db = db;
    if (!_db) _db = getDb();
    if (_db && typeof _db.getHandle === 'function') _db = _db.getHandle();

    super({ db: _db, logger, dsplDir });
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
   * @param {string} [lang='en'] - Language code.
   * @returns {Array<{id: number, name: string, countryCode: string|null, regionName: string|null, regionId: number|null, importance: number}>}
   */
  getTopCities(limit = 50, lang = 'en') {
    return getTopCities(this.db, limit, lang);
  }

  /**
   * Retrieve top settlements of a given kind (city | town | village),
   * prioritised by population/priority score (A6 slice 3).
   *
   * @param {string} kind - Settlement kind: 'city', 'town' or 'village'.
   * @param {number} [limit=50] - Maximum number of settlements to return.
   * @param {string} [lang='en'] - Language code.
   * @returns {Array<{id: number, name: string, countryCode: string|null, regionName: string|null, regionId: number|null, importance: number}>}
   */
  getTopSettlements(kind, limit = 50, lang = 'en') {
    return getTopSettlementsByKind(this.db, kind, limit, lang);
  }

  /**
   * Get cities for a specific country
   * @param {string} countryCode - ISO country code
   * @param {number} [limit=50] - Max cities
   * @param {string} [lang='en'] - Language code.
   * @returns {Array} List of cities
   */
  getCitiesByCountry(countryCode, limit = 50, lang = 'en') {
    const places = getPlacesByCountryAndKind(this.db, countryCode, 'city', lang);
    return places.slice(0, limit).map(p => ({
      ...p,
      countryCode: p.country_code
    }));
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

  /**
   * Generate candidate URLs for a town/village hub (A6 arc).
   *
   * Reads `${kind}HubPatterns` from the domain's DSPL only — deliberately
   * NO fallback-pattern spray: settlement counts are large and unverified
   * fallback guessing would be noisy. Metadata exposes slug under several
   * placeholder names ({slug}, {townSlug}/{villageSlug}, {citySlug}) so
   * both new and historical pattern styles format.
   *
   * @param {string} domain - Host (e.g. theguardian.com).
   * @param {Object} place - Settlement row (name, countryCode, regionName).
   * @param {string} kind - 'town' | 'village'.
   * @returns {string[]} Candidate URLs (absolute).
   */
  predictSettlementHubUrls(domain, place, kind) {
    if (!domain || !place?.name) return [];
    const slug = slugify(place.name);
    if (!slug) return [];

    const { getDsplForDomain } = require('./shared/dspl');
    const metadata = {
      slug,
      [`${kind}Slug`]: slug,
      citySlug: slug,
      countryCode: place.countryCode ? String(place.countryCode).toLowerCase() : null,
      regionSlug: place.regionName ? slugify(place.regionName) : null,
      name: place.name
    };

    const baseUrl = `https://${domain}`;
    const urls = new Set();
    const dspl = getDsplForDomain(this.dspls, domain);
    const patterns = dspl?.[`${kind}HubPatterns`] || [];
    for (const entry of patterns) {
      if (!entry || entry.verified === false) continue;
      try {
        const formatted = this._formatPattern(entry.pattern || entry, metadata);
        urls.add(new URL(formatted, baseUrl).href);
      } catch (_) {
        // Ignore invalid URLs
      }
    }
    return Array.from(urls);
  }
}

module.exports = {
  CityHubGapAnalyzer
};

