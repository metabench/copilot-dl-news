'use strict';

class CountryHubPlanner {
  constructor({ baseUrl, db, knowledgeService = null } = {}) {
    this.baseUrl = baseUrl;
    this.db = db || null;
    this.knowledgeService = knowledgeService;
  }

  async computeCandidates(host) {
    const candidates = [];
    if (!host) return candidates;
    const normalizedHost = host.toLowerCase();

    // Guardian-specific heuristic
    if (/guardian\.com$/.test(normalizedHost)) {
      const slugs = await this._getGuardianSlugs();
      for (const slug of slugs) {
        const url = `${this.baseUrl}/world/${encodeURIComponent(slug)}`;
        candidates.push({
          url,
          slug,
          reason: 'guardian-world-country',
          source: 'guardian-heuristic'
        });
      }
    }

    // Future hooks: incorporate knowledgeService or other models here
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

  async _getGuardianSlugs() {
    const fallback = [
      'france', 'germany', 'spain', 'italy', 'china', 'india', 'united-states', 'russia', 'brazil', 'canada',
      'australia', 'japan', 'south-africa', 'mexico', 'nigeria', 'argentina', 'poland', 'netherlands', 'sweden',
      'norway', 'denmark', 'ireland', 'portugal', 'greece', 'turkey', 'ukraine', 'egypt', 'saudiarabia', 'iran',
      'iraq', 'israel'
    ];

    const slugs = await this._getTopCountrySlugsFromGazetteer(100);
    if (Array.isArray(slugs) && slugs.length) {
      return slugs;
    }
    return fallback;
  }

  async _getTopCountrySlugsFromGazetteer(limit = 50) {
    if (!this.db || !this.db.db || typeof this.db.db.prepare !== 'function') {
      return null;
    }
    try {
      const rows = this.db.db
        .prepare(`SELECT name FROM place_names WHERE id IN (SELECT canonical_name_id FROM places WHERE kind='country') ORDER BY name LIMIT ?`)
        .all(limit);
      const toSlug = (name) => String(name || '').trim().toLowerCase()
        .replace(/\band\b/g, 'and')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      const uniq = new Set();
      const slugs = [];
      for (const row of rows) {
        const slug = toSlug(row.name);
        if (slug && !uniq.has(slug)) {
          uniq.add(slug);
          slugs.push(slug);
        }
      }
      return slugs;
    } catch (_) {
      return null;
    }
  }
}

module.exports = {
  CountryHubPlanner
};
