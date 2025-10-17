'use strict';

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

class CountryHubPlanner {
  constructor({ baseUrl, db, knowledgeService = null, maxCountryCount = 100 } = {}) {
    this.baseUrl = baseUrl || null;
    this.db = db || null;
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
    if (typeof value === 'string' && /^[a-z0-9-]+$/.test(value)) {
      return value;
    }
    return this._generateCountrySlug(String(value || ''));
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
    return String(countryName || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  async _checkUrlInDatabase(url) {
    if (!this.db || !this.db.db) return { exists: false, status: null };

    try {
      const row = this.db.db.prepare('SELECT http_status FROM articles WHERE url = ?').get(url);
      if (row && row.http_status) {
        return {
          exists: true,
          status: row.http_status,
          isSuccess: row.http_status >= 200 && row.http_status < 300
        };
      }
    } catch (_) {
      // Ignore errors
    }

    return { exists: false, status: null };
  }
}

module.exports = {
  CountryHubPlanner
};
