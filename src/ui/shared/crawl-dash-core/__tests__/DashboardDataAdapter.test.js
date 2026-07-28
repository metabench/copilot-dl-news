'use strict';

const { LocalDataAdapter, RemoteDataAdapter, makeHttpSource, makeRemoteHttpSource } = require('../DashboardDataAdapter');

// A representative local /api/v1/crawl/jobs payload (sanitized _toPublicJob shape).
const LOCAL_JOBS = [
  { id: 'a', status: 'running', progress: { docsDownloadedPerSec: 1.2, docsSavedPerSec: 0.6, networkMbPerSec: 0.3, savedMbPerSec: 0.1, queued: 20 } },
  { id: 'b', status: 'completed', finishedAt: '2026-07-22T00:00:00Z', progress: { docsSavedPerSec: 2.46, queued: 99 } },
];
const LOCAL_HOST_HEALTH = { status: 'ok', refreshing: false, hosts: [{ host: 'www.bbc.com', cls: 'FAST', verdict: 'fast', n: 30, gMed: 1, cv: 0.1, mbps: 0.2, kbMed: 60 }] };
const LOCAL_HEADLINES = { headlines: [{ title: 'A', url: 'https://x', host: 'www.apnews.com', section: 'World', analyzedAt: '2026-07-22T00:11:22Z' }] };

// A representative remote /api/status payload (verified sample, cycle 70).
const REMOTE_STATUS = {
  service: 'Multi-Domain Crawl Server v4',
  throughput: { fetchesPerSec: 0.83, writesPerSec: 0.41, windowSec: 60 },
  orchestrator: { running: true, currentlyRunning: 2, totalDomains: 10 },
  totals: { fetched: 100, stored: 95, errors: 1, pending: 42 },
  domains: [
    { domain: 'bbc.com', state: 'running', isRunning: true },
    { domain: 'www.cnn.com', state: 'idle', isRunning: false },
  ],
};

describe('LocalDataAdapter', () => {
  const source = {
    async fetchJobs() { return LOCAL_JOBS; },
    async fetchHostHealth() { return LOCAL_HOST_HEALTH; },
    async fetchHeadlines() { return LOCAL_HEADLINES; },
  };
  const adapter = new LocalDataAdapter({ source });

  it('declares full capabilities', () => {
    expect(adapter.describe().capabilities).toEqual({ throughput: true, hostHealth: true, headlines: true });
  });

  it('getThroughput sums active jobs only (terminal ghost excluded)', async () => {
    const t = await adapter.getThroughput();
    expect(t.totals.downloaded).toBeCloseTo(1.2, 6);
    expect(t.totals.saved).toBeCloseTo(0.6, 6); // the terminal job's 2.46 is NOT counted
    expect(t.totals.queue).toBe(20);            // the terminal job's 99 is NOT counted
    expect(t.activeCount).toBe(1);
    expect(t.formatted).toEqual({ network: '0.30', downloaded: '1.20', saved: '0.60', stored: '0.10', queue: '20' });
  });

  it('getModel assembles all three pieces', async () => {
    const m = await adapter.getModel();
    expect(m.source).toBe('local');
    expect(m.hostHealth.badges[0].host).toBe('bbc.com');
    expect(m.headlines.supported).toBe(true);
    expect(m.headlines.items[0].host).toBe('apnews.com');
  });
});

describe('RemoteDataAdapter', () => {
  const source = { async fetchStatus() { return REMOTE_STATUS; } };
  const adapter = new RemoteDataAdapter({ source });

  it('declares HONEST degraded capabilities (headlines unsupported, host-health = domain-state)', () => {
    expect(adapter.describe().capabilities).toEqual({ throughput: true, hostHealth: 'domain-state', headlines: false });
  });

  it('maps fetches/writes per sec to downloaded/saved and pending to queue', async () => {
    const t = await adapter.getThroughput();
    expect(t.totals.downloaded).toBeCloseTo(0.83, 6);
    expect(t.totals.saved).toBeCloseTo(0.41, 6);
    expect(t.totals.network).toBe(0);   // remote does not measure network MB
    expect(t.totals.stored).toBe(0);
    expect(t.totals.queue).toBe(42);
    expect(t.totals.activeCount).toBe(2);
    expect(t.formatted).toEqual({ network: '0.00', downloaded: '0.83', saved: '0.41', stored: '0.00', queue: '42' });
    expect(t.note).toMatch(/not measured remotely/);
  });

  it('host health is operational domain state, flagged as such', async () => {
    const hh = await adapter.getHostHealth();
    expect(hh.kind).toBe('domain-state');
    expect(hh.badges.map((b) => b.cls)).toEqual(['RUNNING', 'IDLE']);
  });

  it('getModel SKIPS the unsupported headlines call and reports it as unsupported', async () => {
    const m = await adapter.getModel();
    expect(m.headlines.supported).toBe(false);
    expect(m.headlines.items).toEqual([]);
    expect(m.throughput.totals.queue).toBe(42);
    expect(m.hostHealth.badges).toHaveLength(2);
  });

  it('getModel carries the WHY note for the skipped headlines piece (describe().notes path)', async () => {
    // getHeadlines is never called for an unsupported piece, so the explanatory
    // note must travel via describe().notes — a fallback-only note is dead code.
    const m = await adapter.getModel();
    expect(m.headlines.note).toMatch(/local news\.db is the source of record/);
  });
});

describe('DashboardDataAdapter error isolation', () => {
  it('a failing piece is captured as { error } without sinking the whole model', async () => {
    const source = {
      async fetchJobs() { throw new Error('jobs endpoint down'); },
      async fetchHostHealth() { return LOCAL_HOST_HEALTH; },
      async fetchHeadlines() { return LOCAL_HEADLINES; },
    };
    const m = await new LocalDataAdapter({ source }).getModel();
    expect(m.throughput.error).toMatch(/jobs endpoint down/);
    expect(m.hostHealth.badges[0].host).toBe('bbc.com'); // other pieces still populate
    expect(m.headlines.items).toHaveLength(1);
  });
});

describe('makeHttpSource / makeRemoteHttpSource', () => {
  it('local http source unwraps a bare-array or {jobs:[]} jobs payload and hits the default paths', async () => {
    const seen = [];
    const fetchJson = async (p) => {
      seen.push(p);
      if (p.startsWith('/api/v1/crawl/jobs')) return { jobs: LOCAL_JOBS };
      if (p.startsWith('/api/v1/crawl/host-health')) return LOCAL_HOST_HEALTH;
      return LOCAL_HEADLINES;
    };
    const src = makeHttpSource(fetchJson);
    expect(await src.fetchJobs()).toHaveLength(2);
    await src.fetchHostHealth();
    await src.fetchHeadlines();
    expect(seen).toEqual(['/api/v1/crawl/jobs', '/api/v1/crawl/host-health', '/api/v1/recent-headlines?limit=15']);
  });
  it('remote http source hits /api/status', async () => {
    const seen = [];
    const src = makeRemoteHttpSource(async (p) => { seen.push(p); return REMOTE_STATUS; });
    expect((await src.fetchStatus()).service).toMatch(/v4/);
    expect(seen).toEqual(['/api/status']);
  });
});
