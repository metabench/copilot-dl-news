'use strict';

const { recordPlaceHubSeed } = require('../data/placeHubs');
const { getContinentNames } = require('../../data/continents');

class HubSeeder {
  constructor({
    enqueueRequest,
    normalizeUrl,
    state,
    telemetry,
    db,
    baseUrl,
    logger = console,
    planCapture = null,
    disableDbRecording = false
  } = {}) {
    this.enqueueRequest = typeof enqueueRequest === 'function' ? enqueueRequest : null;
    this.normalizeUrl = typeof normalizeUrl === 'function' ? normalizeUrl : null;
    this.state = state || null;
    this.telemetry = telemetry || null;
    this.db = db || null;
    this.baseUrl = baseUrl;
    this.logger = logger;
    this.planCapture = planCapture || null;
    this.disableDbRecording = !!disableDbRecording;
  }

  async seedPlan({ host, sectionSlugs = [], countryCandidates = [], navigationLinks = [], maxSeeds = 50 }) {
    if (!this.enqueueRequest) {
      return {
        seededCount: 0,
        requestedCount: 0,
        sectionHubCount: sectionSlugs.length,
        countryCandidateCount: countryCandidates.length,
        navigationCandidateCount: Array.isArray(navigationLinks) ? navigationLinks.length : 0,
        navigationSeededCount: 0,
        navigationSample: [],
        sampleSeeded: []
      };
    }

    const sectionHubs = sectionSlugs.map((slug) => this._buildAbsolutePathUrl([slug])).filter(Boolean);
    const entries = this._buildHubEntries({ sectionSlugs, countryCandidates, navigationLinks });
    const cap = typeof maxSeeds === 'number' && maxSeeds > 0 ? maxSeeds : 50;
    const hubs = entries.slice(0, cap);

    if (this.planCapture && typeof this.planCapture.recordSeedCandidates === 'function') {
      try {
        this.planCapture.recordSeedCandidates(entries);
      } catch (_) {}
    }

    const seeded = [];
    const navigationSeeded = [];
    for (const entry of hubs) {
      const enqueued = this.enqueueRequest({
        url: entry.url,
        depth: 0,
        type: {
          kind: 'hub-seed',
          reason: entry.meta.reason,
          hubKind: entry.meta.kind,
          source: entry.meta.source,
          priorityBias: entry.meta.priorityBias
        }
      });
      if (enqueued) {
        const normalized = this._safeNormalize(entry.url);
        if (normalized && this.state?.addSeededHub) {
          this.state.addSeededHub(normalized, {
            kind: entry.meta.kind,
            source: entry.meta.source,
            reason: entry.meta.reason,
            slug: entry.meta.slug || null,
            seededAt: new Date().toISOString()
          });
        }
        seeded.push(entry.url);
        if (entry.meta.kind === 'navigation') {
          navigationSeeded.push(entry.url);
        }
        if (this.planCapture && typeof this.planCapture.recordSeedOutcome === 'function') {
          try {
            this.planCapture.recordSeedOutcome({ entry, enqueued: true, normalized });
          } catch (_) {}
        }
      } else if (this.planCapture && typeof this.planCapture.recordSeedOutcome === 'function') {
        try {
          this.planCapture.recordSeedOutcome({ entry, enqueued: false, normalized: null });
        } catch (_) {}
      }
      this._recordSeedInDatabase(host, entry.url, entry.meta);
    }

    // Count hubs by type
    const hubCounts = this._categorizeHubsByType(entries.slice(0, cap));
    const placeHubsTotal = hubCounts.continent + hubCounts.country + hubCounts.otherPlace;
    const topicHubsTotal = hubCounts.section + hubCounts.navigation;
    
    // Build summary string
    const parts = [];
    if (placeHubsTotal > 0) {
      const placeBreakdown = [];
      if (hubCounts.continent > 0) placeBreakdown.push(`${hubCounts.continent} continent`);
      if (hubCounts.country > 0) placeBreakdown.push(`${hubCounts.country} country`);
      if (hubCounts.otherPlace > 0) placeBreakdown.push(`${hubCounts.otherPlace} other place`);
      parts.push(`🗺️  ${placeHubsTotal} place (${placeBreakdown.join(', ')})`);
    }
    if (topicHubsTotal > 0) {
      parts.push(`📂 ${topicHubsTotal} topic`);
    }
    
    const summary = parts.length > 0 
      ? `Intelligent plan: seeded ${seeded.length} hub(s) — ${parts.join(' + ')}`
      : `Intelligent plan: seeded ${seeded.length} hub(s)`;
    
    this._log(summary);

    if (seeded.length === 0) {
      this._emitProblem({
        kind: 'no-hubs-seeded',
        message: 'No suitable hubs found from homepage or models'
      }, host);
    } else {
      this._emitMilestone({
        kind: 'hubs-seeded',
        message: `Seeded ${seeded.length} hubs`,
        details: {
          count: seeded.length,
          sections: sectionHubs.length,
          countryCandidates: countryCandidates.length
        }
      }, host);
    }

    return {
      seededCount: seeded.length,
      requestedCount: hubs.length,
      sectionHubCount: sectionHubs.length,
      countryCandidateCount: countryCandidates.length,
      navigationCandidateCount: Array.isArray(navigationLinks) ? navigationLinks.length : 0,
      navigationSeededCount: navigationSeeded.length,
      navigationSample: navigationSeeded.slice(0, 5),
      sampleSeeded: seeded.slice(0, 5)
    };
  }

  seedAdaptiveFromArticle({ url, metadata, depth }) {
    if (!this.enqueueRequest || !this.state || !url) return;
    const candidates = this._buildAdaptiveCandidates(url, metadata);
    if (!candidates.length) return;

    const seen = new Set();
    for (const cand of candidates) {
      if (!cand || !cand.url) continue;
      const normalized = this._safeNormalize(cand.url);
      if (!normalized) continue;
      const key = `${cand.kind}:${normalized}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (cand.kind === 'hub-seed') {
        if (this._alreadySeededHub(normalized)) continue;
        const enqueued = this.enqueueRequest({
          url: cand.url,
          depth: Math.max(0, (depth || 0) - 1),
          type: {
            kind: 'hub-seed',
            reason: cand.reason
          }
        });
        if (enqueued) {
          if (this.state?.addSeededHub) {
            this.state.addSeededHub(normalized, {
              kind: 'adaptive-section',
              source: 'adaptive-seed',
              reason: cand.reason,
              seededAt: new Date().toISOString()
            });
          }
          this._emitMilestoneOnce(`adaptive-hub:${normalized}`, {
            kind: 'adaptive-hub-seeded',
            message: 'Queued adaptive hub for deeper coverage',
            details: { url: normalized, reason: cand.reason }
          });
        }
      } else if (cand.kind === 'history') {
        if (this._alreadyHistorySeed(normalized)) continue;
        const enqueued = this.enqueueRequest({
          url: cand.url,
          depth: Math.max(0, (depth || 0) - 1),
          type: {
            kind: 'history',
            reason: cand.reason
          }
        });
        if (enqueued) {
          if (this.state?.addHistorySeed) this.state.addHistorySeed(normalized);
          this._emitMilestoneOnce(`history-seed:${normalized}`, {
            kind: 'history-path-seeded',
            message: 'Queued archive/history path discovered from article',
            details: { url: normalized, reason: cand.reason }
          });
        }
      }
    }
  }

  _buildAdaptiveCandidates(url, metadata) {
    const candidates = [];
    const sectionSlugFromMeta = this._normalizeSectionSlug(metadata?.section);
    if (sectionSlugFromMeta) {
      const hubUrl = this._buildAbsolutePathUrl([sectionSlugFromMeta]);
      if (hubUrl) {
        candidates.push({
          url: hubUrl,
          kind: 'hub-seed',
          reason: 'section-metadata'
        });
      }
    }

    try {
      const u = new URL(url, this.baseUrl);
      const segments = (u.pathname || '/').split('/').filter(Boolean);
      if (segments.length > 0) {
        const primarySlug = this._normalizeSectionSlug(segments[0]);
        if (primarySlug) {
          const primaryHub = this._buildAbsolutePathUrl([primarySlug]);
          if (primaryHub) {
            candidates.push({
              url: primaryHub,
              kind: 'hub-seed',
              reason: 'section-from-path'
            });
          }
        }
      }
      candidates.push(...this._collectHistoryCandidatesFromSegments(segments));
    } catch (_) {
      // ignore URL parsing errors
    }

    return candidates;
  }

  _collectHistoryCandidatesFromSegments(segments) {
    const out = [];
    if (!Array.isArray(segments) || segments.length < 2) return out;
    const yearIdx = segments.findIndex((seg) => /^(19|20)\d{2}$/.test(seg));
    if (yearIdx <= 0) return out;
    const baseSegments = segments.slice(0, yearIdx);
    if (!baseSegments.length) return out;
    const year = segments[yearIdx];

    const baseHubUrl = this._buildAbsolutePathUrl(baseSegments);
    if (baseHubUrl) {
      out.push({ url: baseHubUrl, kind: 'hub-seed', reason: 'section-from-archive' });
    }

    const yearUrl = this._buildAbsolutePathUrl([...baseSegments, year]);
    if (yearUrl) {
      out.push({ url: yearUrl, kind: 'history', reason: 'year-archive' });
    }

    const monthIdx = yearIdx + 1;
    if (monthIdx < segments.length) {
      const monthSegRaw = segments[monthIdx];
      const monthSeg = String(monthSegRaw || '').toLowerCase();
      if (/^(0?[1-9]|1[0-2]|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)$/.test(monthSeg)) {
        const monthUrl = this._buildAbsolutePathUrl([...baseSegments, year, monthSegRaw]);
        if (monthUrl) {
          out.push({ url: monthUrl, kind: 'history', reason: 'month-archive' });
        }
      }
    }

    return out;
  }

  _normalizeSectionSlug(value) {
    if (!value && value !== 0) return null;
    const slug = String(value).trim().toLowerCase();
    if (!slug) return null;
    const cleaned = slug
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9\/-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return cleaned || null;
  }

  _buildAbsolutePathUrl(segments) {
    if (!Array.isArray(segments) || segments.length === 0) return null;
    const encoded = segments
      .map((seg) => String(seg || '').trim())
      .filter(Boolean)
      .map((seg) => encodeURIComponent(seg));
    if (!encoded.length) return null;
    return `${this.baseUrl}/${encoded.join('/')}/`;
  }

  _safeNormalize(url) {
    if (!this.normalizeUrl) return url;
    try {
      return this.normalizeUrl(url);
    } catch (_) {
      return url;
    }
  }

  _alreadySeededHub(normalized) {
    if (!this.state) return false;
    if (this.state.hasSeededHub && this.state.hasSeededHub(normalized)) return true;
    if (this.state.hasVisited && this.state.hasVisited(normalized)) return true;
    return false;
  }

  _alreadyHistorySeed(normalized) {
    if (!this.state) return false;
    if (this.state.hasHistorySeed && this.state.hasHistorySeed(normalized)) return true;
    if (this.state.hasVisited && this.state.hasVisited(normalized)) return true;
    return false;
  }

  _recordSeedInDatabase(host, hubUrl, meta = null) {
    if (!this.db || this.disableDbRecording) return;
    try {
      recordPlaceHubSeed(this.db, {
        host,
        url: hubUrl,
        evidence: {
          by: 'intelligent-plan',
          reason: meta?.reason || 'learned-section-or-country',
          kind: meta?.kind || null,
          source: meta?.source || null,
          slug: meta?.slug || null,
          priorityBias: typeof meta?.priorityBias === 'number' ? meta.priorityBias : null
        }
      });
    } catch (_) {
      // ignore DB errors
    }
  }

  _buildHubEntries({ sectionSlugs = [], countryCandidates = [], navigationLinks = [] }) {
    const entries = [];
    const seen = new Set();

    const pushEntry = (url, meta) => {
      if (!url) return;
      if (seen.has(url)) {
        const existing = entries.find((entry) => entry.url === url);
        if (existing) {
          existing.meta = {
            ...existing.meta,
            ...meta
          };
        }
        return;
      }
      seen.add(url);
      entries.push({
        url,
        meta
      });
    };

    for (const slug of (Array.isArray(sectionSlugs) ? sectionSlugs : [])) {
      const url = this._buildAbsolutePathUrl([slug]);
      if (!url) continue;
      pushEntry(url, {
        kind: 'section',
        source: 'pattern-inference',
        reason: 'pattern-section',
        slug,
        // Medium-high priority: sections often contain topic hubs
        priorityBias: 10
      });
    }

    for (const candidate of (Array.isArray(countryCandidates) ? countryCandidates : [])) {
      if (!candidate || !candidate.url) continue;
      pushEntry(candidate.url, {
        kind: 'country',
        source: candidate.source || 'country-planner',
        reason: candidate.reason || 'country-candidate',
        slug: candidate.slug || null,
        // HIGH PRIORITY: Place hubs are foundational for discovering comprehensive article coverage
        // Prioritize early to build complete place hub catalog
        priorityBias: 20
      });
    }

    const navList = Array.isArray(navigationLinks) ? navigationLinks : [];
    for (const link of navList) {
      if (!link || !link.url) continue;
      const type = String(link.type || 'other').toLowerCase();
      const label = Array.isArray(link.labels) && link.labels.length ? link.labels[0] : null;
      const priorityBias = this._navigationPriorityBias(type);
      pushEntry(link.url, {
        kind: 'navigation',
        source: 'navigation-discovery',
        reason: `nav-${type}`,
        label,
        occurrences: Number(link.occurrences) || 0,
        priorityBias
      });
    }

    return entries;
  }

  _navigationPriorityBias(type) {
    switch (type) {
      case 'primary':
        return 6;
      case 'secondary':
        return 4;
      case 'category':
        return 2;
      case 'meta':
        return -2;
      default:
        return 0;
    }
  }

  _categorizeHubsByType(entries) {
    const continentNames = getContinentNames();
    const counts = {
      continent: 0,
      country: 0,
      otherPlace: 0,
      section: 0,
      navigation: 0,
      other: 0
    };

    for (const entry of entries) {
      const kind = entry.meta?.kind;
      const slug = entry.meta?.slug || '';
      
      // Extract name from slug or URL
      let name = slug;
      if (!name && entry.url) {
        try {
          const urlPath = new URL(entry.url).pathname;
          const segments = urlPath.split('/').filter(Boolean);
          name = segments[0] || '';
        } catch (_) {
          // ignore URL parsing errors
        }
      }
      
      // Check if this is a continent (regardless of reported kind)
      if (name && continentNames.has(name.toLowerCase().replace(/-/g, ' '))) {
        counts.continent++;
      } else if (kind === 'country') {
        counts.country++;
      } else if (kind === 'section') {
        counts.section++;
      } else if (kind === 'navigation') {
        counts.navigation++;
      } else if (kind === 'place' || kind === 'region' || kind === 'city') {
        counts.otherPlace++;
      } else {
        counts.other++;
      }
    }

    return counts;
  }

  _emitMilestone(payload, scope) {
    if (!this.telemetry || typeof this.telemetry.milestone !== 'function') {
      return;
    }
    this.telemetry.milestone({
      scope,
      ...payload
    });
  }

  _emitMilestoneOnce(key, payload) {
    if (!this.telemetry) return;
    if (typeof this.telemetry.milestoneOnce === 'function') {
      this.telemetry.milestoneOnce(key, payload);
    } else if (typeof this.telemetry.milestone === 'function') {
      this.telemetry.milestone(payload);
    }
  }

  _emitProblem(payload, scope) {
    if (!this.telemetry || typeof this.telemetry.problem !== 'function') {
      return;
    }
    this.telemetry.problem({
      scope,
      ...payload
    });
  }

  _log(message) {
    try {
      if (this.logger && typeof this.logger.log === 'function') {
        this.logger.log(message);
      }
    } catch (_) {
      // ignore logging failures
    }
  }
}

module.exports = {
  HubSeeder
};
