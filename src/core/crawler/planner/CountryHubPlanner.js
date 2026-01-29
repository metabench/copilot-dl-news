'use strict';

const { getDb } = require('../../../data/db');

const DEFAULT_COUNTRY_NAMES = [
  'France', 'Germany', 'Spain', 'Italy', 'China', 'India', 'United States', 'Russia', 'Brazil', 'Canada',
  'Australia', 'Japan', 'South Africa', 'Mexico', 'Nigeria', 'Argentina', 'Poland', 'Netherlands', 'Sweden',
  'Norway', 'Denmark', 'Ireland', 'Portugal', 'Greece', 'Turkey', 'Ukraine', 'Egypt', 'Saudi Arabia', 'Iran',
  'Iraq', 'Israel'
];

const COUNTRY_PATTERNS = [
  { template: '/world/{slug}', reason: 'country-hub-world-path' },
  { template: '/news/world/{slug}', reason: 'country-hub-news-world-path' },
  { template: '/international/{slug}', reason: 'country-hub-international-path' },
  { template: '/{slug}', reason: 'country-hub-root-path' }
];

const COUNTRY_SLUG_PREFIXES = [
  'republic-of-',
  'state-of-',
  'kingdom-of-',
  'commonwealth-of-',
  'commonwealth-of-the-',
  'federal-democratic-republic-of-',
  'federal-republic-of-',
  'islamic-republic-of-',
  'democratic-republic-of-',
  'people-s-republic-of-',
  'socialist-republic-of-',
  'bolivarian-republic-of-',
  'plurinational-state-of-',
  'les-',
  'le-',
  'la-',
  'l-',
  'los-',
  'las-',
  'el-',
  'the-'
];

class CountryHubPlanner {
  constructor({ baseUrl, db, knowledgeService = null, maxCountryCount = 100 } = {}) {
    this.baseUrl = baseUrl || null;
    this.db = db;
    if (!this.db) this.db = getDb();
    if (this.db && typeof this.db.getHandle === 'function') this.db = this.db.getHandle();

    this.knowledgeService = knowledgeService;
    this.maxCountryCount = Math.max(1, maxCountryCount);
  }

  async computeCandidates(host) {
    const candidates = [];
    const normalizedHost = this._normalizeHost(host);
    if (!normalizedHost) return candidates;

    const baseUrl = this.baseUrl || `https://${normalizedHost}`;
    const { slugs, origin } = await this._collectCandidateSlugs(this.maxCountryCount);
    if (!slugs.length) return candidates;

    const seenUrls = new Set();
    for (const rawSlug of slugs) {
      const slug = this._normalizeSlug(rawSlug);
      if (!slug) continue;

      const candidate = await this._selectUrlForSlug({ slug, baseUrl, seenUrls });
      if (!candidate) continue;

      candidates.push({
        url: candidate.url,
        slug,
        name: this._formatCountryName(slug),
        reason: origin === 'gazetteer' ? 'country-hub-gazetteer' : 'country-hub-default',
        source: 'country-planner',
        pattern: candidate.pattern
      });
    }

    if (this.knowledgeService && typeof this.knowledgeService.getCountryHubCandidates === 'function') {
      try {
        const extra = await this.knowledgeService.getCountryHubCandidates(normalizedHost);
        if (Array.isArray(extra)) {
          for (const item of extra) {
            if (!item || !item.url) continue;
            candidates.push({
              url: item.url,
              slug: item.slug || null,
              reason: item.reason || 'knowledge-service',
              source: item.source || 'knowledge-service'
            });
          }
        }
      } catch (_) {
        // ignore knowledge service errors for now
      }
    }

    return candidates;
  }

  async _collectCandidateSlugs(limit = 100) {
    const gazetteerSlugs = await this._getTopCountrySlugsFromGazetteer(limit);
    const normalized = this._normalizeSlugList(gazetteerSlugs);
    if (normalized.length) {
      return { slugs: normalized, origin: 'gazetteer' };
    }

    return { slugs: this._getFallbackCountrySlugs(), origin: 'fallback' };
  }

  async _selectUrlForSlug({ slug, baseUrl, seenUrls }) {
    for (const { template, reason } of this._countryPatterns()) {
      const url = this._buildUrl(baseUrl, template.replace('{slug}', encodeURIComponent(slug)));
      if (!url || seenUrls.has(url)) continue;

      const dbCheck = await this._checkUrlInDatabase(url);
      if (dbCheck.exists && !dbCheck.isSuccess) {
        continue;
      }

      seenUrls.add(url);
      return { url, pattern: reason };
    }

    return null;
  }

  _normalizeHost(host) {
    if (!host) return null;
    return String(host).toLowerCase().trim().replace(/\s+/g, '');
  }

  _normalizeSlugList(list) {
    if (!Array.isArray(list)) return [];
    const normalized = [];
    const seen = new Set();
    for (const value of list) {
      const slug = this._normalizeSlug(value);
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      normalized.push(slug);
    }
    return normalized;
  }

  _normalizeSlug(value) {
    if (!value && value !== 0) return null;
    const raw = typeof value === 'string' && /^[a-z0-9-]+$/.test(value)
      ? value
      : this._generateCountrySlug(String(value || ''));
    return this._stripCountryPrefixes(raw);
  }

  _getFallbackCountrySlugs() {
    return DEFAULT_COUNTRY_NAMES
      .map((name) => this._generateCountrySlug(name))
      .filter(Boolean);
  }

  _countryPatterns() {
    return COUNTRY_PATTERNS;
  }

  _buildUrl(baseUrl, path) {
    try {
      return new URL(path, baseUrl).href;
    } catch (_) {
      return null;
    }
  }

  async _getTopCountrySlugsFromGazetteer(limit = 50) {
    if (!this.db || typeof this.db.getTopCountrySlugs !== 'function') {
      return null;
    }
    try {
      const slugs = this.db.getTopCountrySlugs(limit);
      return Array.isArray(slugs) && slugs.length ? slugs : null;
    } catch (_) {
      return null;
    }
  }

  _generateCountrySlug(countryName) {
    const base = String(countryName || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return this._stripCountryPrefixes(base);
  }

  _stripCountryPrefixes(slug) {
    if (!slug) return slug;
    let trimmed = slug;
    let mutated = true;
    while (mutated && trimmed) {
      mutated = false;
      for (const prefix of COUNTRY_SLUG_PREFIXES) {
        if (trimmed.startsWith(prefix)) {
          trimmed = trimmed.slice(prefix.length);
          mutated = true;
          break;
        }
      }
    }
    return trimmed || slug;
  }

  _formatCountryName(slug) {
    if (!slug) return null;
    return slug.split('-')
      .filter(Boolean)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ');
  }

  async _checkUrlInDatabase(url) {
    const db = this._getDbInstance();
    if (!db) {
      return { exists: false, status: null, isSuccess: false };
    }

    try {
      const responsesStmt = db.prepare(`
        SELECT hr.http_status AS status
        FROM urls u
        JOIN http_responses hr ON hr.url_id = u.id
        WHERE u.url = ?
        ORDER BY hr.fetched_at DESC
        LIMIT 1
      `);
      const responseRow = responsesStmt.get(url);
      if (responseRow && typeof responseRow.status === 'number') {
        const status = responseRow.status;
        return {
          exists: true,
          status,
          isSuccess: status >= 200 && status < 300
        };
      }
    } catch (error) {
      this.logger?.warn?.(`[CountryHubPlanner] Failed to check URL status for ${url}:`, error.message);
    }

    return { exists: false, status: null, isSuccess: false };
  }

  _getDbInstance() {
    if (!this.db) return null;

    if (typeof this.db.getDb === 'function') {
      try {
        const instance = this.db.getDb();
        if (instance && typeof instance.prepare === 'function') {
          return instance;
        }
      } catch (_) {
        // fall through to other checks
      }
    }

    if (this.db.db && typeof this.db.db.prepare === 'function') {
      return this.db.db;
    }

    return null;
  }
}

module.exports = {
  CountryHubPlanner
};
