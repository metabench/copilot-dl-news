'use strict';

// Unit tests for the crawl-status detail builder surfaced on the crawler
// 'progress' event (owner ask 2026-07-19: show WHEN the crawl is fetching
// sitemaps + WHICH ones, and reveal normally-hidden detail on click).
// Tests the PURE builder directly — NewsCrawler._buildProgressDetail is a thin
// wrapper that gathers this.robotsCoordinator/this.state and delegates here, so
// this covers the real logic without loading the full crawler (which pulls in
// jsdom and cannot be required under jest).

const { buildProgressDetail, stripQuery } = require('../progressDetail');

function sources(overrides = {}) {
  return {
    phase: 'sitemaps',
    sitemapInfo: {
      urls: ['https://site/sitemap.xml', 'https://site/news-sitemap.xml'],
      discovered: 4213
    },
    currentDownloads: new Map([
      ['https://site/article/a?token=SECRET&ref=x', { startedAt: 1000 }],
      ['https://site/article/b', { startedAt: 2000 }]
    ]),
    domainLimits: new Map([
      ['site', { isLimited: false, rpm: 30, backoffUntil: 0 }]
    ]),
    robotsInfo: { robotsLoaded: true, source: 'network', crawlDelaySeconds: 2, politenessFloorMs: 2000 },
    now: 5000,
    ...overrides
  };
}

describe('buildProgressDetail', () => {
  it('surfaces the phase, which sitemaps (pending until fetched), and enqueue count', () => {
    const detail = buildProgressDetail(sources());
    expect(detail.phase).toBe('sitemaps');
    expect(detail.sitemaps).toEqual([
      { url: 'https://site/sitemap.xml', status: 'pending' },
      { url: 'https://site/news-sitemap.xml', status: 'pending' }
    ]);
    expect(detail.sitemapCount).toBe(2);
    expect(detail.sitemapsFetched).toBe(0);
    expect(detail.sitemapEnqueued).toBe(4213);
  });

  it('marks sitemaps fetched/failed/pending from fetch outcomes (incl. nested children)', () => {
    const detail = buildProgressDetail(sources({
      sitemapInfo: {
        urls: ['https://s/a.xml', 'https://s/b.xml', 'https://s/c.xml'],
        discovered: 10,
        fetches: [
          { url: 'https://s/a.xml', status: 200 },
          { url: 'https://s/b.xml', status: 404 },
          { url: 'https://s/child.xml', status: 304 } // nested, not in harvested list
        ]
      }
    }));
    expect(detail.sitemaps).toEqual([
      { url: 'https://s/a.xml', status: 'fetched' },
      { url: 'https://s/b.xml', status: 'failed' },
      { url: 'https://s/c.xml', status: 'pending' },
      { url: 'https://s/child.xml', status: 'fetched' } // 304 counts as fetched
    ]);
    expect(detail.sitemapCount).toBe(4);
    expect(detail.sitemapsFetched).toBe(2);
  });

  it('lists in-flight downloads newest-first with query strings stripped (no token leak)', () => {
    const detail = buildProgressDetail(sources());
    expect(detail.currentDownloadsCount).toBe(2);
    expect(detail.currentDownloads.map((d) => d.url)).toEqual([
      'https://site/article/b',   // startedAt 2000 sorts first
      'https://site/article/a'    // query dropped — no ?token=SECRET
    ]);
    expect(detail.currentDownloads[0].ageMs).toBe(3000); // now 5000 - startedAt 2000
    expect(JSON.stringify(detail.currentDownloads)).not.toMatch(/SECRET/);
  });

  it('reports per-host limits and robots policy', () => {
    const detail = buildProgressDetail(sources());
    expect(detail.perHostLimits.site).toEqual({ rateLimited: false, limit: 30, intervalMs: 2000, backoffMs: null });
    expect(detail.robots).toEqual({ loaded: true, source: 'network', crawlDelaySeconds: 2, politenessFloorMs: 2000 });
  });

  it('caps sitemaps/in-flight/hosts defensively (history-bloat guard)', () => {
    const manyUrls = Array.from({ length: 80 }, (_v, i) => 'https://site/sitemap-' + i + '.xml');
    const manyDl = new Map(Array.from({ length: 40 }, (_v, i) => ['https://site/p' + i, { startedAt: i }]));
    const manyHosts = new Map(Array.from({ length: 40 }, (_v, i) => ['h' + i, { rpm: 30 }]));
    const detail = buildProgressDetail(sources({ sitemapInfo: { urls: manyUrls, discovered: 999 }, currentDownloads: manyDl, domainLimits: manyHosts }));
    expect(detail.sitemaps.length).toBe(50);
    expect(detail.sitemapCount).toBe(80); // count reflects reality even when list is capped
    expect(detail.currentDownloads.length).toBe(10);
    expect(Object.keys(detail.perHostLimits).length).toBe(20);
  });

  it('never throws when providers are missing (telemetry must not break the crawl)', () => {
    expect(buildProgressDetail({ phase: 'preparing' })).toEqual({ phase: 'preparing' });
    expect(buildProgressDetail({})).toEqual({ phase: null });
    expect(buildProgressDetail()).toEqual({ phase: null });
  });

  it('is JSON-serializable so it survives worker-mode IPC (safeData round-trip)', () => {
    const detail = buildProgressDetail(sources());
    const roundTripped = JSON.parse(JSON.stringify(detail));
    expect(roundTripped.sitemaps).toEqual(detail.sitemaps);
    expect(roundTripped.perHostLimits).toEqual(detail.perHostLimits);
  });

  it('computes intervalMs and backoffMs from rate-limit state', () => {
    const detail = buildProgressDetail(sources({
      domainLimits: new Map([['h', { isLimited: true, rpm: 60, backoffUntil: 9000 }]]),
      now: 5000
    }));
    expect(detail.perHostLimits.h).toEqual({ rateLimited: true, limit: 60, intervalMs: 1000, backoffMs: 4000 });
  });
});

describe('stripQuery', () => {
  it('drops query and hash, keeps origin+path', () => {
    expect(stripQuery('https://h/p/x?a=1&b=2#frag')).toBe('https://h/p/x');
  });
  it('returns the input unchanged when it is not a URL', () => {
    expect(stripQuery('not a url')).toBe('not a url');
    expect(stripQuery(null)).toBe('');
  });
});
