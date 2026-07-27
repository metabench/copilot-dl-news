/**
 * @jest-environment jsdom
 */
'use strict';

// DOM-level tests for the crawl-status client: the phase badge, the expandable
// per-job detail panel, and — critically — that an expanded panel SURVIVES the
// full #rows innerHTML rebuild (the 3s poll / a Refresh click). Guards the
// invariants the adversarial review flagged as untested: Visited must stay the
// 4th <td> of the main row, and expandedJobs must persist across rebuilds.
//
// Drives the REAL client script (buildCrawlStatusClientScript) in jsdom with a
// stubbed /jobs fetch; rebuilds are triggered via the Refresh button so no
// timers are needed.

const { buildCrawlStatusClientScript } = require('../crawl-status-client');

const JOBS = {
  items: [
    {
      id: 'done-1', status: 'completed',
      progress: { visited: 33, downloaded: 30, errors: 0, queued: 0, percentComplete: 100, updatedAt: '2026-07-19T02:44:10.000Z' }
    },
    {
      id: 'run-1', status: 'running',
      progress: {
        phase: 'sitemaps', visited: 24, downloaded: 0, errors: 0, queued: 5096,
        sitemaps: [{ url: 'https://x/sitemap.xml', status: 'fetched' }, { url: 'https://x/news-sitemap.xml', status: 'pending' }],
        sitemapCount: 2, sitemapsFetched: 1, sitemapEnqueued: 5096,
        currentDownloads: [{ url: 'https://x/a', ageMs: 120 }],
        currentDownloadsCount: 1,
        perHostLimits: { 'x.example': { rateLimited: true, limit: 30, intervalMs: 2000, backoffMs: 4000 } },
        robots: { loaded: true, source: 'network', crawlDelaySeconds: null, politenessFloorMs: null },
        updatedAt: '2026-07-19T02:45:31.000Z'
      }
    }
  ]
};

const flush = async () => { for (let i = 0; i < 12; i++) { await Promise.resolve(); } };

function bootClient(jobs) {
  document.body.innerHTML =
    '<div id="throughput-strip">' +
      '<span data-crawl-throughput-stat="network"></span>' +
      '<span data-crawl-throughput-stat="downloaded"></span>' +
      '<span data-crawl-throughput-stat="saved"></span>' +
      '<span data-crawl-throughput-stat="stored"></span>' +
      '<span data-crawl-throughput-stat="queue"></span>' +
    '</div>' +
    '<table><tbody id="rows"></tbody></table>';
  const stub = function (url) {
    const u = String(url);
    const body = u.indexOf('/jobs') >= 0 ? jobs : {};
    return Promise.resolve({ ok: true, json: function () { return Promise.resolve(body); } });
  };
  global.fetch = stub; window.fetch = stub;
  global.EventSource = undefined; window.EventSource = undefined;
  // eslint-disable-next-line no-eval
  (0, eval)(buildCrawlStatusClientScript({}));
}

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

describe('crawl-status client rendering', () => {
  it('keeps Visited as the 4th <td> of the main row (Electron E2E invariant)', async () => {
    bootClient(JOBS);
    await flush();
    const firstRow = document.querySelector('#rows tr');
    const cell4 = document.querySelector('#rows tr td:nth-child(4)');
    expect(firstRow.querySelectorAll('td').length).toBe(9);
    expect(cell4.textContent).toBe('33'); // done-1 is first, visited 33
  });

  it('shows a "fetching sitemaps" phase badge on the running job only', async () => {
    bootClient(JOBS);
    await flush();
    const badges = document.querySelectorAll('.phase-badge');
    expect(badges.length).toBe(1); // only the running job
    expect(badges[0].getAttribute('data-phase')).toBe('sitemaps');
    expect(badges[0].textContent).toBe('fetching sitemaps');
  });

  it('renders a detail row per job, hidden by default, revealing which sitemaps', async () => {
    bootClient(JOBS);
    await flush();
    const detailRows = document.querySelectorAll('tr.detail-row');
    expect(detailRows.length).toBe(2);
    expect(Array.from(detailRows).every((r) => r.hidden === true)).toBe(true);
    // the running job's panel lists the actual sitemap files
    const runDetail = document.querySelector('#detail-run-1');
    // Sitemaps is the first detail block; scope to it (In-flight also uses .detail-list).
    const sitemapBlock = runDetail.querySelector('.detail-block:first-child');
    const sitemapItems = sitemapBlock.querySelectorAll('.detail-sitemaps li');
    expect(sitemapItems.length).toBe(2);
    expect(sitemapItems[0].textContent).toContain('https://x/sitemap.xml');
    expect(sitemapBlock.querySelector('.sm-fetched')).toBeTruthy(); // first sitemap fetched
    expect(sitemapBlock.querySelector('.sm-pending')).toBeTruthy(); // second still pending
    expect(runDetail.textContent).toContain('1 of 2 sitemap(s) fetched');
    expect(runDetail.textContent).toContain('5096 URLs enqueued');
    expect(runDetail.textContent).toContain('x.example'); // per-host limits
    expect(runDetail.querySelector('.badge-limited')).toBeTruthy(); // rateLimited: true
  });

  it('expands only the clicked job and updates aria-expanded + caret', async () => {
    bootClient(JOBS);
    await flush();
    const toggles = document.querySelectorAll('[data-detail-toggle]');
    toggles[1].click(); // running job
    const detailRows = document.querySelectorAll('tr.detail-row');
    expect(detailRows[0].hidden).toBe(true);   // done-1 stays closed
    expect(detailRows[1].hidden).toBe(false);  // run-1 opens
    expect(toggles[1].getAttribute('aria-expanded')).toBe('true');
    expect(toggles[1].textContent).toBe('▾');
    expect(toggles[0].getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps an expanded panel open across a full #rows rebuild (persistence)', async () => {
    bootClient(JOBS);
    await flush();
    document.querySelectorAll('[data-detail-toggle]')[1].click(); // expand run-1
    const beforeNode = document.querySelector('#detail-run-1');
    expect(beforeNode.hidden).toBe(false);

    // Trigger a full rebuild the way the 3s poll does — via the Refresh button.
    document.querySelector('[data-refresh-crawls]').click();
    await flush();

    const afterNode = document.querySelector('#detail-run-1');
    expect(afterNode).not.toBe(beforeNode);   // proves innerHTML was rebuilt
    expect(afterNode.hidden).toBe(false);      // still open after rebuild
    expect(document.querySelector('#detail-done-1').hidden).toBe(true);
  });

  it('drops a finished job from the expanded set so it cannot resurface', async () => {
    bootClient(JOBS);
    await flush();
    document.querySelectorAll('[data-detail-toggle]')[1].click(); // expand run-1
    expect(document.querySelector('#detail-run-1').hidden).toBe(false);

    // Next poll returns only the completed job — run-1 is gone.
    const stub = function (url) {
      const u = String(url);
      const body = u.indexOf('/jobs') >= 0 ? { items: [JOBS.items[0]] } : {};
      return Promise.resolve({ ok: true, json: function () { return Promise.resolve(body); } });
    };
    global.fetch = stub; window.fetch = stub;
    document.querySelector('[data-refresh-crawls]').click();
    await flush();

    expect(document.querySelector('#detail-run-1')).toBeNull(); // run-1 no longer rendered
    // and if run-1 reappears later, it must be collapsed (not silently re-expanded)
    global.fetch = window.fetch = function (url) {
      const u = String(url);
      const body = u.indexOf('/jobs') >= 0 ? JOBS : {};
      return Promise.resolve({ ok: true, json: function () { return Promise.resolve(body); } });
    };
    document.querySelector('[data-refresh-crawls]').click();
    await flush();
    expect(document.querySelector('#detail-run-1').hidden).toBe(true);
  });

  it('gives the in-flight empty state phase-aware wording (crawling = a sample, not idle)', async () => {
    const jobs = { items: [
      { id: 'crawl-1', status: 'running', progress: { phase: 'crawling', visited: 5, currentDownloads: [], currentDownloadsCount: 0 } },
      { id: 'prep-1', status: 'running', progress: { phase: 'preparing', visited: 0, currentDownloads: [], currentDownloadsCount: 0 } }
    ] };
    bootClient(jobs);
    await flush();
    // in-flight is the 2nd detail block
    const crawlInflight = document.querySelector('#detail-crawl-1 .detail-block:nth-child(2)');
    const prepInflight = document.querySelector('#detail-prep-1 .detail-block:nth-child(2)');
    expect(crawlInflight.textContent).toContain('caught in this sample');
    expect(prepInflight.textContent).toContain('None in flight');
  });

  it('renders the empty state with the 9-column colspan when there are no jobs', async () => {
    bootClient({ items: [] });
    await flush();
    const empty = document.querySelector('#rows td.empty');
    expect(empty).toBeTruthy();
    expect(empty.getAttribute('colspan')).toBe('9');
  });

  // Owner-reported (cycle 69): "Saved docs/s appears to be wrong." Finished jobs'
  // final progress snapshots freeze non-zero rate fields (typically a terminal
  // reconcile where saved jumps), and the strip summed rates across ALL jobs —
  // so completed jobs displayed as phantom throughput long after crawls ended.
  // renderThroughput must sum ACTIVE jobs only.
  describe('throughput strip sums ACTIVE jobs only (phantom-rate guard)', () => {
    const stat = (key) => document.querySelector('[data-crawl-throughput-stat="' + key + '"]').textContent;

    it('a completed job with frozen ghost rates contributes NOTHING to the strip', async () => {
      const jobs = { items: [
        { id: 'ghost-1', status: 'completed', finishedAt: '2026-07-21T22:01:00.000Z',
          progress: { visited: 6, downloaded: 6, saved: 6, queued: 4,
            docsDownloadedPerSec: 0, docsSavedPerSec: 1.47, networkMbPerSec: 0.3, savedMbPerSec: 0.12 } },
        { id: 'live-1', status: 'running',
          progress: { visited: 2, downloaded: 2, saved: 1, queued: 7,
            docsDownloadedPerSec: 0.5, docsSavedPerSec: 0.25, networkMbPerSec: 0.8, savedMbPerSec: 0.1 } }
      ] };
      bootClient(jobs);
      await flush();
      expect(stat('saved')).toBe('0.25');       // live-1 only — ghost-1's 1.47 excluded
      expect(stat('downloaded')).toBe('0.50');
      expect(stat('network')).toBe('0.80');
      expect(stat('queue')).toBe('7');          // completed job's stale queued=4 excluded too
    });

    it('with ONLY finished jobs, every stat reads zero (idle truth)', async () => {
      const jobs = { items: [
        { id: 'g1', status: 'completed', finishedAt: 't', progress: { queued: 4, docsSavedPerSec: 1.47, networkMbPerSec: 0.3 } },
        { id: 'g2', status: 'failed', finishedAt: 't', progress: { queued: 2, docsSavedPerSec: 2.46, savedMbPerSec: 0.2 } }
      ] };
      bootClient(jobs);
      await flush();
      expect(stat('saved')).toBe('0.00');
      expect(stat('downloaded')).toBe('0.00');
      expect(stat('network')).toBe('0.00');
      expect(stat('stored')).toBe('0.00');
      expect(stat('queue')).toBe('0');
    });
  });
});
