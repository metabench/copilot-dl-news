'use strict';

class HubSeeder {
  constructor({
    enqueueRequest,
    normalizeUrl,
    state,
    telemetry,
    db,
    baseUrl,
    logger = console
  } = {}) {
    this.enqueueRequest = typeof enqueueRequest === 'function' ? enqueueRequest : null;
    this.normalizeUrl = typeof normalizeUrl === 'function' ? normalizeUrl : null;
    this.state = state || null;
    this.telemetry = telemetry || null;
    this.db = db || null;
    this.baseUrl = baseUrl;
    this.logger = logger;
  }

  async seedPlan({ host, sectionSlugs = [], countryCandidates = [], maxSeeds = 50 }) {
    if (!this.enqueueRequest) {
      return {
        seededCount: 0,
        requestedCount: 0,
        sectionHubCount: sectionSlugs.length,
        countryCandidateCount: countryCandidates.length,
        sampleSeeded: []
      };
    }

    const sectionHubs = sectionSlugs.map((slug) => this._buildAbsolutePathUrl([slug])).filter(Boolean);
    const candidateUrls = countryCandidates.map((c) => c?.url).filter(Boolean);
    const hubSet = new Set([...sectionHubs, ...candidateUrls]);
    const cap = typeof maxSeeds === 'number' && maxSeeds > 0 ? maxSeeds : 50;
    const hubs = Array.from(hubSet).slice(0, cap);

    const seeded = [];
    for (const hubUrl of hubs) {
      const enqueued = this.enqueueRequest({
        url: hubUrl,
        depth: 0,
        type: {
          kind: 'hub-seed',
          reason: 'intelligent-seed'
        }
      });
      if (enqueued) {
        const normalized = this._safeNormalize(hubUrl);
        if (normalized && this.state?.addSeededHub) {
          this.state.addSeededHub(normalized);
        }
        seeded.push(hubUrl);
      }
      this._recordSeedInDatabase(host, hubUrl);
    }

    this._log(`Intelligent plan: seeded ${seeded.length} hub(s)`);

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
          if (this.state?.addSeededHub) this.state.addSeededHub(normalized);
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

  _recordSeedInDatabase(host, hubUrl) {
    if (!this.db || !this.db.db || typeof this.db.db.prepare !== 'function') {
      return;
    }
    try {
      this.db.db.prepare(`INSERT OR IGNORE INTO place_hubs(host, url, place_slug, place_kind, topic_slug, topic_label, topic_kind, title, first_seen_at, last_seen_at, nav_links_count, article_links_count, evidence) VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, NULL, datetime('now'), datetime('now'), NULL, NULL, ?)`)
        .run(host, hubUrl, JSON.stringify({ by: 'intelligent-plan', reason: 'learned-section-or-country' }));
    } catch (_) {
      // ignore DB errors
    }
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
