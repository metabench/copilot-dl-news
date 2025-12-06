const { safeCall } = require('./utils');

class ProblemResolutionHandler {
  constructor({ telemetry = null, state = null, normalizeUrl = null, domain = null, domainNormalized = null } = {}) {
    this.telemetry = telemetry;
    this.state = state;
    this.normalizeUrl = normalizeUrl;
    this.domain = domain;
    this.domainNormalized = domainNormalized;
    this._boundObserver = null;
  }

  async hydrateResolvedHubsFromHistory(resolver) {
    if (!resolver || typeof resolver.getKnownHubSeeds !== 'function') {
      return { status: 'skipped', message: 'Problem resolution disabled' };
    }
    const host = this.domain;
    if (!host) {
      return { status: 'skipped', message: 'No domain available' };
    }

    let seeds;
    try {
      seeds = resolver.getKnownHubSeeds({ host, limit: 100 });
      if (seeds && typeof seeds.then === 'function') seeds = await seeds;
    } catch (error) {
      this.telemetry?.problem?.({
        kind: 'problem-resolution-hydration-failed',
        scope: host,
        message: error?.message || String(error),
        details: { stack: error?.stack || null }
      });
      return { status: 'failed', message: 'Failed to hydrate hub resolutions' };
    }

    if (!Array.isArray(seeds) || seeds.length === 0) {
      return { status: 'skipped', message: 'No stored hub resolutions' };
    }

    const added = [];
    for (const entry of seeds) {
      const normalized = this.normalizeUrl(entry?.url, { phase: 'problem-resolution-hydrated' });
      if (!normalized || this.state.hasSeededHub(normalized)) continue;
      this.state.addSeededHub(normalized, {
        source: 'problem-resolution',
        confidence: entry?.confidence ?? null,
        hydratedFromHistory: true,
        variant: entry?.evidence?.variant || null
      });
      added.push(normalized);
    }

    if (added.length > 0 && this.telemetry && typeof this.telemetry.milestoneOnce === 'function') {
      this.telemetry.milestoneOnce(`problem-resolution:hydrated:${this.domainNormalized || this.domain}`, {
        kind: 'problem-resolution-hydrated',
        message: `Reused ${added.length} known hub${added.length === 1 ? '' : 's'} from history`,
        details: { host, count: added.length, sample: added.slice(0, 5) }
      });
    }

    return added.length > 0
      ? { status: 'completed', message: `Hydrated ${added.length} hub${added.length === 1 ? '' : 's'}` }
      : { status: 'skipped', message: 'Known hubs already registered' };
  }

  handleProblemResolution(payload = {}) {
    if (!payload) return;
    const host = payload?.normalizedHost || this._normalizeHost(payload?.host);
    if (!host || this.domainNormalized !== host) return;
    const url = payload?.url;
    if (!url) return;
    const normalized = this.normalizeUrl(url, { phase: 'problem-resolution-resolved' });
    if (!normalized || this.state.hasSeededHub(normalized)) return;
    this.state.addSeededHub(normalized, {
      source: 'problem-resolution',
      confidence: payload?.candidate?.confidence ?? null,
      variant: payload?.candidate?.variant || null,
      hydratedFromResolution: true
    });
    if (this.telemetry && typeof this.telemetry.milestoneOnce === 'function') {
      this.telemetry.milestoneOnce(`problem-resolution:resolved:${normalized}`, {
        kind: 'problem-resolution-learned',
        message: `Learned resolved hub ${normalized}`,
        details: { host, confidence: payload?.candidate?.confidence ?? null, sourceUrl: payload?.sourceUrl || null }
      });
    }
  }

  attachToResolver(resolver) {
    if (!resolver || typeof resolver.setResolutionObserver !== 'function') return;
    const observer = (payload) => this.handleProblemResolution(payload);
    this._boundObserver = observer;
    resolver.setResolutionObserver(observer);
  }

  detachFromResolver(resolver) {
    if (!resolver || typeof resolver.setResolutionObserver !== 'function') return;
    if (this._boundObserver) {
      resolver.setResolutionObserver(null);
      this._boundObserver = null;
    }
  }

  _normalizeHost(host) {
    if (!host && host !== 0) return null;
    const value = String(host).trim().toLowerCase();
    if (!value) return null;
    const withoutScheme = value.replace(/^https?:\/\//, '');
    return withoutScheme.replace(/\/.*/, '');
  }
}

module.exports = ProblemResolutionHandler;
