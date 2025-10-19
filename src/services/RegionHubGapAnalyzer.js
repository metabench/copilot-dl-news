'use strict';

const path = require('path');
const { getTopRegions } = require('../db/sqlite/v1/queries/gazetteer.places');
const { slugify } = require('../tools/slugify');
const { loadDsplLibrary, getDsplForDomain } = require('./shared/dspl');

/**
 * RegionHubGapAnalyzer provides heuristics and predictions for region-level hubs.
 */
class RegionHubGapAnalyzer {
  /**
   * @param {object} options
   * @param {import('better-sqlite3').Database} options.db - Database handle.
   * @param {Console} [options.logger=console] - Logger instance.
   * @param {string} [options.dsplDir] - Directory containing DSPL JSON files.
   */
  constructor({ db, logger = console, dsplDir = path.join(__dirname, '..', '..', 'data', 'dspls') } = {}) {
    if (!db) {
      throw new Error('RegionHubGapAnalyzer requires a database connection');
    }
    this.db = db;
    this.logger = logger;
    this.dspls = loadDsplLibrary({ dsplDir, logger });
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
   *
   * @param {string} domain - Target domain (hostname).
   * @param {object} region - Region metadata.
   * @param {string} region.name - Human readable region name.
   * @param {string|null} [region.code] - Optional ADM1 code (e.g. "US-CA").
   * @param {string|null} [region.countryCode] - Parent country ISO code.
   * @returns {string[]} Array of candidate URLs (absolute).
   */
  predictRegionHubUrls(domain, region) {
    if (!region?.name) return [];
    const baseUrl = `https://${domain}`;
    const slug = slugify(region.name);
    if (!slug) return [];

    const countryCode = region.countryCode ? String(region.countryCode).toLowerCase() : null;
    const countrySlug = countryCode || null;
    const regionCode = region.code || null;
    const regionCodePart = regionCode ? regionCode.split('-').pop()?.toLowerCase() : null;

    const urls = new Set();
    const addPattern = (pattern) => {
      if (!pattern) return;
      try {
        const formatted = pattern
          .replace('{regionSlug}', slug)
          .replace('{regionCode}', regionCodePart || slug)
          .replace('{regionCodeFull}', (regionCode || '').toLowerCase())
          .replace('{countryCode}', countrySlug || '')
          .replace('{countrySlug}', countrySlug || '');
        const normalized = new URL(formatted, baseUrl).href;
        urls.add(normalized);
      } catch (_) {
        // Ignore invalid URLs
      }
    };

    const dspl = getDsplForDomain(this.dspls, domain);
    const dsplPatterns = dspl?.regionHubPatterns || [];
    for (const entry of dsplPatterns) {
      if (!entry) continue;
      if (entry.verified === false) continue;
      addPattern(entry.pattern || entry);
    }

    // Fallback heuristics when DSPL is missing or incomplete.
    const fallbackPatterns = [
      '/{regionSlug}',
      '/{countryCode}/{regionSlug}',
      '/news/{regionSlug}',
      '/world/{regionSlug}',
      '/world/{countryCode}/{regionSlug}',
      '/{regionSlug}/news',
      '/{countryCode}-{regionSlug}',
      '/{countryCode}/{regionCode}'
    ];
    for (const pattern of fallbackPatterns) {
      addPattern(pattern);
    }

    return Array.from(urls);
  }
}

module.exports = {
  RegionHubGapAnalyzer
};
