'use strict';

const core = require('../crawlDashboardCore');

describe('crawlDashboardCore.isActiveJob', () => {
  it('treats running/pending/created (no finishedAt) as active', () => {
    for (const status of ['running', 'pending', 'created']) {
      expect(core.isActiveJob({ status })).toBe(true);
    }
  });
  it('treats completed/failed/stopped as inactive', () => {
    for (const status of ['completed', 'failed', 'stopped']) {
      expect(core.isActiveJob({ status })).toBe(false);
    }
  });
  it('treats a finishedAt job as inactive even if status still says running', () => {
    expect(core.isActiveJob({ status: 'running', finishedAt: '2026-07-22T00:00:00Z' })).toBe(false);
  });
  it('treats null/undefined as inactive', () => {
    expect(core.isActiveJob(null)).toBe(false);
    expect(core.isActiveJob(undefined)).toBe(false);
  });
});

describe('crawlDashboardCore.normalizeThroughput', () => {
  it('sums the four rates + queue over active jobs only', () => {
    const jobs = [
      { status: 'running', progress: { docsDownloadedPerSec: 1.5, docsSavedPerSec: 0.5, networkMbPerSec: 0.2, savedMbPerSec: 0.1, queued: 10 } },
      { status: 'pending', progress: { docsDownloadedPerSec: 0.5, docsSavedPerSec: 0.25, networkMbPerSec: 0.1, savedMbPerSec: 0.05, queued: 4 } },
    ];
    const t = core.normalizeThroughput(jobs);
    expect(t.downloaded).toBeCloseTo(2.0, 6);
    expect(t.saved).toBeCloseTo(0.75, 6);
    expect(t.network).toBeCloseTo(0.3, 6);
    expect(t.stored).toBeCloseTo(0.15, 6);
    expect(t.queue).toBe(14);
    expect(t.activeCount).toBe(2);
  });

  it('PHANTOM-RATE NON-LEAK: a terminal job with nonzero rate keys is excluded entirely', () => {
    // Even if the producer failed to zero a terminal job (stale build), the active
    // filter is the summing gate — this is the cycle-69 consumer-half guarantee.
    const jobs = [
      { status: 'running', progress: { docsSavedPerSec: 1.0, queued: 3 } },
      { status: 'completed', finishedAt: '2026-07-22T00:00:00Z', progress: { docsSavedPerSec: 2.46, docsDownloadedPerSec: 0, queued: 99 } },
    ];
    const t = core.normalizeThroughput(jobs);
    expect(t.saved).toBeCloseTo(1.0, 6); // the 2.46 ghost is NOT summed
    expect(t.queue).toBe(3);            // the 99 stale queue is NOT summed
    expect(t.activeCount).toBe(1);
  });

  it('respects the [progress, throughput, metrics, job] source order', () => {
    const job = {
      status: 'running',
      progress: { docsDownloadedPerSec: 5 },
      metrics: { throughput: { docsDownloadedPerSec: 9 }, docsDownloadedPerSec: 8 },
      docsDownloadedPerSec: 7,
    };
    expect(core.normalizeThroughput([job]).downloaded).toBe(5); // progress wins
  });

  it('honors legacy fallback key names', () => {
    const job = { status: 'running', progress: { pagesPerSecond: 3, savedDocsPerSecond: 1, mbPerSecond: 0.4, queueSize: 6 } };
    const t = core.normalizeThroughput([job]);
    expect(t.downloaded).toBe(3);
    expect(t.saved).toBe(1);
    expect(t.network).toBeCloseTo(0.4, 6);
    expect(t.queue).toBe(6);
  });

  it('empty / non-array input yields zero totals', () => {
    for (const input of [[], null, undefined, {}]) {
      const t = core.normalizeThroughput(input);
      expect(t).toEqual({ network: 0, downloaded: 0, saved: 0, stored: 0, queue: 0, activeCount: 0 });
    }
  });
});

describe('crawlDashboardCore.formatThroughput', () => {
  it('formats the four rates to 2 decimals and queue to a rounded integer string', () => {
    const f = core.formatThroughput({ network: 0.3, downloaded: 2, saved: 0.756, stored: 0.15, queue: 13.6 });
    expect(f).toEqual({ network: '0.30', downloaded: '2.00', saved: '0.76', stored: '0.15', queue: '14' });
  });
  it('non-finite rates format as 0.00 and queue as 0', () => {
    const f = core.formatThroughput({ network: NaN, downloaded: undefined, saved: 'x', stored: null, queue: NaN });
    expect(f).toEqual({ network: '0.00', downloaded: '0.00', saved: '0.00', stored: '0.00', queue: '0' });
  });
});

describe('crawlDashboardCore.normalizeHostHealth', () => {
  it('returns the empty/refreshing text when no hosts met the threshold', () => {
    expect(core.normalizeHostHealth({ refreshing: true, hosts: [] }).emptyText).toBe('computing…');
    expect(core.normalizeHostHealth({ refreshing: false, hosts: [] }).emptyText).toBe('no host met the threshold recently');
  });
  it('builds contrast-safe badges: explicit bg AND fg AND coloured border, www stripped', () => {
    const model = core.normalizeHostHealth({ hosts: [{ host: 'www.theguardian.com', cls: 'POLITE-THROTTLE', verdict: 'polite', n: 20, gMed: 33.4, cv: 0.12, mbps: 0.05, kbMed: 60 }] });
    const b = model.badges[0];
    expect(b.host).toBe('theguardian.com');
    expect(b.color).toBe('#c99a33');
    expect(b.chipStyle).toContain('background:#241f18');
    expect(b.chipStyle).toContain('color:#ece8e0');           // the contrast-trap guard
    expect(b.chipStyle).toContain('border:1px solid #c99a33');
    expect(b.label).toBe('theguardian.com  33s');
    expect(b.title).toContain('CV 0.12');
  });
  it('an unknown class gets the neutral fallback colour, still contrast-safe', () => {
    const b = core.normalizeHostHealth({ hosts: [{ host: 'x.test', cls: 'WAT', gMed: 1 }] }).badges[0];
    expect(b.color).toBe('#666');
    expect(b.chipStyle).toContain('color:#ece8e0');
  });
});

describe('crawlDashboardCore.normalizeRemoteDomains', () => {
  it('maps domain state to an operational badge flagged domain-state (not politeness)', () => {
    const model = core.normalizeRemoteDomains([
      { domain: 'bbc.com', state: 'running', isRunning: true },
      { domain: 'www.cnn.com', state: 'idle', isRunning: false },
    ]);
    expect(model.kind).toBe('domain-state');
    expect(model.badges[0].cls).toBe('RUNNING');
    expect(model.badges[0].color).toBe('#3a9d6a');
    expect(model.badges[1].host).toBe('cnn.com');
    expect(model.badges[1].cls).toBe('IDLE');
    expect(model.badges[0].kind).toBe('domain-state');
  });
  it('empty domains -> empty model', () => {
    const model = core.normalizeRemoteDomains([]);
    expect(model.empty).toBe(true);
    expect(model.badges).toEqual([]);
  });
});

describe('crawlDashboardCore.escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(core.escapeHtml('a<b>&"\'')).toBe('a&lt;b&gt;&amp;&quot;&#39;');
  });
  it('escapes & first so entities are not double-broken, and coerces null/undefined to empty', () => {
    expect(core.escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(core.escapeHtml(null)).toBe('');
    expect(core.escapeHtml(undefined)).toBe('');
    expect(core.escapeHtml(42)).toBe('42');
  });
});

describe('crawlDashboardCore.normalizeHeadline', () => {
  it('normalizes fields, strips www, formats analysed-at, builds meta text', () => {
    const h = core.normalizeHeadline({ title: 'Big News', url: 'https://x/y', host: 'www.apnews.com', section: 'World', analyzedAt: '2026-07-22T00:11:22Z' });
    expect(h.title).toBe('Big News');
    expect(h.host).toBe('apnews.com');
    expect(h.analyzedAt).toBe('2026-07-22 00:11:22');
    expect(h.metaText).toBe('apnews.com  ·  World  ·  2026-07-22 00:11:22 UTC');
  });
  it('falls back for a missing title and tolerates snake_case timestamp fields', () => {
    const h = core.normalizeHeadline({ analyzed_at: '2026-07-22 01:02:03' });
    expect(h.title).toBe('(untitled)');
    expect(h.url).toBe(null);
    expect(h.analyzedAt).toBe('2026-07-22 01:02:03');
  });
});
