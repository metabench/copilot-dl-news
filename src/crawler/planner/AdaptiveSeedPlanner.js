'use strict';

class AdaptiveSeedPlanner {
  constructor(deps = {}) {
    this._setDefaults();
    this.updateDependencies(deps);
  }

  _setDefaults() {
    this.baseUrl = null;
    this.state = null;
    this.telemetry = null;
    this.normalizeUrl = null;
    this.enqueueRequest = null;
    this.logger = console;
    this.hierarchicalPlanner = null;
    this.domain = null;
  }

  updateDependencies({
    baseUrl,
    state,
    telemetry,
    normalizeUrl,
    enqueueRequest,
    logger,
    hierarchicalPlanner,
    domain
  } = {}) {
    if (baseUrl !== undefined) this.baseUrl = baseUrl;
    if (state) this.state = state;
    if (telemetry) this.telemetry = telemetry;
    if (typeof normalizeUrl === 'function') this.normalizeUrl = normalizeUrl;
    if (typeof enqueueRequest === 'function') this.enqueueRequest = enqueueRequest;
    if (logger) this.logger = logger;
    if (hierarchicalPlanner) this.hierarchicalPlanner = hierarchicalPlanner;
    if (domain !== undefined) this.domain = domain;
  }

  seedFromArticle({
    url,
    metadata,
    depth
  } = {}) {
    if (!this._isReady()) return {
      seededHubs: 0,
      historySeeds: 0,
      enqueued: 0
    };

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

    if (typeof url === 'string' && url.length) {
      try {
        const parsed = new URL(url, this.baseUrl || undefined);
        const segments = (parsed.pathname || '/').split('/').filter(Boolean);
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
      } catch (err) {
        this.logger?.debug?.('AdaptiveSeedPlanner: failed to parse URL for candidates', err);
      }
    }

    if (!candidates.length) {
      return {
        seededHubs: 0,
        historySeeds: 0,
        enqueued: 0
      };
    }

    const seen = new Set();
    let seededHubs = 0;
    let historySeeds = 0;
    let enqueued = 0;

    for (const cand of candidates) {
      if (!cand || !cand.url) continue;
      let normalized = null;
      try {
        normalized = this.normalizeUrl ? this.normalizeUrl(cand.url) : cand.url;
      } catch (err) {
        normalized = cand.url;
      }
      if (!normalized) continue;
      const key = `${cand.kind}:${normalized}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (cand.kind === 'hub-seed') {
        if (this.state?.hasSeededHub?.(normalized) || this.state?.hasVisited?.(normalized)) continue;
        const depthForSeed = Math.max(0, (depth || 0) - 1);
        const enqueuedSeed = this.enqueueRequest({
          url: cand.url,
          depth: depthForSeed,
          type: {
            kind: 'hub-seed',
            reason: cand.reason
          }
        });
        if (enqueuedSeed) {
          enqueued += 1;
          seededHubs += 1;
          this.state?.addSeededHub?.(normalized);
          this._milestoneOnce(`adaptive-hub:${normalized}`, {
            kind: 'adaptive-hub-seeded',
            message: 'Queued adaptive hub for deeper coverage',
            details: {
              url: normalized,
              reason: cand.reason
            }
          });
        }
      } else if (cand.kind === 'history') {
        if (this.state?.hasHistorySeed?.(normalized) || this.state?.hasVisited?.(normalized)) continue;
        const depthForSeed = Math.max(0, (depth || 0) - 1);
        const enqueuedHistory = this.enqueueRequest({
          url: cand.url,
          depth: depthForSeed,
          type: {
            kind: 'history',
            reason: cand.reason
          }
        });
        if (enqueuedHistory) {
          enqueued += 1;
          historySeeds += 1;
          this.state?.addHistorySeed?.(normalized);
          this._milestoneOnce(`history-seed:${normalized}`, {
            kind: 'history-path-seeded',
            message: 'Queued archive/history path discovered from article',
            details: {
              url: normalized,
              reason: cand.reason
            }
          });
        }
      }
    }

    return {
      seededHubs,
      historySeeds,
      enqueued
    };
  }

  /**
   * Seed with hierarchical planning simulation (tactical planning)
   */
  async seedWithSimulation({ url, metadata, depth } = {}) {
    if (!this._isReady()) {
      return { seededHubs: 0, historySeeds: 0, enqueued: 0 };
    }

    // Get candidates using existing logic
    const candidates = this._getCandidatesForSimulation(url, metadata);
    
    if (!candidates.length || !this.hierarchicalPlanner) {
      // Fallback to non-simulation seeding
      return this.seedFromArticle({ url, metadata, depth });
    }

    // Simulate each candidate's potential
    const simulations = [];
    for (const cand of candidates.slice(0, 5)) {
      try {
        const state = this.state?.getCurrentState?.() || {
          hubsDiscovered: 0,
          articlesCollected: 0,
          requestsMade: 0,
          momentum: 0
        };
        
        const result = await this.hierarchicalPlanner.simulateSequence(
          [{ type: 'explore-hub', url: cand.url, estimatedArticles: 50, estimatedRequests: 10, confidence: 0.7 }],
          state,
          { domain: this.domain }
        );
        
        simulations.push({ ...cand, simulation: result });
      } catch (err) {
        this.logger?.debug?.('AdaptiveSeedPlanner: simulation failed for', cand.url, err);
      }
    }

    // Prioritize by feasibility + expected value
    const ranked = simulations
      .filter(s => s.simulation?.feasible)
      .sort((a, b) => (b.simulation?.totalValue || 0) - (a.simulation?.totalValue || 0));

    // Enqueue top candidates with boosted priority
    let seededHubs = 0;
    let historySeeds = 0;
    let enqueued = 0;

    ranked.forEach((cand, idx) => {
      const normalized = this.normalizeUrl ? this.normalizeUrl(cand.url) : cand.url;
      if (!normalized) return;

      if (cand.kind === 'hub-seed') {
        if (this.state?.hasSeededHub?.(normalized) || this.state?.hasVisited?.(normalized)) return;
        
        const enqueuedSeed = this.enqueueRequest({
          url: cand.url,
          depth: Math.max(0, (depth || 0) - 1),
          priority: 80 - (idx * 5), // Higher priority for higher-value hubs
          type: {
            kind: 'hub-seed',
            reason: cand.reason,
            simulatedValue: cand.simulation?.totalValue,
            source: 'hierarchical-planning'
          }
        });

        if (enqueuedSeed) {
          enqueued += 1;
          seededHubs += 1;
          this.state?.addSeededHub?.(normalized);
          this._milestoneOnce(`simulated-hub:${normalized}`, {
            kind: 'simulation-based-seed',
            message: `Queued hub with simulated value ${Math.round(cand.simulation?.totalValue || 0)}`,
            details: {
              url: normalized,
              reason: cand.reason,
              simulatedValue: cand.simulation?.totalValue,
              confidence: cand.simulation?.steps?.[0]?.confidence
            }
          });
        }
      } else if (cand.kind === 'history') {
        if (this.state?.hasHistorySeed?.(normalized)) return;
        
        const enqueuedHistory = this.enqueueRequest({
          url: cand.url,
          depth: Math.max(0, (depth || 0) - 1),
          priority: 70 - (idx * 5),
          type: { kind: 'history', reason: cand.reason }
        });

        if (enqueuedHistory) {
          enqueued += 1;
          historySeeds += 1;
          this.state?.addHistorySeed?.(normalized);
        }
      }
    });

    return { seededHubs, historySeeds, enqueued };
  }

  _getCandidatesForSimulation(url, metadata) {
    const candidates = [];
    const sectionSlugFromMeta = this._normalizeSectionSlug(metadata?.section);
    if (sectionSlugFromMeta) {
      const hubUrl = this._buildAbsolutePathUrl([sectionSlugFromMeta]);
      if (hubUrl) {
        candidates.push({ url: hubUrl, kind: 'hub-seed', reason: 'section-metadata' });
      }
    }

    if (typeof url === 'string' && url.length) {
      try {
        const parsed = new URL(url, this.baseUrl || undefined);
        const segments = (parsed.pathname || '/').split('/').filter(Boolean);
        if (segments.length > 0) {
          const primarySlug = this._normalizeSectionSlug(segments[0]);
          if (primarySlug) {
            const primaryHub = this._buildAbsolutePathUrl([primarySlug]);
            if (primaryHub) {
              candidates.push({ url: primaryHub, kind: 'hub-seed', reason: 'section-from-path' });
            }
          }
        }
        candidates.push(...this._collectHistoryCandidatesFromSegments(segments));
      } catch (err) {
        this.logger?.debug?.('AdaptiveSeedPlanner: failed to parse URL', err);
      }
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
      out.push({
        url: baseHubUrl,
        kind: 'hub-seed',
        reason: 'section-from-archive'
      });
    }
    const yearUrl = this._buildAbsolutePathUrl([...baseSegments, year]);
    if (yearUrl) {
      out.push({
        url: yearUrl,
        kind: 'history',
        reason: 'year-archive'
      });
    }
    const monthIdx = yearIdx + 1;
    if (monthIdx < segments.length) {
      const monthSegRaw = segments[monthIdx];
      const monthSeg = String(monthSegRaw || '').toLowerCase();
      if (/^(0?[1-9]|1[0-2]|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)$/.test(monthSeg)) {
        const monthUrl = this._buildAbsolutePathUrl([...baseSegments, year, monthSegRaw]);
        if (monthUrl) {
          out.push({
            url: monthUrl,
            kind: 'history',
            reason: 'month-archive'
          });
        }
      }
    }
    return out;
  }

  _buildAbsolutePathUrl(segments) {
    if (!Array.isArray(segments) || segments.length === 0) return null;
    const baseUrl = this.baseUrl || '';
    const encoded = segments
      .map((seg) => String(seg || '').trim())
      .filter(Boolean)
      .map((seg) => encodeURIComponent(seg));
    if (!encoded.length) return null;
    return `${baseUrl}/${encoded.join('/')}/`;
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

  _milestoneOnce(key, payload) {
    if (!this.telemetry || typeof this.telemetry.milestoneOnce !== 'function') return;
    try {
      this.telemetry.milestoneOnce(key, payload);
    } catch (err) {
      this.logger?.warn?.('AdaptiveSeedPlanner: failed to record milestone', err);
    }
  }

  _isReady() {
    return !!(this.baseUrl && this.state && this.normalizeUrl && this.enqueueRequest);
  }
}

module.exports = {
  AdaptiveSeedPlanner
};
