'use strict';

/**
 * DashboardDataAdapter — the abstraction the D4 dashboard core is parameterized by
 * (distributed-crawl plan v2, §3: "parameterized by a DashboardDataAdapter").
 *
 * It decouples the dashboard's THREE data pieces (throughput, host health, recent
 * headlines) from their SOURCE, so one set of controls can render either the local
 * unifiedApp (full news.db API) or the remote Oracle node (a lean /api/status JSON
 * spool). Each adapter produces the SAME normalized model shape via
 * crawlDashboardCore, and declares — honestly — which pieces its source can and
 * cannot provide (the remote spool has no analysed headlines and no politeness
 * classification, only operational domain state). Keeping capabilities explicit is
 * what keeps a unified dashboard from silently showing empty/wrong panels when a
 * source can't back them.
 *
 * SOURCE INJECTION: an adapter takes a `source` object of async fetchers, not a URL.
 * That makes it usable three ways from one implementation — server-side with a
 * direct (no self-HTTP) provider, client-side with fetch(), and in tests with a
 * stub — and keeps this module pure (no transport, no DOM).
 */

const core = require('./crawlDashboardCore');

class DashboardDataAdapter {
  constructor(opts = {}) {
    this.source = opts.source || null;
    this.label = opts.label || 'adapter';
  }

  /** Which model pieces this source can back. Subclasses override. */
  describe() {
    return { label: this.label, capabilities: { throughput: false, hostHealth: false, headlines: false } };
  }

  async getThroughput() { throw new Error(this.label + ' adapter: getThroughput not implemented'); }
  async getHostHealth() { throw new Error(this.label + ' adapter: getHostHealth not implemented'); }
  async getHeadlines() { throw new Error(this.label + ' adapter: getHeadlines not implemented'); }

  /**
   * The unified dashboard model: all three pieces in one shape. A failing piece is
   * captured as { error } rather than rejecting the whole model — a dashboard shows
   * the panels it can and surfaces the failure on the one it can't.
   */
  async getModel() {
    const desc = this.describe();
    const caps = desc.capabilities;
    // notes[piece] rides along on the unsupported fallback — getX() is never
    // called for an unsupported piece (the skip protects against absent
    // endpoints), so a why-explanation has to travel via describe() instead.
    const notes = desc.notes || {};
    const [throughput, hostHealth, headlines] = await Promise.all([
      caps.throughput ? this.getThroughput().catch((e) => ({ error: e.message })) : Promise.resolve({ supported: false, note: notes.throughput }),
      caps.hostHealth ? this.getHostHealth().catch((e) => ({ error: e.message, badges: [] })) : Promise.resolve({ supported: false, badges: [], note: notes.hostHealth }),
      caps.headlines ? this.getHeadlines().catch((e) => ({ error: e.message, items: [] })) : Promise.resolve({ supported: false, items: [], note: notes.headlines }),
    ]);
    return { source: this.label, capabilities: caps, throughput, hostHealth, headlines };
  }
}

/**
 * LocalDataAdapter — the local unifiedApp (:3170). Full-fidelity source: the jobs
 * payload carries per-job progress rates (already terminal-zeroed by the producer),
 * /host-health carries the politeness classification, /recent-headlines carries
 * analysed titles. source: { fetchJobs(), fetchHostHealth(), fetchHeadlines() }.
 */
class LocalDataAdapter extends DashboardDataAdapter {
  constructor(opts = {}) { super(Object.assign({ label: 'local' }, opts)); }

  describe() {
    return { label: 'local', capabilities: { throughput: true, hostHealth: true, headlines: true } };
  }

  async getThroughput() {
    const jobs = await this.source.fetchJobs();
    const totals = core.normalizeThroughput(jobs);
    return { totals, formatted: core.formatThroughput(totals), activeCount: totals.activeCount };
  }

  async getHostHealth() {
    const payload = await this.source.fetchHostHealth();
    return core.normalizeHostHealth(payload);
  }

  async getHeadlines() {
    const raw = await this.source.fetchHeadlines();
    // The endpoint returns either a bare array or { headlines: [...] }.
    const list = Array.isArray(raw) ? raw : ((raw && raw.headlines) || []);
    return { items: core.normalizeHeadlines(list), supported: true };
  }
}

/**
 * RemoteDataAdapter — the Oracle v2 server (:3200) /api/status. A lean spool, so it
 * degrades HONESTLY: throughput comes from status.throughput.{fetchesPerSec,
 * writesPerSec} mapped to downloaded/saved (network/stored MB are not measured
 * remotely); host "health" is operational domain STATE, not politeness class;
 * analysed headlines are unsupported (the remote never analyses — local news.db is
 * the source of record). source: { fetchStatus() }.
 */
class RemoteDataAdapter extends DashboardDataAdapter {
  constructor(opts = {}) { super(Object.assign({ label: 'remote' }, opts)); }

  describe() {
    // headlines:false is load-bearing — getModel skips the call entirely so the
    // panel reads "unsupported" instead of erroring against an absent endpoint.
    // The note travels here (not in getHeadlines) because the skip means
    // getHeadlines is never reached from getModel.
    return {
      label: 'remote',
      capabilities: { throughput: true, hostHealth: 'domain-state', headlines: false },
      notes: { headlines: REMOTE_HEADLINES_NOTE },
    };
  }

  async getThroughput() {
    const status = await this.source.fetchStatus();
    const tp = status.throughput || {};
    const totals = {
      network: 0,
      downloaded: core.finiteNumber(tp.fetchesPerSec, 0),
      saved: core.finiteNumber(tp.writesPerSec, 0),
      stored: 0,
      queue: core.finiteNumber((status.totals || {}).pending, 0),
      activeCount: core.finiteNumber((status.orchestrator || {}).currentlyRunning, 0),
    };
    return {
      totals,
      formatted: core.formatThroughput(totals),
      activeCount: totals.activeCount,
      note: 'remote fetches/writes per sec mapped to downloaded/saved; network/stored MB not measured remotely',
    };
  }

  async getHostHealth() {
    const status = await this.source.fetchStatus();
    return core.normalizeRemoteDomains(status.domains || []);
  }

  async getHeadlines() {
    return { items: [], supported: false, note: REMOTE_HEADLINES_NOTE };
  }
}

const REMOTE_HEADLINES_NOTE = 'remote spool has no analysed headlines; local news.db is the source of record';

/**
 * makeHttpSource — a source backed by an injected async fetchJson(path) over the
 * local unifiedApp paths. Defaults match the live routes; override via opts.paths.
 */
function makeHttpSource(fetchJson, opts = {}) {
  const paths = Object.assign({
    jobs: '/api/v1/crawl/jobs',
    hostHealth: '/api/v1/crawl/host-health',
    headlines: '/api/v1/recent-headlines?limit=15',
  }, opts.paths || {});
  // The jobs endpoint may return an array or { jobs: [...] } — unwrap defensively.
  const asJobs = (p) => { if (Array.isArray(p)) return p; if (p && Array.isArray(p.jobs)) return p.jobs; if (p && Array.isArray(p.items)) return p.items; if (p && p.job) return [p.job]; return []; };
  return {
    async fetchJobs() { return asJobs(await fetchJson(paths.jobs)); },
    async fetchHostHealth() { return await fetchJson(paths.hostHealth); },
    async fetchHeadlines() { return await fetchJson(paths.headlines); },
  };
}

/** makeRemoteHttpSource — a source backed by fetchJson against the remote /api/status. */
function makeRemoteHttpSource(fetchJson, opts = {}) {
  const statusPath = opts.statusPath || '/api/status';
  return { async fetchStatus() { return await fetchJson(statusPath); } };
}

module.exports = {
  DashboardDataAdapter,
  LocalDataAdapter,
  RemoteDataAdapter,
  makeHttpSource,
  makeRemoteHttpSource,
};
