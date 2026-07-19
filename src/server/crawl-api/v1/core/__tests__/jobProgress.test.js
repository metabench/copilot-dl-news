'use strict';

/**
 * jobProgress tracker — turns crawler 'progress' events into the per-job
 * snapshot the crawl status page reads (jobs table, throughput strip,
 * remote-fetch strip), including inside the Electron unified app.
 */

const { createJobProgressTracker } = require('../jobProgress');
const { InProcessCrawlJobRegistry } = (() => {
  try { return require('../InProcessCrawlJobRegistry'); } catch (_) { return {}; }
})();
const { EventEmitter } = require('events');

function crawlerPayload({ visited, downloaded, saved = 0, errors = 0, bytes = 0, bytesSaved = 0, queueSize, remoteFetch } = {}) {
  return {
    stats: {
      pagesVisited: visited,
      pagesDownloaded: downloaded,
      articlesFound: saved,
      articlesSaved: saved,
      errors,
      bytesDownloaded: bytes,
      bytesSaved
    },
    paused: false,
    abortRequested: false,
    ...(queueSize != null ? { queueSize } : {}),
    ...(remoteFetch ? { remoteFetch } : {})
  };
}

describe('createJobProgressTracker', () => {
  it('normalizes crawler stats into the keys the crawl status page reads', () => {
    const tracker = createJobProgressTracker();
    const snap = tracker.record(crawlerPayload({
      visited: 12, downloaded: 10, saved: 4, errors: 1,
      bytes: 2 * 1024 * 1024, bytesSaved: 1024 * 1024, queueSize: 33
    }));
    expect(snap.visited).toBe(12);
    expect(snap.downloaded).toBe(10);
    expect(snap.saved).toBe(4);
    expect(snap.errors).toBe(1);
    expect(snap.queued).toBe(33);
    expect(snap.updatedAt).toBeTruthy();
  });

  it('computes rates from deltas between events', () => {
    let clock = 0;
    const tracker = createJobProgressTracker({ now: () => clock });
    tracker.record(crawlerPayload({ visited: 0, downloaded: 0, bytes: 0 }));
    clock = 2000; // +2s
    const snap = tracker.record(crawlerPayload({
      visited: 20, downloaded: 20, bytes: 4 * 1024 * 1024, saved: 10, bytesSaved: 2 * 1024 * 1024
    }));
    expect(snap.docsDownloadedPerSec).toBeCloseTo(10, 5);
    expect(snap.networkMbPerSec).toBeCloseTo(2, 5);
    expect(snap.docsSavedPerSec).toBeCloseTo(5, 5);
    expect(snap.savedMbPerSec).toBeCloseTo(1, 5);
  });

  it('retains last rates within the minimum window (no flicker to zero)', () => {
    let clock = 0;
    const tracker = createJobProgressTracker({ now: () => clock });
    tracker.record(crawlerPayload({ downloaded: 0, bytes: 0 }));
    clock = 1000;
    tracker.record(crawlerPayload({ downloaded: 10, bytes: 1024 * 1024 }));
    clock = 1100; // only 100ms later — below window
    const snap = tracker.record(crawlerPayload({ downloaded: 11, bytes: 1100 * 1024 }));
    expect(snap.docsDownloadedPerSec).toBeCloseTo(10, 5); // retained
  });

  it('passes remoteFetch telemetry through for the remote-fetch strip', () => {
    const tracker = createJobProgressTracker();
    const rf = { enabled: true, workerUrl: 'http://oracle:8081', healthy: true, requestsOk: 5 };
    const snap = tracker.record(crawlerPayload({ visited: 1, downloaded: 1, remoteFetch: rf }));
    expect(snap.remoteFetch).toEqual(rf);
  });

  it('accepts schema-shaped payloads too', () => {
    const tracker = createJobProgressTracker();
    const snap = tracker.record({ visited: 7, downloaded: 6, errors: 0, queued: 4 });
    expect(snap.visited).toBe(7);
    expect(snap.queued).toBe(4);
  });

  it('passes through the phase + sitemap + detail fields for the crawl-status UI', () => {
    const tracker = createJobProgressTracker();
    const snap = tracker.record({
      ...crawlerPayload({ visited: 0, downloaded: 0, queueSize: 5000 }),
      phase: 'sitemaps',
      sitemaps: [{ url: 'https://x/sitemap.xml', status: 'fetched' }, 'https://x/news-sitemap.xml'],
      sitemapCount: 2,
      sitemapsFetched: 1,
      sitemapEnqueued: 5000,
      currentDownloads: [{ url: 'https://x/a', ageMs: 120 }],
      currentDownloadsCount: 1,
      perHostLimits: { 'x': { rateLimited: false, limit: 30, intervalMs: 2000, backoffMs: null } },
      robots: { loaded: true, source: 'network', crawlDelaySeconds: null, politenessFloorMs: null }
    });
    expect(snap.phase).toBe('sitemaps');
    // objects pass through; a bare-string entry is normalized to { url, status:null }
    expect(snap.sitemaps).toEqual([
      { url: 'https://x/sitemap.xml', status: 'fetched' },
      { url: 'https://x/news-sitemap.xml', status: null }
    ]);
    expect(snap.sitemapCount).toBe(2);
    expect(snap.sitemapsFetched).toBe(1);
    expect(snap.sitemapEnqueued).toBe(5000);
    expect(snap.currentDownloads).toEqual([{ url: 'https://x/a', ageMs: 120 }]);
    expect(snap.currentDownloadsCount).toBe(1);
    expect(snap.perHostLimits).toEqual({ 'x': { rateLimited: false, limit: 30, intervalMs: 2000, backoffMs: null } });
    expect(snap.robots).toEqual({ loaded: true, source: 'network', crawlDelaySeconds: null, politenessFloorMs: null });
  });

  it('omits the detail keys entirely when the crawler does not emit them (back-compat)', () => {
    const tracker = createJobProgressTracker();
    const snap = tracker.record(crawlerPayload({ visited: 3, downloaded: 2 }));
    expect(snap.phase).toBeUndefined();
    expect(snap.sitemaps).toBeUndefined();
    expect(snap.currentDownloads).toBeUndefined();
    expect(snap.perHostLimits).toBeUndefined();
    expect(snap.robots).toBeUndefined();
  });

  it('caps the sitemaps array defensively (history-bloat guard)', () => {
    const tracker = createJobProgressTracker();
    const many = Array.from({ length: 80 }, (_v, i) => 'https://x/sitemap-' + i + '.xml');
    const snap = tracker.record({ ...crawlerPayload({ visited: 1, downloaded: 1 }), sitemaps: many });
    expect(snap.sitemaps.length).toBe(50);
  });
});

(InProcessCrawlJobRegistry ? describe : describe.skip)('InProcessCrawlJobRegistry job progress', () => {
  it('exposes live progress on list()/get() after crawler progress events', () => {
    const registry = new InProcessCrawlJobRegistry({ allowMultiJobs: true });
    const job = { id: 'job-1', status: 'running' };
    registry._jobs.set(job.id, job);

    const fakeCrawler = new EventEmitter();
    registry._attachJobProgress(job, fakeCrawler);

    // Before any events: progress is null.
    expect(registry.get('job-1').progress).toBeNull();

    fakeCrawler.emit('progress', crawlerPayload({
      visited: 42, downloaded: 40, errors: 2, queueSize: 9,
      remoteFetch: { enabled: true, workerUrl: 'http://oracle:8081', requestsOk: 40 }
    }));

    const listed = registry.list().find((j) => j.id === 'job-1');
    expect(listed.progress.visited).toBe(42);
    expect(listed.progress.downloaded).toBe(40);
    expect(listed.progress.errors).toBe(2);
    expect(listed.progress.queued).toBe(9);
    expect(listed.progress.remoteFetch.workerUrl).toBe('http://oracle:8081');
  });

  it('attaches only once per job', () => {
    const registry = new InProcessCrawlJobRegistry({ allowMultiJobs: true });
    const job = { id: 'job-2', status: 'running' };
    registry._jobs.set(job.id, job);
    const fakeCrawler = new EventEmitter();
    registry._attachJobProgress(job, fakeCrawler);
    registry._attachJobProgress(job, fakeCrawler);
    expect(fakeCrawler.listenerCount('progress')).toBe(1);
  });
});
