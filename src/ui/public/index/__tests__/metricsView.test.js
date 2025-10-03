/**
 * @jest-environment jsdom
 */

let createMetricsView;

beforeAll(async () => {
  ({ createMetricsView } = await import('../metricsView.js'));
});

describe('createMetricsView', () => {
  let elements;
  let view;

  const makeSpan = () => document.createElement('span');

  beforeEach(() => {
    const qsize = makeSpan();
    qsize.appendChild(document.createTextNode('queue: —'));

    elements = {
      reqpsLabel: makeSpan(),
      dlpsLabel: makeSpan(),
      errpm: makeSpan(),
      qsize,
      errs: makeSpan(),
      qPoly: document.createElement('div'),
      qTitle: makeSpan(),
      cacheGauge: makeSpan(),
      cacheInfo: makeSpan(),
      reqpsPoly: document.createElement('div'),
      reqpsTitle: makeSpan(),
      dlpsPoly: document.createElement('div'),
      dlpsTitle: makeSpan(),
      badgeRobots: makeSpan(),
      badgeSitemap: makeSpan(),
      domRpm: makeSpan(),
      domLim: makeSpan(),
      domBk: makeSpan(),
      domRl: makeSpan(),
      eta: makeSpan()
    };

    view = createMetricsView({ elements, formatNumber: (value) => String(value) });
  });

  test('handleProgress updates key metric elements', () => {
    const now = Date.now();
    view.handleProgress({
      visited: 40,
      downloaded: 20,
      errors: 2,
      queueSize: 12,
      robotsLoaded: true,
      sitemapCount: 4,
      sitemapEnqueued: 1,
      domainRpm: 30,
      domainLimit: 60,
      domainIntervalMs: 500,
      domainBackoffMs: 4000,
      domainRateLimited: true,
      slowMode: true,
      slowModeReason: 'HTTP 429'
    }, now);

    expect(elements.reqpsLabel.textContent).toContain('req/s:');
    expect(elements.errpm.textContent).toContain('err/min:');
    expect(elements.qsize.textContent).toContain('queue:');
    expect(elements.badgeRobots.textContent).toContain('robots: ok');
    expect(elements.badgeSitemap.textContent).toMatch(/sitemap:/);
    expect(view.getQueueDisplayValue(0)).toBeGreaterThanOrEqual(0);
    expect(elements.domRl.style.display).toBe('');
    expect(elements.domRl.textContent).toBe('Slow mode (HTTP 429)');
    expect(elements.domRl.title).toMatch(/HTTP 429/);
  });

  test('handleCacheEvent increments cache hit summary', () => {
    view.handleCacheEvent({ source: 'memory', ageSeconds: 5, url: 'https://example.com' });
    expect(elements.cacheInfo.textContent).toContain('cached hits: 1');
    view.handleCacheEvent({ source: 'disk', ageSeconds: 2 });
    expect(elements.cacheInfo.textContent).toContain('cached hits: 2');
  });

  test('refreshServerMetrics parses metrics text', async () => {
    const fakeFetch = async () => ({
      ok: true,
      async text() {
        return [
          'crawler_requests_per_second 2.5',
          'crawler_downloads_per_second 1.2',
          'crawler_error_rate_per_min 0.50',
          'crawler_queue_size 42',
          'crawler_errors_total 7'
        ].join('\n');
      }
    });

    await view.refreshServerMetrics(fakeFetch);

    expect(elements.reqpsLabel.textContent).toContain('2.50');
    expect(elements.dlpsTitle.textContent).toContain('dl/s');
    expect(elements.qsize.textContent).toContain('42');
    expect(elements.errs.textContent).toContain('7');
    expect(elements.errpm.classList.contains('warn')).toBe(false);
  });
});
